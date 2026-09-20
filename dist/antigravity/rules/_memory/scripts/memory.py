#!/usr/bin/env python3
"""Durable agent memory substrate: episodic observations, semantic facts,
and correction records in a local SQLite database with FTS5 full-text
search. Stdlib only, no network, no server.

Three kinds of memory, because they decay differently:
  episode     - "what happened": timestamped observations. Fades with age.
  fact        - "what is true": key/value with confidence. Versioned; a new
                value for the same key supersedes the old one, never deletes.
  correction  - "what keeps going wrong": a recurring mistake pattern plus
                the fix. Surfaced first; these are the most expensive to
                re-learn.

    memory store --kind fact --key user.timezone --text "America/Chicago" \\
        --confidence 0.9
    memory store --kind correction --pattern "guessed wrong install flag" \\
        --correction "ask `install.sh --help` first" --context "cursor setup"
    memory store --kind episode --text "deployed v0.2.0 to staging" \\
        --tags deploy,staging
    memory search "install flag" --limit 5
    memory search "timezone" --kind fact --json
    memory forget fact --key user.timezone
    memory prune --older-than 180d          # dry run
    memory prune --older-than 180d --yes     # actually delete episodes
    memory stats

Database location: ~/.agentkit/memory.db, overridden by AGENTKIT_MEMORY_DB
or --db. Exit code 0 on success, 2 on bad usage.
"""

import argparse
import json
import math
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

KINDS = ("episode", "fact", "correction")

# Retrieval weights: corrections are the most expensive to re-learn,
# facts are durable, episodes fade. Applied after per-kind BM25
# normalization so scores are comparable across the three FTS tables.
KIND_WEIGHT = {"correction": 1.0, "fact": 0.9, "episode": 0.75}
EPISODE_HALF_LIFE_DAYS = 90.0

SCHEMA = """
CREATE TABLE IF NOT EXISTS episodes(
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'cli',
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS facts(
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7,
  source TEXT NOT NULL DEFAULT 'cli',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  superseded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS corrections(
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  pattern TEXT NOT NULL,
  correction TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'cli'
);
CREATE UNIQUE INDEX IF NOT EXISTS facts_current_key
  ON facts(key) WHERE superseded = 0;
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts
  USING fts5(text, tags, content='episodes', content_rowid='id');
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts
  USING fts5(key, value, content='facts', content_rowid='id');
CREATE VIRTUAL TABLE IF NOT EXISTS corrections_fts
  USING fts5(pattern, correction, context,
             content='corrections', content_rowid='id');
"""


def _triggers(table, fts, cols):
    collist = ", ".join(cols)
    newvals = ", ".join("new." + c for c in cols)
    oldvals = ", ".join("old." + c for c in cols)
    return """
CREATE TRIGGER IF NOT EXISTS {t}_ai AFTER INSERT ON {t} BEGIN
  INSERT INTO {f}(rowid, {c}) VALUES (new.id, {nv});
END;
CREATE TRIGGER IF NOT EXISTS {t}_ad AFTER DELETE ON {t} BEGIN
  INSERT INTO {f}({f}, rowid, {c}) VALUES ('delete', old.id, {ov});
END;
CREATE TRIGGER IF NOT EXISTS {t}_au AFTER UPDATE ON {t} BEGIN
  INSERT INTO {f}({f}, rowid, {c}) VALUES ('delete', old.id, {ov});
  INSERT INTO {f}(rowid, {c}) VALUES (new.id, {nv});
END;
""".format(t=table, f=fts, c=collist, nv=newvals, ov=oldvals)


def default_db_path():
    return str(Path.home() / ".agentkit" / "memory.db")


