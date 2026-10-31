"""opencode adapter: read-only access to the SQLite store.

Only the ``session``, ``message`` and ``part`` tables are read. Credential
files and the ``credential``/``account`` tables are never touched.
"""

from __future__ import annotations

import json
import os
import sqlite3
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from ..schema import CodeEdit, ParsedBatch, Session, ToolCall, Turn
from .base import Health, SourceFile, home

EDIT_TOOLS = {"edit", "write", "patch", "multiedit", "apply_patch"}
CALL_STATUS = {"completed": "ok", "error": "error"}
EDIT_STATE = {"completed": "applied", "pending": "pending", "running": "pending"}


def _data_dir() -> Path:
    base = os.environ.get("XDG_DATA_HOME")
    return (Path(base) if base else home() / ".local" / "share") / "opencode"


def _dbs() -> list[Path]:
    env = os.environ.get("OPENCODE_DB")
    if env:
        return [Path(env)] if Path(env).is_file() else []
    d = _data_dir()
    return sorted(p for p in d.glob("opencode*.db") if p.is_file()) if d.is_dir() else []


def _connect(path: Path) -> sqlite3.Connection:
    # ponytail: path with '?'/'#' would break the URI; quote if that ever shows up.
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def _dt(ms) -> datetime | None:
    if not isinstance(ms, (int, float)) or isinstance(ms, bool):
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _j(raw) -> dict:
    try:
        d = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


def _num(d: dict, *keys):
    for k in keys:
        d = d.get(k) if isinstance(d, dict) else None
    return int(d) if isinstance(d, (int, float)) and not isinstance(d, bool) else None


def _lines(s) -> int:
    return len(s.splitlines()) if isinstance(s, str) and s else 0


def _cols(con, table: str) -> set[str]:
    return {r[1] for r in con.execute(f"pragma table_info({table})")}


