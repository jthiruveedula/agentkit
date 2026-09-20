#!/usr/bin/env python3
"""estimate.py — size files before reading them.

Prints per-file lines, bytes, estimated tokens (chars/4 heuristic),
and a recommended read strategy. Warns when a planned full read
would exceed --budget.

    python3 scripts/estimate.py src/app.py logs/server.log
    python3 scripts/estimate.py src/*.py --json
    python3 scripts/estimate.py big.log --budget 8000

Exit 0 unless a file is missing (exit 2) or a budget is exceeded
(exit 1 with --budget). Stdlib only.
"""

import argparse
import json
import os
import sys

TOKENS_PER_CHAR = 4  # 1 token ~= 4 chars

# (max_lines_exclusive, strategy)
_STRATEGIES = [
    (150, "full-read ok"),
    (400, "targeted ranges"),
    (float("inf"), "grep-first"),
]


def recommend(lines: int, path: str) -> str:
    """Pick a read strategy from line count and filename hints."""
    name = os.path.basename(path).lower()
    if "log" in name or name.endswith(".log"):
        # Logs are append-only: errors live at the end, schema at the start.
        return "head+tail" if lines > 150 else "full-read ok"
    for limit, strategy in _STRATEGIES:
        if lines < limit:
            return strategy
    return "grep-first"  # pragma: no cover


def estimate(path: str) -> dict:
    with open(path, "rb") as fh:
        data = fh.read()
    text = data.decode("utf-8", errors="replace")
    lines = text.count("\n") + (1 if text and not text.endswith("\n") else 0)
    chars = len(text)
    return {
        "path": path,
        "lines": lines,
        "bytes": len(data),
        "est_tokens": chars // TOKENS_PER_CHAR,
        "strategy": recommend(lines, path),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Estimate read cost of files.")
    ap.add_argument("files", nargs="+", help="file paths to size")
    ap.add_argument("--json", action="store_true", help="JSON output")
    ap.add_argument(
        "--budget",
        type=int,
        default=None,
        metavar="TOKENS",
        help="warn (and exit 1) if full read exceeds this token budget",
    )
    args = ap.parse_args(argv)

    results = []
    missing = [p for p in args.files if not os.path.isfile(p)]
    for path in args.files:
        if not os.path.isfile(path):
            continue
        results.append(estimate(path))

    if missing:
        for path in missing:
            print(f"estimate: {path}: no such file", file=sys.stderr)

    if args.json:
        payload = {"files": results}
        if args.budget is not None:
            total = sum(r["est_tokens"] for r in results)
            payload["budget"] = args.budget
            payload["total_est_tokens"] = total
            payload["over_budget"] = total > args.budget
        print(json.dumps(payload, indent=2))
    else:
        for r in results:
            print(
                f"{r['path']}: {r['lines']} lines, {r['bytes']} bytes, "
                f"~{r['est_tokens']} tokens -> {r['strategy']}"
            )
        if args.budget is not None:
            total = sum(r["est_tokens"] for r in results)
            print(f"total ~{total} tokens against budget {args.budget}")
            if total > args.budget:
                print("estimate: full read exceeds budget", file=sys.stderr)

    if missing:
        return 2
    if args.budget is not None and sum(r["est_tokens"] for r in results) > args.budget:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