def connect(db_path):
    path = db_path or os.environ.get("AGENTKIT_MEMORY_DB") or default_db_path()
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    try:
        db = sqlite3.connect(path)
    except sqlite3.Error as e:
        raise SystemExit("cannot open memory db %s: %s" % (path, e))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL;")
    try:
        db.executescript(SCHEMA)
        db.executescript(_triggers("episodes", "episodes_fts", ["text", "tags"]))
        db.executescript(_triggers("facts", "facts_fts", ["key", "value"]))
        db.executescript(
            _triggers(
                "corrections", "corrections_fts", ["pattern", "correction", "context"]
            )
        )
    except sqlite3.Error as e:
        raise SystemExit("memory db schema failed (FTS5 missing?): %s" % e)
    db.execute("PRAGMA user_version=1;")
    return db, path


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def store_episode(db, text, source, tags):
    cur = db.execute(
        "INSERT INTO episodes(ts, source, text, tags) VALUES (?,?,?,?)",
        (utcnow(), source, text, ",".join(tags)),
    )
    db.commit()
    return cur.lastrowid


def store_fact(db, key, value, confidence, source):
    now = utcnow()
    cur = db.execute("SELECT id FROM facts WHERE key=? AND superseded=0", (key,))
    row = cur.fetchone()
    if row:
        db.execute("UPDATE facts SET superseded=1 WHERE id=?", (row["id"],))
    cur = db.execute(
        "INSERT INTO facts(key, value, confidence, source, created_at,"
        " updated_at) VALUES (?,?,?,?,?,?)",
        (key, value, confidence, source, now, now),
    )
    db.commit()
    return cur.lastrowid


def store_correction(db, pattern, correction, context, source):
    cur = db.execute(
        "INSERT INTO corrections(ts, pattern, correction, context, source)"
        " VALUES (?,?,?,?,?)",
        (utcnow(), pattern, correction, context, source),
    )
    db.commit()
    return cur.lastrowid


def _fts_query(raw):
    """Quote each whitespace token so FTS5 treats user input as phrases,
    never as query syntax. Empty input matches nothing."""
    parts = []
    for tok in raw.split():
        parts.append('"%s"' % tok.replace('"', '""'))
    return " ".join(parts)


def _search_kind(db, kind, match):
    """Return [(bm25, row_dict)] for one kind, best match first."""
    if kind == "episode":
        sql = (
            "SELECT e.id, e.ts, e.source, e.text, e.tags,"
            " bm25(episodes_fts) AS b FROM episodes_fts"
            " JOIN episodes e ON e.id = episodes_fts.rowid"
            " WHERE episodes_fts MATCH ? ORDER BY b LIMIT 50"
        )
        rows = db.execute(sql, (match,)).fetchall()
        return [
            (
                r["b"],
                {
                    "kind": kind,
                    "id": r["id"],
                    "ts": r["ts"],
                    "source": r["source"],
                    "text": r["text"],
                    "tags": r["tags"],
                },
            )
            for r in rows
        ]
    if kind == "fact":
        sql = (
            "SELECT f.id, f.key, f.value, f.confidence, f.source,"
            " f.updated_at, bm25(facts_fts) AS b FROM facts_fts"
            " JOIN facts f ON f.id = facts_fts.rowid"
            " WHERE facts_fts MATCH ? AND f.superseded=0"
            " ORDER BY b LIMIT 50"
        )
        rows = db.execute(sql, (match,)).fetchall()
        return [
            (
                r["b"],
                {
                    "kind": kind,
                    "id": r["id"],
                    "key": r["key"],
                    "text": r["value"],
                    "confidence": r["confidence"],
                    "source": r["source"],
                    "ts": r["updated_at"],
                },
            )
            for r in rows
        ]
    sql = (
        "SELECT c.id, c.ts, c.pattern, c.correction, c.context,"
        " c.source, bm25(corrections_fts) AS b FROM corrections_fts"
        " JOIN corrections c ON c.id = corrections_fts.rowid"
        " WHERE corrections_fts MATCH ? ORDER BY b LIMIT 50"
    )
    rows = db.execute(sql, (match,)).fetchall()
    return [
        (
            r["b"],
            {
                "kind": kind,
                "id": r["id"],
                "ts": r["ts"],
                "pattern": r["pattern"],
                "text": r["correction"],
                "context": r["context"],
                "source": r["source"],
            },
        )
        for r in rows
    ]


