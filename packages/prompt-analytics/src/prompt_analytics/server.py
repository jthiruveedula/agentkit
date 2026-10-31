"""Loopback-only static server for the exported dashboard."""

from __future__ import annotations

import gzip
import hmac
import json
import re
import secrets
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from . import scan, store
from .config import Config

HOST = "127.0.0.1"  # literal on purpose: not configurable
CSP = ("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; "
       "form-action 'none'; frame-ancestors 'none'")


_ANALYZE_LOCK = threading.Lock()  # one re-analysis at a time


class _Handler(SimpleHTTPRequestHandler):
    def parse_request(self) -> bool:
        if not super().parse_request():
            return False
        port = self.server.server_address[1]
        if self.headers.get("Host") not in (f"127.0.0.1:{port}", f"localhost:{port}"):
            self.send_error(400, "Bad Host header")  # DNS-rebinding guard
            return False
        return True

    # ---- local exposure-review API (token-gated; raw values only ever in the response body) ----
    def _json(self, code: int, obj: Any) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authed(self) -> bool:
        tok = self.headers.get("X-PA-Token") or ""
        if hmac.compare_digest(tok.encode(), self.server.token.encode()):  # type: ignore[attr-defined]
            return True
        self._json(403, {"error": "forbidden"})
        return False

    def _body(self) -> dict | None:
        """Checked JSON object body (type, length <= 1 KiB); sends the error response and returns None on failure."""
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            self._json(415, {"error": "application/json required"})
            return None
        try:
            n = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._json(411, {"error": "length required"})
            return None
        if n > 1024:
            self._json(413, {"error": "body too large"})
            return None
        try:
            body = json.loads(self.rfile.read(n))
        except ValueError:
            body = None
        if not isinstance(body, dict):
            self._json(400, {"error": "bad body"})
            return None
        return body

    def _analyze(self) -> None:
        """POST /api/analyze {mode}: re-run analyze + export at that tier, return the new dashboard.json."""
        from . import analyze, capabilities, export

        cfg = self.server.cfg  # type: ignore[attr-defined]
        body = self._body()
        if body is None:
            return
        mode = body.get("mode", "auto")
        if mode not in ("auto", *capabilities.MODES):
            return self._json(400, {"error": "bad mode"})
        avail = capabilities.probe(cfg.models_dir, mode)["available"]
        if mode != "auto" and mode not in avail:
            return self._json(409, {"error": f"mode {mode} not available", "available": avail})
        with _ANALYZE_LOCK:
            con = store.connect(cfg)
            try:
                analyze.run(cfg, con, mode)
                data = export.build(con, cfg)
                export.write(cfg, data, cfg.export_dir)
            except export.ExportBlocked:
                return self._json(500, {"error": "export blocked by privacy gate"})
            finally:
                con.close()
        self._json(200, data)

    def _index(self) -> bool:
        p = Path(self.directory) / "index.html"
        if not p.is_file():
            return False
        html = p.read_text(encoding="utf-8")
        meta = f'<meta name="pa-token" content="{self.server.token}">'  # type: ignore[attr-defined]
        html, n = re.subn(r"(?i)<head[^>]*>", lambda m: m.group(0) + meta, html, count=1)
        body = (html if n else meta + html).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Vary", "Accept-Encoding")
        if "gzip" in self.headers.get("Accept-Encoding", ""):  # ~490 kB page; gzip cuts it to ~165 kB
            body = gzip.compress(body, 6)
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return True

    def _api(self, method: str) -> None:
        parts = [unquote(x) for x in urlsplit(self.path).path.split("/")]
        # ['', 'api', 'exposure', id] or [..., id, 'review'], or ['', 'api', 'analyze']
        if parts == ["", "api", "analyze"]:
            if method != "POST":
                return self._json(405, {"error": "method not allowed"})
            return self._analyze() if self._authed() else None
        if parts[:3] != ["", "api", "exposure"] or len(parts) not in (4, 5) or not parts[3]:
            return self._json(404, {"error": "not found"})
        if not self._authed():
            return
        tid = parts[3]
        con = store.connect(self.server.cfg)  # type: ignore[attr-defined]
        try:
            if not con.execute("SELECT 1 FROM exposures WHERE turn_id=? LIMIT 1", [tid]).fetchone():
                return self._json(404, {"error": "unknown turn"})
            if len(parts) == 4 and method == "GET":
                found = scan.reveal(self.server.cfg, con, tid, self.server.adapters)  # type: ignore[attr-defined]
                if found is None:
                    return self._json(404, {"error": "source gone or changed"})
                return self._json(200, {"findings": found})
            if len(parts) == 5 and parts[4] == "review" and method == "POST":
                body = self._body()
                if body is None:
                    return
                try:
                    store.set_review(con, tid, body.get("status"))
                except (ValueError, AttributeError, TypeError):
                    return self._json(400, {"error": "bad body"})
                return self._json(200, {"ok": True})
            return self._json(405, {"error": "method not allowed"})
        finally:
            con.close()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            return self._api("GET")
        if path in ("/", "/index.html") and self._index():
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlsplit(self.path).path.startswith("/api/"):
            return self._api("POST")
        self.send_error(405)

    def end_headers(self) -> None:
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def list_directory(self, path: Any) -> Any:
        self.send_error(404, "Not found")
        return None

    def log_message(self, format: str, *args: Any) -> None:
        pass


def make_server(cfg: Config, port: int = 0, directory: Path | None = None, adapters: list[Any] | None = None) -> ThreadingHTTPServer:
    """Bind 127.0.0.1:<port> serving only ``directory`` (default: the export dir). Does not export."""
    d = Path(directory or cfg.export_dir)
    srv = ThreadingHTTPServer((HOST, port), partial(_Handler, directory=str(d)))
    srv.daemon_threads = True
    srv.cfg, srv.adapters = cfg, adapters  # type: ignore[attr-defined]
    srv.token = secrets.token_urlsafe(32)  # per run, memory only  # type: ignore[attr-defined]
    return srv


def serve(cfg: Config, port: int = 0, open_browser: bool = True) -> None:
    index = cfg.export_dir / "index.html"
    try:
        from . import export, store

        con = store.connect(cfg)
        try:
            export.write(cfg, export.build(con, cfg), cfg.export_dir)
        finally:
            con.close()
    except ImportError:
        if not index.is_file():
            raise RuntimeError("export module unavailable and no previous export found") from None
    srv = make_server(cfg, port)
    url = f"http://{HOST}:{srv.server_address[1]}/"
    print(f"Serving {url} (Ctrl-C to stop)", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
