"""Cursor adapter: read-only queries against globalStorage/state.vscdb (never copied)."""

from __future__ import annotations

import json
import os
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from ..schema import CodeEdit, ParsedBatch, Session, ToolCall, Turn
from ._vscode import estimate_tokens, item_value, ms_to_dt, open_ro, uri_to_path, workspace_folder
from .base import Health, SourceFile, user_data_dirs

LEGACY_KEY = "workbench.panel.aichat.view.aichat.chatdata"
KNOWN_COMPOSER_V, KNOWN_BUBBLE_V = 17, 3
EDIT_WORDS = ("edit", "write", "apply")
CALL_STATUS = {"completed": "ok", "error": "error"}
BLOCK_STATE = {"accepted": "accepted", "rejected": "rejected"}


def _dt(v) -> datetime | None:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return ms_to_dt(v)
    if isinstance(v, str):
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _json(raw):
    try:
        v = json.loads(raw) if isinstance(raw, (str, bytes)) else None
        return v if isinstance(v, dict) else None
    except ValueError:
        return None


def _tbl(conn, name) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE name = ? AND type='table'", (name,)).fetchone() is not None


class CursorAdapter:
    name = "cursor"

    def __init__(self) -> None:
        self._versions: set[str] = set()
        self._bad_v: list[str] = []

    def _dirs(self) -> list[Path]:
        env = os.environ.get("CURSOR_DATA_PATH")
        return ([Path(env)] if env else []) + user_data_dirs("Cursor")

    def _dbs(self) -> list[Path]:
        return [d / "globalStorage" / "state.vscdb" for d in self._dirs() if (d / "globalStorage" / "state.vscdb").is_file()]

    def _connect(self, db: Path, warnings: list[str]) -> sqlite3.Connection:
        try:
            c = open_ro(db)
            c.execute("SELECT 1 FROM sqlite_master LIMIT 1").fetchone()
            return c
        except sqlite3.OperationalError:
            warnings.append("cursor: DB locked, reading with immutable=1 (WAL ignored)")
            return open_ro(db, immutable=True)

    def _ws_map(self, db: Path) -> dict[str, str]:
        ws_root = db.parent.parent / "workspaceStorage"
        out = {}
        for d in ws_root.glob("*") if ws_root.is_dir() else []:
            p = workspace_folder(d)
            if p:
                out[d.name] = p
        return out

    def discover(self) -> list[SourceFile]:
        res: list[SourceFile] = []
        for db in self._dbs():
            try:
                st = db.stat()
                warn: list[str] = []
                conn = self._connect(db, warn)
                try:
                    for cid, marker in self._composers(conn):
                        res.append(SourceFile(self.name, db, st.st_size, st.st_mtime_ns, f"{db}#{cid}", marker))
                finally:
                    conn.close()
            except (sqlite3.Error, OSError):
                continue
        for d in self._dirs():
            for wdb in sorted((d / "workspaceStorage").glob("*/state.vscdb")):
                try:
                    conn = open_ro(wdb)
                    try:
                        has = item_value(conn, LEGACY_KEY) is not None
                    finally:
                        conn.close()
                    st = wdb.stat()
                    if has:
                        res.append(SourceFile(self.name, wdb, st.st_size, st.st_mtime_ns, f"{wdb}#legacy"))
                except (sqlite3.Error, OSError):
                    continue
        return res

    def _composers(self, conn) -> list[tuple[str, str | None]]:
        out = []
        if _tbl(conn, "composerHeaders"):
            for cid, upd, val in conn.execute(
                "SELECT composerId, lastUpdatedAt, CAST(value AS TEXT) FROM composerHeaders"):
                v = _json(val) or {}
                if v.get("isDraft") or not cid:
                    continue
                out.append((cid, str(upd) if upd is not None else None))
        elif _tbl(conn, "cursorDiskKV"):
            for (k,) in conn.execute("SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%'"):
                out.append((k.split(":", 1)[1], None))
        return out

    def parse(self, f: SourceFile) -> ParsedBatch:
        b = ParsedBatch()
        try:
            db_s, _, cid = f.key.rpartition("#")
            db = Path(db_s)
            if cid == "legacy":
                self._legacy_sessions(db, b)
                return b
            conn = self._connect(db, b.warnings)
            try:
                self._composer(conn, db, cid, f, b)
            finally:
                conn.close()
        except Exception as ex:  # noqa: BLE001
            b.warnings.append(f"cursor: {f.key.rpartition('#')[2]}: {type(ex).__name__}")
        return b

    def _composer(self, conn, db: Path, cid: str, f: SourceFile, b: ParsedBatch) -> None:
        row = conn.execute("SELECT CAST(value AS TEXT) FROM cursorDiskKV WHERE key = ?", (f"composerData:{cid}",)).fetchone()
        cd = _json(row[0]) if row else None
        if cd is None:
            b.warnings.append(f"cursor: composerData:{cid} missing or malformed")
            return
        if cd.get("_v") is not None:
            self._versions.add(str(cd["_v"]))
            if cd["_v"] != KNOWN_COMPOSER_V:
                self._bad_v.append(f"composerData _v={cd['_v']}")
        hdr = {}
        if _tbl(conn, "composerHeaders"):
            r = conn.execute("SELECT CAST(value AS TEXT), workspaceId FROM composerHeaders WHERE composerId = ?", (cid,)).fetchone()
            if r:
                hdr = _json(r[0]) or {}
                hdr["_ws"] = r[1]
        sid = f"cursor:{cid}"
        proj = uri_to_path(((hdr.get("workspaceIdentifier") or {}).get("uri") or {}).get("external")) \
            or ((hdr.get("workspaceIdentifier") or {}).get("uri") or {}).get("fsPath") \
            or self._ws_map(db).get(str(hdr.get("_ws")))
        sess = Session(
            sid, self.name, f.key, project_path=proj,
            title=hdr.get("name") or cd.get("name") or None,
            started_at=_dt(cd.get("createdAt")), ended_at=_dt(cd.get("lastUpdatedAt")),
            mode=hdr.get("unifiedMode") or cd.get("unifiedMode"),
            is_subagent=bool(hdr.get("isSubagent")),
        )
        mc = cd.get("modelConfig")
        mname = mc.get("modelName") if isinstance(mc, dict) else None
        models: Counter = Counter()
        if mname and mname != "default":
            models[mname] += 1
        # message order
        heads = [h.get("bubbleId") for h in (cd.get("fullConversationHeadersOnly") or []) if isinstance(h, dict)]
        inline = {x.get("bubbleId"): x for x in (cd.get("conversation") or []) if isinstance(x, dict)} if not heads else {}
        if not heads:
            heads = list(inline)
        seen, ti, last = set(), 0, sess.started_at
        for bid in heads:
            if not bid or bid in seen:
                continue
            seen.add(bid)
            bub = inline.get(bid)
            if bub is None:
                r = conn.execute("SELECT CAST(value AS TEXT) FROM cursorDiskKV WHERE key = ?", (f"bubbleId:{cid}:{bid}",)).fetchone()
                bub = _json(r[0]) if r else None
            if bub is None:
                continue
            if bub.get("_v") is not None:
                self._versions.add(f"bubble:{bub['_v']}")
                if bub["_v"] != KNOWN_BUBBLE_V:
                    self._bad_v.append(f"bubble _v={bub['_v']}")
            ts = _dt(bub.get("createdAt"))
            if ts and (last is None or ts > last):
                last = ts
            role = {1: "user", 2: "assistant"}.get(bub.get("type"))
            if role is None:
                continue
            tid = f"{sid}:{bid}"
            text = bub.get("text") if isinstance(bub.get("text"), str) else None
            t = Turn(tid, sid, ti, role, ts, text)
            ti += 1
            if role == "assistant":
                mi = bub.get("modelInfo")
                m = mi.get("modelName") if isinstance(mi, dict) else None
                t.model = m if m and m != "default" else mname if mname != "default" else None
                if t.model:
                    models[t.model] += 1
                tc = bub.get("tokenCount") if isinstance(bub.get("tokenCount"), dict) else {}
                tin, tout = tc.get("inputTokens") or 0, tc.get("outputTokens") or 0
                if tin or tout:
                    t.tokens_in, t.tokens_out = tin, tout
                else:
                    t.tokens_in, t.tokens_out = 0, estimate_tokens(text)
                    sess.tokens_estimated = True
            b.turns.append(t)
            tf = bub.get("toolFormerData")
            if isinstance(tf, dict) and tf.get("name"):
                name = str(tf["name"])
                b.tool_calls.append(ToolCall(
                    str(tf.get("toolCallId") or f"{tid}:tool"), sid, tid, name, ts,
                    status=CALL_STATUS.get(tf.get("status"), "pending"),
                    is_edit=any(w in name.lower() for w in EDIT_WORDS)))
            cbd = bub.get("codeBlockData")
            for n, (uri, info) in enumerate((cbd or {}).items() if isinstance(cbd, dict) else []):
                st = info.get("status") if isinstance(info, dict) else None
                b.code_edits.append(CodeEdit(
                    f"{tid}:e{n}", sid, tid, uri_to_path(uri) or uri,
                    state=BLOCK_STATE.get(st, "pending"), ts=ts))
        sess.ended_at = sess.ended_at or last
        sess.model = models.most_common(1)[0][0] if models else None
        b.sessions.append(sess)

    # legacy workspace DBs: tabs[].bubbles[] (type user/ai)
    def _legacy_sessions(self, db: Path, b: ParsedBatch) -> None:
        try:
            conn = open_ro(db)
            try:
                raw = item_value(conn, LEGACY_KEY)
            finally:
                conn.close()
        except sqlite3.Error:
            return
        data = _json(raw)
        folder = workspace_folder(db.parent)
        for tab in (data or {}).get("tabs") or []:
            if not isinstance(tab, dict):
                continue
            sid = f"cursor:legacy:{tab.get('tabId')}"
            ti = 0
            s = Session(sid, self.name, f"{db}#legacy", folder, tab.get("chatTitle"),
                        _dt(tab.get("lastSendTime")))
            for i, bub in enumerate(tab.get("bubbles") or []):
                if not isinstance(bub, dict):
                    continue
                role = {"user": "user", "ai": "assistant"}.get(bub.get("type"))
                if role:
                    text = bub.get("text") if isinstance(bub.get("text"), str) else None
                    b.turns.append(Turn(f"{sid}:{i}", sid, ti, role, None, text,
                                        tokens_out=estimate_tokens(text) if role == "assistant" else None))
                    ti += 1
                    s.tokens_estimated = s.tokens_estimated or role == "assistant"
            b.sessions.append(s)

    def health(self) -> Health:
        dbs = self._dbs()
        if not dbs:
            return Health(self.name, "missing")
        h = Health(self.name, "ok")
        for db in dbs:
            try:
                warn: list[str] = []
                conn = self._connect(db, warn)
                try:
                    comps = self._composers(conn)
                    h.sessions_found += len(comps)
                    for cid, _ in comps[:50]:
                        r = conn.execute("SELECT CAST(value AS TEXT) FROM cursorDiskKV WHERE key = ?", (f"composerData:{cid}",)).fetchone()
                        v = _json(r[0]) if r else None
                        if v and v.get("_v") is not None:
                            h.versions_seen.append(str(v["_v"]))
                            if v["_v"] != KNOWN_COMPOSER_V:
                                h.status = "degraded"
                                h.messages.append(f"unknown composerData _v={v['_v']}")
                        for hd in (v or {}).get("fullConversationHeadersOnly", [])[:1]:
                            r2 = conn.execute("SELECT CAST(value AS TEXT) FROM cursorDiskKV WHERE key = ?", (f"bubbleId:{cid}:{hd.get('bubbleId')}",)).fetchone()
                            bv = (_json(r2[0]) or {}).get("_v") if r2 else None
                            if bv is not None and bv != KNOWN_BUBBLE_V:
                                h.status = "degraded"
                                h.messages.append(f"unknown bubble _v={bv}")
                finally:
                    conn.close()
                h.messages.extend(warn)
            except (sqlite3.Error, OSError) as ex:
                h.status = "degraded"
                h.messages.append(f"unreadable DB ({type(ex).__name__})")
        h.versions_seen = sorted(set(h.versions_seen))
        h.messages = sorted(set(h.messages))
        return h
