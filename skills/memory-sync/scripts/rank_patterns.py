#!/usr/bin/env python3
"""Cluster a list of one-line incident/mistake descriptions (pulled from
session timelines/observations) by shared vocabulary, so memory-sync
reports *ranked, repeated* patterns instead of a flat dump the model has
to eyeball for duplicates.

Deliberately simple: this is triage, not NLP. A real cluster ("keeps
guessing the wrong install flag" said three different ways) still needs a
human/model glance to confirm before it becomes a durable fix -- this
script's job is just "surface what recurred," not "auto-write the fix."

    python3 rank_patterns.py incidents.txt      # one incident per line
    echo "..." | python3 rank_patterns.py --stdin
    python3 rank_patterns.py --selftest
"""
import argparse
import json
import re
import sys
from collections import defaultdict

STOPWORDS = {
    "a", "an", "the", "is", "was", "were", "to", "of", "in", "on", "for",
    "and", "or", "it", "this", "that", "with", "at", "as", "be", "by",
    "not", "but", "then", "than", "so", "i", "we", "you", "again", "kept",
    "keeps", "keep", "session", "agent", "did", "didn't", "does", "doesn't",
}


def _stem(word):
    """Crude suffix strip -- enough to match "tests"/"test", "running"/"run",
    "committing"/"committed", not a real stemmer. Triage tool, not NLP."""
    for suffix in ("ing", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def tokens(line):
    words = re.findall(r"[a-z0-9']+", line.lower())
    return {_stem(w) for w in words if w not in STOPWORDS and len(w) > 2}


def cluster(lines, min_shared=2, min_count=2):
    """Greedy clustering: each line joins the first existing cluster it
    shares >= min_shared significant words with, else starts a new one."""
    clusters = []  # list of {"tokens": set, "lines": [line, ...]}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        t = tokens(line)
        placed = False
        for c in clusters:
            if len(t & c["tokens"]) >= min_shared:
                c["lines"].append(line)
                c["tokens"] |= t
                placed = True
                break
        if not placed:
            clusters.append({"tokens": t, "lines": [line]})

    ranked = [c for c in clusters if len(c["lines"]) >= min_count]
    ranked.sort(key=lambda c: -len(c["lines"]))
    return [
        {"count": len(c["lines"]), "examples": c["lines"], "shared_terms": sorted(c["tokens"])[:8]}
        for c in ranked
    ]


def selftest():
    lines = [
        "agent guessed the wrong install flag for cursor",
        "agent picked the wrong flag when installing for cursor",
        "install flag guess was wrong again for cursor tools",
        "forgot to run tests before committing",
        "committed without running the test suite first",
        "unrelated one-off note about formatting",
    ]
    patterns = cluster(lines)
    assert len(patterns) == 2, patterns
    assert patterns[0]["count"] == 3, patterns[0]
    assert patterns[1]["count"] == 2, patterns[1]
    print("2/2 selftest clusters found correctly")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("file", nargs="?", help="file with one incident per line")
    ap.add_argument("--stdin", action="store_true")
    ap.add_argument("--min-shared", type=int, default=2, help="shared significant words to join a cluster")
    ap.add_argument("--min-count", type=int, default=2, help="minimum cluster size to report")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()

    if args.stdin:
        text = sys.stdin.read()
    elif args.file:
        text = open(args.file, encoding="utf-8").read()
    else:
        ap.error("pass a file, or --stdin")
        return 2

    lines = [l for l in text.splitlines() if l.strip()]
    patterns = cluster(lines, min_shared=args.min_shared, min_count=args.min_count)
    print(json.dumps({"input_lines": len(lines), "patterns": patterns}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
