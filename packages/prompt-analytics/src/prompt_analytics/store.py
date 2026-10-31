"""DuckDB store: connect, per-source-file batch replacement, watermarks, health.

Privacy: everything text-like is redacted (or dropped per ``store_text``)
HERE, before it is written. ``source_key`` values (file paths) are never
stored raw: they are replaced by an HMAC key id, so no username or path leaks
through the ``sessions``/``watermarks`` tables.

NOTE for readers: TIMESTAMPTZ columns need ``pytz`` to come back as Python
datetimes. Select ``epoch(col)`` or ``col AT TIME ZONE 'UTC'`` instead.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import duckdb

from . import pricing
from .adapters.base import Health
from .config import Config
from .privacy import Redactor, harden_tree, hmac_hex, load_salt, secure_dir
from .schema import DDL, ParsedBatch, Session, Turn
from .sensitive import ADVICE, Detector

# Store-owned bookkeeping: which (source, source_key) units contributed to a
# session. Lets a session shared by several files (Claude Code resume) survive
# when one of its files is re-parsed.
_EXTRA_DDL = """
CREATE TABLE IF NOT EXISTS session_keys (
  session_id VARCHAR, source VARCHAR, source_key VARCHAR,
  PRIMARY KEY (session_id, source, source_key)
);
ALTER TABLE exposures ADD COLUMN IF NOT EXISTS preview VARCHAR;
"""


@dataclass
class StoreCtx:
    cfg: Config
    redactor: Redactor
    salt: bytes
    detector: Detector | None = None


def make_ctx(cfg: Config) -> StoreCtx:
    salt = load_salt(cfg.salt_path)
    rd = Redactor(cfg.redact, salt, cfg.redact_style)
    return StoreCtx(cfg, rd, salt, Detector(cfg.sensitive, rd))


def key_id(salt: bytes, source: str, key: str) -> str:
    """Opaque stable id for a source unit (never store the raw path)."""
    return hmac_hex(salt, f"{source}\0{key}".encode())[:32]


def connect(cfg: Config, read_only: bool = False) -> duckdb.DuckDBPyConnection:
    secure_dir(cfg.data_dir)
    con = duckdb.connect(str(cfg.db_path), read_only=read_only)
    if not read_only:
        con.execute(DDL)
        con.execute(_EXTRA_DDL)
    harden_tree(cfg.data_dir)
    return con


def _utc(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _sum(vals: Iterable[int | None]) -> int | None:
    v = [x for x in vals if x is not None]
    return sum(v) if v else None


def _home_rel(path: str) -> str:
    home = str(Path(os.environ.get("PA_HOME") or Path.home()))
    if path == home or path.startswith(home.rstrip("/\\") + os.sep):
        return "~" + path[len(home):]
    return path


def _chunks(seq: list, n: int = 1000):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def _put(con: Any, table: str, cols: str, rows: list[tuple]) -> None:
    if rows:
        q = ",".join("?" * len(cols.split(",")))
        con.executemany(f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({q})", rows)


def replace_batch(con: duckdb.DuckDBPyConnection, source: str, key: str, batch: ParsedBatch, ctx: StoreCtx) -> None:
    """Replace everything one source unit contributed, atomically.

    Dedupe semantics (deliberate): ``turns``/``tool_calls``/``code_edits`` use
    INSERT OR REPLACE on their primary key, so when a resumed Claude Code
    session replays the same message ids in a later file the row is written
    once (latest parse wins, which also lets a RULES_VERSION re-parse overwrite
    old redactions). Sessions sharing a ``session_id`` across files are merged:
    min(started), max(ended), aggregates recomputed from the turns table.
    A session claimed by several keys keeps its child rows when one key is
    re-parsed (rows cannot be attributed to a key); turns dropped from a
    shared session therefore linger until the session is gone from all keys.
    """
    cfg, rd = ctx.cfg, ctx.redactor
    mode = cfg.store_text
    kid = key_id(ctx.salt, source, key)

    def text(s: str | None) -> str | None:
        if s is None or mode == "none":
            return None
        return s if mode == "full" else rd.redact(s)

    def meta(s: str | None) -> str | None:  # ids/labels: always redacted, never dropped
        return rd.redact(s) if s else s

    sess_by_id: dict[str, Session] = {s.session_id: s for s in batch.sessions}
    turns: dict[str, Turn] = {t.turn_id: t for t in batch.turns}

    # projects
    projects: dict[str, tuple] = {}
    proj_of: dict[str, str | None] = {}
    for s in sess_by_id.values():
        pid = None
        if s.project_path:
            p = os.path.normpath(s.project_path)
            pid = hmac_hex(ctx.salt, p.encode())[:16]
            if pid not in projects:
                projects[pid] = (
                    pid,
                    meta(os.path.basename(p) or p),
                    meta(_home_rel(p)),
                    (Path(p) / ".git").exists(),
                )
        proj_of[s.session_id] = pid

    # turns + per-turn cost
    turn_rows, turn_est, turn_cost = [], {}, {}
    by_sess: dict[str, list[Turn]] = {}
    for t in turns.values():
        by_sess.setdefault(t.session_id, []).append(t)
        cost, est = t.cost_usd, False
        if cost is None and t.role == "assistant":
            m = t.model or (sess_by_id[t.session_id].model if t.session_id in sess_by_id else None)
            cost = pricing.estimate(m, t.tokens_in, t.tokens_out, t.tokens_cache_read, t.tokens_cache_write, cfg)
            est = cost is not None
        turn_est[t.turn_id] = est
        turn_cost[t.turn_id] = cost
        turn_rows.append((
            t.turn_id, t.session_id, t.idx, t.role, _utc(t.ts), text(t.text), len(t.text or ""), meta(t.model),
            t.tokens_in, t.tokens_out, t.tokens_cache_read, t.tokens_cache_write, cost, t.latency_ms,
            t.status, t.is_interrupt,
        ))

    # sessions
    sess_rows: dict[str, tuple] = {}
    for sid, s in sess_by_id.items():
        ts = by_sess.get(sid, [])
        tk = [s.tokens_in if s.tokens_in is not None else _sum(t.tokens_in for t in ts),
              s.tokens_out if s.tokens_out is not None else _sum(t.tokens_out for t in ts),
              s.tokens_cache_read if s.tokens_cache_read is not None else _sum(t.tokens_cache_read for t in ts),
              s.tokens_cache_write if s.tokens_cache_write is not None else _sum(t.tokens_cache_write for t in ts)]
        cost, est = s.cost_usd, False
        if cost is None:
            costs = [turn_cost[t.turn_id] for t in ts if turn_cost[t.turn_id] is not None]
            if costs:
                cost = sum(costs)
                est = any(turn_est[t.turn_id] for t in ts)
            else:
                cost = pricing.estimate(s.model, *tk, cfg)
                est = cost is not None
        sess_rows[sid] = (
            sid, source, kid, proj_of[sid], text(s.title), _utc(s.started_at), _utc(s.ended_at), s.is_subagent,
            s.parent_session_id, meta(s.mode), meta(s.model),
            sum(t.role == "user" for t in ts), sum(t.role == "assistant" for t in ts),
            *tk, cost, est, s.tokens_estimated,
        )

    # exposure scan on RAW user text (counts only; runs even when store_text=none)
    exp_rows = []
    if ctx.detector is not None:
        for t in turns.values():
            if t.role == "user":
                found = ctx.detector.scan(t.text)
                # preview: findings masked as the kind tag, rest redacted; safe to persist, dropped for store_text=none
                pv = ctx.detector.preview(t.text) if found and mode != "none" else None
                exp_rows += [(t.session_id, t.turn_id, _utc(t.ts), e.kind, e.category, e.count, pv) for e in found]

    tool_rows = [
        (c.call_id, c.session_id, c.turn_id, meta(c.name), _utc(c.ts), c.duration_ms, c.status, c.is_edit)
        for c in {c.call_id: c for c in batch.tool_calls}.values()
    ]

    def edit_file(sid: str, f: str | None) -> str | None:
        if f is None or mode == "none":
            return None
        pp = sess_by_id[sid].project_path if sid in sess_by_id else None
        if pp:
            try:
                f = Path(f).relative_to(pp).as_posix()
            except ValueError:
                pass
        return f if mode == "full" else rd.redact(f)

    edit_rows = [
        (e.edit_id, e.session_id, e.turn_id, edit_file(e.session_id, e.file), e.lines_added, e.lines_removed,
         e.state, _utc(e.ts))
        for e in {e.edit_id: e for e in batch.code_edits}.values()
    ]

    con.begin()
    try:
        old = [r[0] for r in con.execute(
            "SELECT session_id FROM session_keys WHERE source=? AND source_key=?", [source, kid]).fetchall()]
        if old:
            shared = {r[0] for r in con.execute(
                "SELECT session_id FROM session_keys WHERE session_id IN (SELECT unnest(?)) "
                "AND NOT (source=? AND source_key=?)", [old, source, kid]).fetchall()}
            gone = [i for i in old if i not in shared]
            if gone:
                for tbl in ("turns", "tool_calls", "code_edits", "sessions", "exposures"):
                    con.execute(f"DELETE FROM {tbl} WHERE session_id IN (SELECT unnest(?))", [gone])
        con.execute("DELETE FROM session_keys WHERE source=? AND source_key=?", [source, kid])
        if turns:
            con.execute("DELETE FROM exposures WHERE turn_id IN (SELECT unnest(?))", [list(turns)])

        ids = list(sess_rows)
        existing = {r[0] for r in con.execute(
            "SELECT session_id FROM sessions WHERE session_id IN (SELECT unnest(?))", [ids]).fetchall()} if ids else set()

        _put(con, "projects", "project_id,name,root,repo", list(projects.values()))
        cols = ("session_id,source,source_key,project_id,title,started_at,ended_at,is_subagent,parent_session_id,"
                "mode,model,n_user_turns,n_assistant_turns,tokens_in,tokens_out,tokens_cache_read,"
                "tokens_cache_write,cost_usd,cost_is_estimate,tokens_estimated")
        _put(con, "sessions", cols, [r for sid, r in sess_rows.items() if sid not in existing])
        for sid in existing:  # merge: keep owner source_key, widen the window
            r = sess_rows[sid]
            con.execute(
                "UPDATE sessions SET project_id=coalesce(?,project_id), title=coalesce(?,title), "
                "started_at=least(started_at,?), ended_at=greatest(ended_at,?), is_subagent=?, "
                "parent_session_id=coalesce(?,parent_session_id), mode=coalesce(?,mode), model=coalesce(?,model), "
                "cost_is_estimate=coalesce(cost_is_estimate,false) OR ?, "
                "tokens_estimated=coalesce(tokens_estimated,false) OR ? WHERE session_id=?",
                [r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[18], r[19], sid])
        _put(con, "session_keys", "session_id,source,source_key", [(sid, source, kid) for sid in ids])
        _put(con, "turns", "turn_id,session_id,idx,role,ts,text,text_len,model,tokens_in,tokens_out,"
             "tokens_cache_read,tokens_cache_write,cost_usd,latency_ms,status,is_interrupt", turn_rows)
        _put(con, "tool_calls", "call_id,session_id,turn_id,name,ts,duration_ms,status,is_edit", tool_rows)
        _put(con, "code_edits", "edit_id,session_id,turn_id,file,lines_added,lines_removed,state,ts", edit_rows)
        _put(con, "exposures", "session_id,turn_id,ts,kind,category,n,preview", exp_rows)
        if existing:
            con.execute(
                "UPDATE sessions s SET n_user_turns=a.u, n_assistant_turns=a.a, "
                "tokens_in=coalesce(a.ti,s.tokens_in), tokens_out=coalesce(a.to_,s.tokens_out), "
                "tokens_cache_read=coalesce(a.cr,s.tokens_cache_read), tokens_cache_write=coalesce(a.cw,s.tokens_cache_write), "
                "cost_usd=coalesce(a.c,s.cost_usd) FROM ("
                "SELECT session_id, count(*) FILTER (WHERE role='user') u, count(*) FILTER (WHERE role='assistant') a, "
                "sum(tokens_in) ti, sum(tokens_out) to_, sum(tokens_cache_read) cr, sum(tokens_cache_write) cw, "
                "sum(cost_usd) c FROM turns WHERE session_id IN (SELECT unnest(?)) GROUP BY session_id) a "
                "WHERE s.session_id=a.session_id", [list(existing)])
        con.commit()
    except BaseException:
        con.rollback()
        raise


@dataclass
class Watermark:
    size: int | None
    mtime_ns: int | None
    content_hmac: str | None
    rules_version: str | None


def watermark_get(con: duckdb.DuckDBPyConnection, source: str, key: str, ctx: StoreCtx) -> Watermark | None:
    r = con.execute("SELECT size, mtime_ns, content_hmac, rules_version FROM watermarks WHERE source=? AND source_key=?",
                    [source, key_id(ctx.salt, source, key)]).fetchone()
    return Watermark(*r) if r else None


def watermark_set(con: duckdb.DuckDBPyConnection, source: str, key: str, ctx: StoreCtx, size: int,
                  mtime_ns: int, content_hmac: str, rules_version: str) -> None:
    con.execute("INSERT OR REPLACE INTO watermarks VALUES (?,?,?,?,?,?,?)",
                [source, key_id(ctx.salt, source, key), size, mtime_ns, content_hmac,
                 datetime.now(timezone.utc), rules_version])


def upsert_health(con: duckdb.DuckDBPyConnection, h: Health, ctx: StoreCtx | None = None,
                  extra_warnings: Iterable[str] = ()) -> None:
    """Store a Health row. Pass ``ctx`` so messages (which may hold paths) are redacted."""
    msgs = list(h.messages) + list(extra_warnings)
    if ctx is not None:
        msgs = [ctx.redactor.redact(m) or "" for m in msgs]
    con.execute("INSERT OR REPLACE INTO source_health VALUES (?,?,?,?,?,?)",
                [h.source, h.status, h.sessions_found, json.dumps(msgs), datetime.now(timezone.utc),
                 json.dumps(list(h.versions_seen))])


def exposure_summary(con: duckdb.DuckDBPyConnection, since_days: int | None = None) -> dict[str, Any]:
    """Aggregate the exposures table (counts only; titles are already redacted)."""
    # Subagent prompts are written by the parent agent, not pasted by the user (matches the dashboard).
    where, params = "WHERE NOT coalesce(s.is_subagent, false)", []
    if since_days is not None:
        where += " AND epoch(coalesce(e.ts, s.started_at)) >= epoch(now()) - ?"
        params = [since_days * 86400]
    base = ("FROM exposures e LEFT JOIN sessions s USING (session_id) " + where)
    day = "CAST(coalesce(e.ts, s.started_at) AT TIME ZONE 'UTC' AS DATE)"
    cats: dict[str, Any] = {}
    for cat, kind, ns, npr, cnt, first, last in con.execute(
            f"SELECT e.category, e.kind, count(DISTINCT e.session_id), count(*), sum(e.n), min({day}), max({day}) {base} "
            "GROUP BY 1,2 ORDER BY 1,2", params).fetchall():
        c = cats.setdefault(cat, {"sessions": 0, "prompts": 0, "kinds": {}, "by_source": {}, "first": None, "last": None,
                                  "advice": ADVICE.get(cat, "")})
        c["kinds"][kind] = {"sessions": ns, "prompts": npr, "count": int(cnt)}
        c["first"] = str(min(x for x in (c["first"], str(first)) if x)) if first else c["first"]
        c["last"] = str(max(x for x in (c["last"], str(last)) if x)) if last else c["last"]
    for cat, ns, npr in con.execute(f"SELECT e.category, count(DISTINCT e.session_id), count(DISTINCT e.turn_id) {base} GROUP BY 1", params).fetchall():
        cats[cat]["sessions"], cats[cat]["prompts"] = ns, npr
    for cat, src, ns in con.execute(f"SELECT e.category, coalesce(s.source,'?'), count(DISTINCT e.session_id) {base} GROUP BY 1,2", params).fetchall():
        cats[cat]["by_source"][src] = ns
    rev = ("coalesce(r.status,'open')")
    sessions = [{"source": src, "date": str(d), "title": title, "kinds": sorted(kinds),
                 "turns": {"open": o, "reviewed": rv, "false_positive": fp}}
                for src, d, title, kinds, o, rv, fp in con.execute(
                    f"SELECT coalesce(s.source,'?'), min({day}), s.title, list(DISTINCT e.kind), "
                    f"count(DISTINCT e.turn_id) FILTER (WHERE {rev}='open'), "
                    f"count(DISTINCT e.turn_id) FILTER (WHERE {rev}='reviewed'), "
                    f"count(DISTINCT e.turn_id) FILTER (WHERE {rev}='false_positive') "
                    f"FROM exposures e LEFT JOIN sessions s USING (session_id) LEFT JOIN exposure_reviews r USING (turn_id) {where} "
                    "GROUP BY e.session_id, s.source, s.title ORDER BY 2 DESC", params).fetchall()]
    return {"categories": cats, "sessions": sessions}


REVIEW_STATUS = ("reviewed", "false_positive", "open")


def set_review(con: duckdb.DuckDBPyConnection, turn_id: str, status: str) -> None:
    if status not in REVIEW_STATUS:
        raise ValueError(f"bad status {status!r}")
    con.execute("INSERT OR REPLACE INTO exposure_reviews VALUES (?,?,?)", [turn_id, status, datetime.now(timezone.utc)])
