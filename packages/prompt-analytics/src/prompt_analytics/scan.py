"""discover -> watermark check -> parse -> redact+store, per adapter."""

from __future__ import annotations

import importlib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from . import store
from .adapters.base import Health, SourceAdapter, SourceFile
from .config import Config
from .privacy import RULES_VERSION, block_network, harden_tree, hmac_hex

MAX_WARNINGS = 20
_CHUNK = 1 << 20


@dataclass
class SourceReport:
    source: str
    status: str = "ok"
    files_seen: int = 0
    parsed: int = 0
    skipped: int = 0
    sessions: int = 0
    warnings: list[str] = field(default_factory=list)  # first MAX_WARNINGS
    n_warnings: int = 0

    def warn(self, msg: str) -> None:
        self.n_warnings += 1
        if len(self.warnings) < MAX_WARNINGS:
            self.warnings.append(msg)


@dataclass
class ScanReport:
    sources: dict[str, SourceReport] = field(default_factory=dict)
    outcomes: dict[str, Any] = field(default_factory=dict)
    # category -> {sessions, kinds: {kind: sessions}} over the whole store
    exposures: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _load_adapters() -> list[SourceAdapter]:
    from .adapters.base import all_adapters

    try:
        return all_adapters()
    except ImportError:  # one adapter module missing/broken: load the rest
        out: list[SourceAdapter] = []
        for mod, cls in (("claude_code", "ClaudeCodeAdapter"), ("copilot", "CopilotAdapter"),
                         ("cursor", "CursorAdapter"), ("opencode", "OpencodeAdapter"),
                         ("antigravity", "AntigravityAdapter")):
            try:
                out.append(getattr(importlib.import_module(f"prompt_analytics.adapters.{mod}"), cls)())
            except Exception:
                pass
        return out


def check_health(a: SourceAdapter) -> Health:
    """Adapter health; an exception becomes status 'unsupported', never escapes."""
    try:
        return a.health()
    except Exception as e:
        return Health(source=getattr(a, "name", "?"), status="unsupported",
                      messages=[f"health check failed: {type(e).__name__}: {e}"])


def _file_hmac(salt: bytes, f: SourceFile) -> str:
    import hashlib
    import hmac

    if f.marker is not None:
        return hmac_hex(salt, f.marker.encode())
    if f.key != str(f.path):  # DB-backed unit without a marker: size/mtime is all we have
        return hmac_hex(salt, f"{f.size}:{f.mtime_ns}".encode())
    h = hmac.new(salt, digestmod=hashlib.sha256)
    with f.path.open("rb") as fh:
        while chunk := fh.read(_CHUNK):
            h.update(chunk)
    return h.hexdigest()


def run(cfg: Config, sources: list[str] | None = None, full: bool = False,
        progress: Callable[[str], None] | None = None,
        adapters: list[SourceAdapter] | None = None) -> ScanReport:
    block_network()
    report = ScanReport()
    ctx = store.make_ctx(cfg)
    con = store.connect(cfg)
    try:
        for a in (adapters if adapters is not None else _load_adapters()):
            name = a.name
            if sources and name not in sources:
                continue
            if cfg.sources is not None and name not in cfg.sources:
                continue
            rep = report.sources[name] = SourceReport(name)
            _scan_one(con, ctx, a, rep, full, progress)
        if (cfg.outcomes or {}).get("enabled", True):
            try:
                from . import outcomes

                report.outcomes = outcomes.collect(con, cfg)
            except Exception as e:
                report.outcomes = {"warnings": [f"outcomes failed: {type(e).__name__}: {e}"]}
        try:
            summ = store.exposure_summary(con)["categories"]
            report.exposures = {c: {"sessions": v["sessions"], "kinds": {k: x["sessions"] for k, x in v["kinds"].items()},
                                    "advice": v["advice"]} for c, v in summ.items()}
        except Exception as e:
            report.outcomes.setdefault("warnings", []).append(f"exposure summary failed: {type(e).__name__}")
    finally:
        con.close()
        harden_tree(cfg.data_dir)
    return report


def _scan_one(con: Any, ctx: store.StoreCtx, a: SourceAdapter, rep: SourceReport, full: bool,
              progress: Callable[[str], None] | None) -> None:
    name = a.name
    health = check_health(a)
    rep.status = health.status
    files: list[SourceFile] = []
    if health.status in ("ok", "degraded"):
        try:
            files = a.discover()
        except Exception as e:
            rep.warn(f"discover failed: {type(e).__name__}: {e}")
    rep.files_seen = len(files)
    for i, f in enumerate(files):
        if progress:
            progress(f"{name} {i + 1}/{len(files)}")
        try:
            wm = None if full else store.watermark_get(con, name, f.key, ctx)
            same_rules = wm is not None and wm.rules_version == RULES_VERSION
            if wm and same_rules and f.marker is None and (wm.size, wm.mtime_ns) == (f.size, f.mtime_ns):
                rep.skipped += 1
                continue
            digest = _file_hmac(ctx.salt, f)
            if wm and same_rules and wm.content_hmac == digest:
                store.watermark_set(con, name, f.key, ctx, f.size, f.mtime_ns, digest, RULES_VERSION)
                rep.skipped += 1
                continue
            batch = a.parse(f)
            for w in batch.warnings:
                rep.warn(w)
            store.replace_batch(con, name, f.key, batch, ctx)
            store.watermark_set(con, name, f.key, ctx, f.size, f.mtime_ns, digest, RULES_VERSION)
            rep.parsed += 1
            rep.sessions += len(batch.sessions)
        except Exception as e:
            rep.warn(f"{f.path.name}: {type(e).__name__}: {e}")
    store.upsert_health(con, health, ctx, rep.warnings)


def reveal(cfg: Config, con: Any, turn_id: str, adapters: list[SourceAdapter] | None = None) -> list[dict[str, str]] | None:
    """Re-read the raw prompt from its source file and return finding contexts.

    Returns None when the turn is unknown, or its source file is gone or changed.
    The result holds RAW values: show it, never store or log it.
    """
    row = con.execute("SELECT s.source, s.source_key FROM exposures e JOIN sessions s USING (session_id) "
                      "WHERE e.turn_id=? LIMIT 1", [turn_id]).fetchone()
    if not row:
        return None
    source, kid = row
    ctx = store.make_ctx(cfg)
    for a in (adapters if adapters is not None else _load_adapters()):
        if a.name != source:
            continue
        try:
            for f in a.discover():
                if store.key_id(ctx.salt, source, f.key) != kid:
                    continue
                for t in a.parse(f).turns:
                    if t.turn_id == turn_id and ctx.detector is not None:
                        return ctx.detector.reveal(t.text)
        except Exception:
            return None
    return None