def _recency(ts):
    """1.0 for fresh episodes, decaying to ~0.5 at the half-life."""
    try:
        dt = datetime.fromisoformat(ts)
    except ValueError:
        return 0.75
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0
    return 0.5 + 0.5 * math.exp(-max(age_days, 0) / EPISODE_HALF_LIFE_DAYS)


def search(db, query, kinds=None, limit=10):
    """Ranked search across kinds. BM25 is normalized per kind to [0,1],
    then weighted by kind value and recency (episodes only)."""
    match = _fts_query(query)
    if not match:
        return []
    kinds = kinds or list(KINDS)
    scored = []
    for kind in kinds:
        hits = _search_kind(db, kind, match)
        if not hits:
            continue
        scores = [b for b, _ in hits]
        lo, hi = min(scores), max(scores)
        span = (hi - lo) or 1.0
        for b, item in hits:
            relevance = (hi - b) / span  # bm25: more negative = better
            fresh = _recency(item["ts"]) if kind == "episode" else 1.0
            if kind == "fact":
                fresh = 0.5 + 0.5 * float(item.get("confidence") or 0.7)
            final = KIND_WEIGHT[kind] * (0.7 * relevance + 0.3 * fresh)
            item["score"] = round(final, 4)
            scored.append(item)
    scored.sort(key=lambda i: i["score"], reverse=True)
    return scored[:limit]


def get_record(db, kind, rec_id):
    table = {"episode": "episodes", "fact": "facts", "correction": "corrections"}[kind]
    row = db.execute("SELECT * FROM %s WHERE id=?" % table, (rec_id,)).fetchone()
    return dict(row) if row else None


def forget(db, kind, rec_id=None, key=None):
    if kind == "fact" and key:
        cur = db.execute("DELETE FROM facts WHERE key=?", (key,))
    else:
        table = {"episode": "episodes", "fact": "facts", "correction": "corrections"}[
            kind
        ]
        cur = db.execute("DELETE FROM %s WHERE id=?" % table, (rec_id,))
    db.commit()
    return cur.rowcount


def prune_episodes(db, before, dry_run=True):
    rows = db.execute(
        "SELECT id, ts, substr(text,1,60) AS preview"
        " FROM episodes WHERE ts < ? ORDER BY ts",
        (before,),
    ).fetchall()
    if not dry_run and rows:
        db.execute("DELETE FROM episodes WHERE ts < ?", (before,))
        db.commit()
    return [dict(r) for r in rows]


def stats(db, path):
    out = {"db": path}
    for kind, table in (
        ("episode", "episodes"),
        ("fact", "facts"),
        ("correction", "corrections"),
    ):
        where = "WHERE superseded=0" if kind == "fact" else ""
        out[kind + "s"] = db.execute(
            "SELECT COUNT(*) c FROM %s %s" % (table, where)
        ).fetchone()["c"]
    try:
        out["size_bytes"] = os.path.getsize(path)
    except OSError:
        out["size_bytes"] = 0
    return out


def _parse_older_than(spec):
    m = re.match(r"^(\d+)([dwmy])$", spec.strip().lower())
    if not m:
        raise ValueError("expected like 180d, 12w, 6m, 1y")
    n, unit = int(m.group(1)), m.group(2)
    days = {"d": 1, "w": 7, "m": 30, "y": 365}[unit] * n
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(
        timespec="seconds"
    )


