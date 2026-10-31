"""GitHub Copilot Chat (VS Code family) adapter: replays the JSONL mutation log."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from ..schema import CodeEdit, ParsedBatch, Session, ToolCall, Turn
from ._vscode import estimate_tokens, item_value, ms_to_dt, open_ro, uri_to_path, workspace_folder
from .base import Health, SourceFile, stat_file, user_data_dirs

APPS = ("Code", "Code - Insiders", "VSCodium")
INDEX_KEY = "chat.ChatSessionStore.index"
STATUS = {1: "ok", 2: "cancelled", 3: "error"}
EVENT_STATE = {1: "accepted", 2: "rejected", 3: "accepted"}
SNAP_STATE = {0: "pending", 1: "accepted", 2: "rejected"}


def _walk(root, path):
    cur = root
    for p in path:
        cur = cur[p]
    return cur


def replay(lines) -> dict | None:
    """Apply the mutation log; malformed lines are counted by caller via exceptions."""
    state = None
    for line in lines:
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        kind, k, v = d.get("kind"), d.get("k"), d.get("v")
        if kind == 0:
            state = v
        elif state is None or not isinstance(k, list):
            continue
        elif kind in (1, 2, 3):
            try:
                if not k:
                    continue
                parent, last = _walk(state, k[:-1]), k[-1]
                if kind == 1:
                    parent[last] = v
                elif kind == 3:
                    del parent[last]
                else:
                    arr = parent[last]
                    if d.get("i") is not None:
                        del arr[d["i"]:]
                    arr.extend(v or [])
            except (KeyError, IndexError, TypeError):
                continue
    return state if isinstance(state, dict) else None


def _txt(parts) -> str:
    out = []
    for p in parts or []:
        if isinstance(p, dict) and "kind" not in p:
            val = p.get("value")
            if isinstance(val, str):
                out.append(val)
    return "".join(out)


def _mode(m) -> str | None:
    if isinstance(m, str):
        return m
    if isinstance(m, dict):
        for k in ("kind", "modeId", "id", "modeName"):
            if isinstance(m.get(k), str):
                return m[k]
    return None


def _n(x):
    return x if isinstance(x, int) and not isinstance(x, bool) else None


class CopilotAdapter:
    name = "copilot"

    def __init__(self) -> None:
        self._index: dict[Path, dict] = {}

    # ---- helpers
    def _user_dirs(self) -> list[Path]:
        return [u for app in APPS for u in user_data_dirs(app)]

    def _load_index(self, user: Path, warnings: list[str] | None = None) -> dict:
        if user in self._index:
            return self._index[user]
        entries: dict = {}
        db = user / "globalStorage" / "state.vscdb"
        if db.is_file():
            try:
                conn = open_ro(db)
                try:
                    raw = item_value(conn, INDEX_KEY)
                finally:
                    conn.close()
                e = (json.loads(raw) or {}).get("entries") if raw else None
                entries = e if isinstance(e, dict) else {}
            except Exception as ex:  # noqa: BLE001
                if warnings is not None:
                    warnings.append(f"copilot: index unreadable ({type(ex).__name__})")
        self._index[user] = entries
        return entries

    def _files(self) -> list[tuple[Path, Path, Path | None]]:
        """(file, user_dir, workspace_dir|None)."""
        out = []
        for u in self._user_dirs():
            groups = [(ws, ws / "chatSessions") for ws in sorted((u / "workspaceStorage").glob("*"))]
            groups.append((None, u / "globalStorage" / "emptyWindowChatSessions"))
            for ws, d in groups:
                if not d.is_dir():
                    continue
                seen = set()
                for f in sorted(d.glob("*.jsonl")) + sorted(d.glob("*.json")):
                    if f.stem in seen or not f.is_file():
                        continue
                    seen.add(f.stem)
                    out.append((f, u, ws))
        return out

    def discover(self) -> list[SourceFile]:
        res = []
        for f, _, _ in self._files():
            try:
                res.append(stat_file(self.name, f))
            except OSError:
                pass
        return res

    # ---- parse
    def parse(self, f: SourceFile) -> ParsedBatch:
        b = ParsedBatch()
        try:
            self._parse(f, b)
        except Exception as ex:  # noqa: BLE001
            b.warnings.append(f"copilot: {f.path.name}: {type(ex).__name__}")
        return b

    def _load(self, f: SourceFile, b: ParsedBatch) -> dict | None:
        try:
            if f.path.suffix == ".json":
                d = json.loads(f.path.read_text("utf-8"))
                return d if isinstance(d, dict) else None
            with f.path.open(encoding="utf-8", errors="replace") as fh:
                return replay(fh)
        except (OSError, ValueError) as ex:
            b.warnings.append(f"copilot: {f.path.name}: unreadable ({type(ex).__name__})")
            return None

    def _parse(self, f: SourceFile, b: ParsedBatch) -> None:
        p = f.path
        user = next((u for u in self._user_dirs() if u in p.parents), None)
        ws = p.parent.parent if p.parent.name == "chatSessions" else None
        data = self._load(f, b)
        if not data:
            if not b.warnings:
                b.warnings.append(f"copilot: {p.name}: empty session state")
            return
        sid_raw = data.get("sessionId") or p.stem
        idx = self._load_index(user, b.warnings).get(sid_raw) if user else None
        idx = idx if isinstance(idx, dict) else {}
        if idx.get("isExternal"):
            b.warnings.append("copilot: skipped 1 external session")
            return
        sid = f"copilot:{sid_raw}"
        title = data.get("customTitle") or idx.get("title") or None
        sess = Session(
            session_id=sid, source=self.name, source_key=f.key, title=title,
            project_path=workspace_folder(ws) if ws else None,
            started_at=ms_to_dt(data.get("creationDate")),
            mode=_mode((data.get("inputState") or {}).get("mode")),
        )
        edit_states = self._snapshot_states(ws, sid_raw)
        models: Counter = Counter()
        end_ms = _n(data.get("creationDate")) or 0
        ti = 0
        for ri, req in enumerate(data.get("requests") or []):
            if not isinstance(req, dict):
                continue
            ts_ms = _n(req.get("timestamp"))
            ts = ms_to_dt(ts_ms)
            result = req.get("result") if isinstance(req.get("result"), dict) else {}
            meta = result.get("metadata") if isinstance(result.get("metadata"), dict) else {}
            timings = result.get("timings") if isinstance(result.get("timings"), dict) else {}
            lat = _n(timings.get("totalElapsed"))
            if lat is None:
                lat = _n(req.get("elapsedMs"))
            if ts_ms:
                end_ms = max(end_ms, ts_ms + (lat or 0))
            sess.mode = _mode(req.get("modeInfo")) or sess.mode
            msg = req.get("message")
            utext = msg.get("text") if isinstance(msg, dict) else None
            utid = f"{sid}:{ri}:u"
            atid = f"{sid}:{ri}:a"
            b.turns.append(Turn(utid, sid, ti, "user", ts, utext))
            ti += 1
            atext = _txt(req.get("response"))
            tin = _n(meta.get("promptTokens"))
            tout = _n(meta.get("outputTokens"))
            if tin is None and tout is None:
                tin, tout = _n(req.get("promptTokens")), _n(req.get("completionTokens"))
            if tin is None and tout is None:
                tin, tout = estimate_tokens(utext), estimate_tokens(atext)
                sess.tokens_estimated = True
            model = meta.get("resolvedModel") or req.get("modelId")
            if model:
                models[model] += 1
            ms = req.get("modelState") if isinstance(req.get("modelState"), dict) else {}
            status = STATUS.get(ms.get("value"), "ok")
            if result.get("errorDetails"):
                status = "error"
            b.turns.append(Turn(atid, sid, ti, "assistant", ts, atext, model, tin, tout,
                                latency_ms=lat, status=status))
            ti += 1
            events = {}
            for ev in req.get("editedFileEvents") or []:
                if isinstance(ev, dict):
                    u = ev.get("uri")
                    u = u.get("path") or u.get("fsPath") if isinstance(u, dict) else u
                    events[str(u)] = EVENT_STATE.get(ev.get("eventKind"))
            for pi, part in enumerate(req.get("response") or []):
                if not isinstance(part, dict):
                    continue
                k = part.get("kind")
                if k == "toolInvocationSerialized":
                    ok = part.get("isComplete") and not part.get("isError") and not part.get("errorDetails")
                    name = part.get("toolId") or "unknown"
                    b.tool_calls.append(ToolCall(
                        part.get("toolCallId") or f"{sid}:{ri}:t{pi}", sid, atid, name, ts,
                        status="ok" if ok else "pending" if not part.get("isComplete") else "error"))
                elif k == "textEditGroup":
                    uri = part.get("uri")
                    path = (uri.get("path") or uri.get("fsPath")) if isinstance(uri, dict) else uri
                    path = uri_to_path(path) or path if isinstance(path, str) else None
                    added = sum(
                        (e.get("text") or "").count("\n") + 1
                        for grp in (part.get("edits") or []) if isinstance(grp, list)
                        for e in grp if isinstance(e, dict) and e.get("text"))
                    state = events.get(str(path)) or edit_states.get(path or "") or "unknown"
                    b.code_edits.append(CodeEdit(f"{sid}:{ri}:e{pi}", sid, atid, path, added, None, state, ts))
        sess.ended_at = ms_to_dt(end_ms)
        sess.model = models.most_common(1)[0][0] if models else None
        b.sessions.append(sess)

    @staticmethod
    def _snapshot_states(ws: Path | None, sid: str) -> dict[str, str]:
        out: dict[str, str] = {}
        if ws is None:
            return out
        try:
            st = json.loads((ws / "chatEditingSessions" / sid / "state.json").read_text("utf-8"))
            for e in ((st.get("recentSnapshot") or {}).get("entries") or []):
                u = e.get("resource") or e.get("uri")
                path = uri_to_path(u) if isinstance(u, str) else None
                if path and e.get("state") in SNAP_STATE:
                    out[path] = SNAP_STATE[e["state"]]
        except (OSError, ValueError, AttributeError):
            pass
        return out

    # ---- health
    def health(self) -> Health:
        files = self._files()
        if not files:
            return Health(self.name, "missing")
        h = Health(self.name, "ok", sessions_found=len(files))
        versions, bad = set(), 0
        for f, _, _ in files[:200]:
            try:
                if f.suffix == ".json":
                    d = json.loads(f.read_text("utf-8"))
                else:
                    with f.open(encoding="utf-8", errors="replace") as fh:
                        d = json.loads(fh.readline()).get("v")
                if isinstance(d, dict) and d.get("version") is not None:
                    versions.add(str(d["version"]))
                else:
                    bad += 1
            except (OSError, ValueError, AttributeError):
                bad += 1
        h.versions_seen = sorted(versions)
        if bad:
            h.status = "degraded"
            h.messages.append(f"{bad} session file(s) unreadable or without version")
        if versions - {"3"}:
            h.status = "degraded"
            h.messages.append(f"unverified session versions: {sorted(versions - {'3'})}")
        return h
