#!/usr/bin/env python3
"""session_audit.py — measure real token spend from Claude Code transcripts.

Reads ~/.claude/projects/*/*.jsonl (or --root) and reports, per session:
turns, startup context (first-turn input incl. cache), cache-read tokens,
fresh input, and output. Flags sessions whose cache re-reads dominate
(long sessions that should have been /clear-ed or split).

    python3 scripts/session_audit.py               # last 20 sessions
    python3 scripts/session_audit.py --last 50 --json
    python3 scripts/session_audit.py --long 300    # flag sessions > 300 turns

Numbers are raw token counts from the API usage blocks, not estimates.
Exit 0 always (it's a report). Stdlib only.
"""

import argparse
import glob
import json
import os
import sys


def session_stats(path):
    turns = base = cache_read = fresh = out = 0
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            try:
                msg = json.loads(line).get("message")
            except (ValueError, AttributeError):
                continue
            usage = msg.get("usage") if isinstance(msg, dict) else None
            if not usage:
                continue
            inp = usage.get("input_tokens", 0) + usage.get(
                "cache_creation_input_tokens", 0
            )
            cr = usage.get("cache_read_input_tokens", 0)
            if turns == 0:
                base = inp + cr
            turns += 1
            fresh += inp
            cache_read += cr
            out += usage.get("output_tokens", 0)
    return {
        "session": os.path.basename(path)[:8],
        "project": os.path.basename(os.path.dirname(path))[-32:],
        "turns": turns,
        "startup": base,
        "fresh_in": fresh,
        "cache_read": cache_read,
        "output": out,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=os.path.expanduser("~/.claude/projects"))
    ap.add_argument("--last", type=int, default=20)
    ap.add_argument(
        "--long", type=int, default=300, help="flag sessions above this many turns"
    )
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    files = sorted(
        glob.glob(os.path.join(a.root, "*", "*.jsonl")), key=os.path.getmtime
    )[-a.last :]
    rows = [r for r in map(session_stats, files) if r["turns"]]
    for r in rows:
        r["long"] = r["turns"] > a.long

    if a.json:
        json.dump(rows, sys.stdout, indent=2)
        print()
        return 0
    if not rows:
        print("no sessions with usage data under", a.root)
        return 0

    print(
        f"{'project':32} {'turns':>6} {'startup':>8} {'fresh_in':>10} {'cache_read':>12} {'output':>9}"
    )
    for r in rows:
        flag = "  <- long: /clear or split" if r["long"] else ""
        print(
            f"{r['project']:32} {r['turns']:6} {r['startup']:8} {r['fresh_in']:10} "
            f"{r['cache_read']:12} {r['output']:9}{flag}"
        )
    tot = {k: sum(r[k] for r in rows) for k in ("fresh_in", "cache_read", "output")}
    avg_start = sum(r["startup"] for r in rows) // len(rows)
    longs = [r for r in rows if r["long"]]
    long_share = sum(r["cache_read"] for r in longs) / max(tot["cache_read"], 1)
    print(
        f"\nsessions={len(rows)} avg_startup={avg_start} fresh_in={tot['fresh_in']} "
        f"cache_read={tot['cache_read']} output={tot['output']}"
    )
    print(f"long sessions: {len(longs)} hold {long_share:.0%} of cache re-reads")
    return 0


if __name__ == "__main__":
    sys.exit(main())