def _add_common(p):
    p.add_argument("--db", default=None, help="sqlite db path")
    p.add_argument("--json", action="store_true", help="machine output")


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="memory", description="durable agent memory substrate"
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("store", help="record a memory")
    _add_common(p)
    p.add_argument("--kind", choices=KINDS, required=True)
    p.add_argument("--text", default=None)
    p.add_argument("--key", default=None, help="fact key")
    p.add_argument("--pattern", default=None, help="correction pattern")
    p.add_argument("--correction", default=None, help="correction fix")
    p.add_argument("--context", default="")
    p.add_argument("--tags", default="")
    p.add_argument("--source", default="cli")
    p.add_argument("--confidence", type=float, default=0.7)

    p = sub.add_parser("search", help="ranked search")
    _add_common(p)
    p.add_argument("query")
    p.add_argument("--kind", choices=KINDS, default=None)
    p.add_argument("--limit", type=int, default=10)

    p = sub.add_parser("get", help="fetch one record")
    _add_common(p)
    p.add_argument("kind", choices=KINDS)
    p.add_argument("id", type=int)

    p = sub.add_parser("forget", help="delete a memory")
    _add_common(p)
    p.add_argument("kind", choices=KINDS)
    p.add_argument("id", type=int, nargs="?")
    p.add_argument("--key", default=None, help="fact key instead of id")

    p = sub.add_parser("prune", help="delete old episodes")
    _add_common(p)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--older-than", default=None, help="e.g. 180d, 12w, 1y")
    g.add_argument("--before", default=None, help="ISO date cutoff")
    p.add_argument(
        "--yes", action="store_true", help="actually delete (default is dry run)"
    )

    p = sub.add_parser("stats", help="db overview")
    _add_common(p)

    args = ap.parse_args(argv)
    db, path = connect(args.db)

    if args.cmd == "store":
        if args.kind == "episode":
            if not args.text:
                ap.error("--text is required for episodes")
            rid = store_episode(
                db, args.text, args.source, [t for t in args.tags.split(",") if t]
            )
        elif args.kind == "fact":
            if not args.key or not args.text:
                ap.error("--key and --text are required for facts")
            if not 0.0 <= args.confidence <= 1.0:
                ap.error("--confidence must be 0..1")
            rid = store_fact(db, args.key, args.text, args.confidence, args.source)
        else:
            pattern = args.pattern or args.text
            if not pattern or not args.correction:
                ap.error("--pattern/--text and --correction are required")
            rid = store_correction(
                db, pattern, args.correction, args.context, args.source
            )
        print(
            json.dumps({"ok": True, "kind": args.kind, "id": rid})
            if args.json
            else "stored %s #%d" % (args.kind, rid)
        )
        return 0

    if args.cmd == "search":
        kinds = [args.kind] if args.kind else None
        hits = search(db, args.query, kinds, args.limit)
        if args.json:
            print(json.dumps(hits, indent=2))
        elif not hits:
            print("no matches")
        else:
            for h in hits:
                head = h.get("key") or h.get("pattern") or ""
                print(
                    "[%s #%d %.2f] %s %s"
                    % (h["kind"], h["id"], h["score"], head, h["text"][:120])
                )
        return 0

    if args.cmd == "get":
        rec = get_record(db, args.kind, args.id)
        if not rec:
            print("not found", file=sys.stderr)
            return 1
        print(json.dumps(rec, indent=2, default=str))
        return 0

    if args.cmd == "forget":
        if args.kind == "fact" and args.key:
            n = forget(db, "fact", key=args.key)
        elif args.id is not None:
            n = forget(db, args.kind, rec_id=args.id)
        else:
            ap.error("give an id, or --key for facts")
        print(json.dumps({"deleted": n}) if args.json else ("deleted %d record(s)" % n))
        return 0

    if args.cmd == "prune":
        try:
            before = (
                _parse_older_than(args.older_than) if args.older_than else args.before
            )
        except ValueError as e:
            ap.error(str(e))
        doomed = prune_episodes(db, before, dry_run=not args.yes)
        if args.json:
            print(json.dumps({"dry_run": not args.yes, "episodes": doomed}, indent=2))
        else:
            print(
                "%s %d episode(s) older than %s"
                % ("would delete" if not args.yes else "deleted", len(doomed), before)
            )
            for r in doomed[:20]:
                print("  #%d %s %s" % (r["id"], r["ts"], r["preview"]))
            if not args.yes and doomed:
                print("re-run with --yes to delete")
        return 0

    if args.cmd == "stats":
        s = stats(db, path)
        print(
            json.dumps(s, indent=2)
            if args.json
            else (
                "db: %(db)s\nsize: %(size_bytes)d bytes\n"
                "episodes: %(episodes)d  facts: %(facts)d"
                "  corrections: %(corrections)d" % s
            )
        )
        return 0

    ap.error("unknown command")
    return 2


if __name__ == "__main__":
    sys.exit(main())