class OpencodeAdapter:
    name = "opencode"

    def discover(self) -> list[SourceFile]:
        out: list[SourceFile] = []
        for db in _dbs():
            try:
                st = db.stat()
                with closing(_connect(db)) as con:
                    cols = _cols(con, "session")
                    if not {"id", "time_updated"} <= cols:
                        continue
                    rows = con.execute("select id, time_updated from session").fetchall()
            except (OSError, sqlite3.Error):
                continue
            out += [
                SourceFile(self.name, db, st.st_size, st.st_mtime_ns,
                           f"{db}#{r['id']}", str(r["time_updated"]))
                for r in rows
            ]
        return out

    def health(self) -> Health:
        dbs = _dbs()
        if not dbs:
            if (_data_dir() / "storage" / "session").is_dir():
                return Health(self.name, "unsupported", messages=[
                    "legacy JSON storage era (storage/session) is not supported"])
            return Health(self.name, "missing", messages=["opencode database not found"])
        found, msgs, status = 0, [], "ok"
        for db in dbs:
            try:
                with closing(_connect(db)) as con:
                    missing = [t for t in ("session", "message", "part") if not _cols(con, t)]
                    if missing:
                        status = "degraded"
                        msgs.append(f"{db.name}: missing tables {missing}")
                        continue
                    found += con.execute("select count(*) from session").fetchone()[0]
            except sqlite3.Error as e:
                status = "degraded"
                msgs.append(f"{db.name}: {type(e).__name__}")
        return Health(self.name, status, found, msgs)

    def parse(self, f: SourceFile) -> ParsedBatch:
        batch = ParsedBatch()
        sid = f.key.rsplit("#", 1)[1]
        with closing(_connect(f.path)) as con:
            scols = _cols(con, "session")
            srow = con.execute("select * from session where id=?", (sid,)).fetchone()
            if srow is None:
                batch.warnings.append(f"session {sid} vanished")
                return batch
            msgs = con.execute(
                "select id, time_created, data from message where session_id=? "
                "order by time_created, id", (sid,)).fetchall()
            parts = con.execute(
                "select p.message_id, p.data from part p join message m on m.id=p.message_id "
                "where m.session_id=? order by p.time_created, p.id", (sid,)).fetchall() \
                if "time_created" in _cols(con, "part") else con.execute(
                "select p.message_id, p.data from part p join message m on m.id=p.message_id "
                "where m.session_id=? order by p.id", (sid,)).fetchall()

        by_msg: dict[str, list[dict]] = {}
        for p in parts:
            by_msg.setdefault(p["message_id"], []).append(_j(p["data"]))

        session_id = f"opencode:{sid}"
        models: Counter[str] = Counter()
        stamps: list[datetime] = []
        for i, m in enumerate(msgs):
            d = _j(m["data"])
            role = d.get("role") if d.get("role") in ("user", "assistant") else None
            if role is None:
                continue
            created = _dt(_num(d, "time", "created") or m["time_created"])
            done = _dt(_num(d, "time", "completed"))
            if created:
                stamps.append(created)
            if done:
                stamps.append(done)
            mid = f"{session_id}:{m['id']}"
            ps = by_msg.get(m["id"], [])
            text = "\n".join(
                p["text"] for p in ps
                if p.get("type") == "text" and isinstance(p.get("text"), str) and not p.get("synthetic")
            ) or None
            turn = Turn(turn_id=mid, session_id=session_id, idx=i, role=role, ts=created, text=text)
            if role == "assistant":
                turn.model = d.get("modelID")
                if turn.model:
                    models[turn.model] += 1
                out, reas = _num(d, "tokens", "output"), _num(d, "tokens", "reasoning")
                turn.tokens_in = _num(d, "tokens", "input")
                turn.tokens_out = None if out is None and reas is None else (out or 0) + (reas or 0)
                turn.tokens_cache_read = _num(d, "tokens", "cache", "read")
                turn.tokens_cache_write = _num(d, "tokens", "cache", "write")
                c = d.get("cost")
                turn.cost_usd = float(c) if isinstance(c, (int, float)) else None
                if created and done:
                    turn.latency_ms = max(0, int((done - created).total_seconds() * 1000))
                err = d.get("error")
                if err:
                    aborted = isinstance(err, dict) and err.get("name") == "MessageAbortedError"
                    turn.status = "cancelled" if aborted else "error"
            batch.turns.append(turn)
            for p in ps:
                if p.get("type") == "tool":
                    self._tool(batch, session_id, mid, p)

        sm = _j(srow["model"]) if "model" in scols else {}
        model = sm.get("id") or (models.most_common(1)[0][0] if models else None)
        cost = srow["cost"] if "cost" in scols else None
        batch.sessions.append(Session(
            session_id=session_id, source=self.name, source_key=f.key,
            project_path=srow["directory"] if "directory" in scols else None,
            title=srow["title"] if "title" in scols else None,
            started_at=_dt(srow["time_created"]) if "time_created" in scols else (min(stamps) if stamps else None),
            ended_at=_dt(srow["time_updated"]) if "time_updated" in scols else (max(stamps) if stamps else None),
            is_subagent=bool("parent_id" in scols and srow["parent_id"]),
            parent_session_id=f"opencode:{srow['parent_id']}" if "parent_id" in scols and srow["parent_id"] else None,
            model=model,
            cost_usd=float(cost) if isinstance(cost, (int, float)) else None,
        ))
        return batch

    @staticmethod
    def _tool(batch: ParsedBatch, session_id: str, turn_id: str, p: dict) -> None:
        name = p.get("tool") or "unknown"
        st = p.get("state") if isinstance(p.get("state"), dict) else {}
        start, end = _num(st, "time", "start"), _num(st, "time", "end")
        cid = p.get("callID") or p.get("id") or f"{turn_id}:{len(batch.tool_calls)}"
        status = CALL_STATUS.get(st.get("status"), "pending")
        is_edit = name.lower() in EDIT_TOOLS
        ts = _dt(start)
        batch.tool_calls.append(ToolCall(
            call_id=f"{session_id}:{cid}", session_id=session_id, turn_id=turn_id, name=name,
            ts=ts, duration_ms=max(0, end - start) if start is not None and end is not None else None,
            status=status, is_edit=is_edit,
        ))
        if not is_edit:
            return
        inp = st.get("input") if isinstance(st.get("input"), dict) else {}
        meta = st.get("metadata") if isinstance(st.get("metadata"), dict) else {}
        fd = meta.get("filediff")
        fds = [fd] if isinstance(fd, dict) else [x for x in fd if isinstance(x, dict)] if isinstance(fd, list) else []
        if fds and all(isinstance(x.get("additions"), int) for x in fds):
            added = sum(x["additions"] for x in fds)
            removed = sum(x.get("deletions") or 0 for x in fds)
        elif name.lower() == "write":
            added, removed = _lines(inp.get("content")), 0
        else:
            added, removed = _lines(inp.get("newString")), _lines(inp.get("oldString"))
        batch.code_edits.append(CodeEdit(
            edit_id=f"{session_id}:{cid}", session_id=session_id, turn_id=turn_id,
            file=inp.get("filePath") or inp.get("file_path") or inp.get("path"),
            lines_added=added, lines_removed=removed,
            state=EDIT_STATE.get(st.get("status"), "unknown"), ts=ts,
        ))
