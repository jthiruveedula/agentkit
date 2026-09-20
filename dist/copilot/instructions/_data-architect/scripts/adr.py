#!/usr/bin/env python3
"""Architecture Decision Record log -- the memory layer for data-architect.

Every non-trivial storage/compute/orchestration choice gets written down
once, here, instead of re-litigated (or silently re-decided differently)
next session. ADRs live at <project>/docs/adr/NNNN-slug.md -- plain
markdown, no database, so they travel with the repo and are readable
without this script.

    python3 adr.py new "Use BigQuery over Snowflake for analytics warehouse" \\
        --context "Team already on GCP; need sub-second dashboard queries" \\
        --decision "BigQuery, partitioned by event_date, clustered by tenant_id" \\
        --consequences "Vendor lock-in to GCP; BQ ML available if needed later"

    python3 adr.py list                 # all ADRs, newest first
    python3 adr.py search "warehouse"   # grep titles + context
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

ADR_DIR_NAME = "docs/adr"


def find_adr_dir(start=None):
    """Walk up from cwd (or start) to find a repo root (.git), then use
    <root>/docs/adr. Falls back to ./docs/adr if no .git is found."""
    cur = Path(start or Path.cwd()).resolve()
    for candidate in [cur, *cur.parents]:
        if (candidate / ".git").exists():
            return candidate / ADR_DIR_NAME
    return cur / ADR_DIR_NAME


def slugify(title):
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug[:60]


def next_number(adr_dir):
    if not adr_dir.is_dir():
        return 1
    nums = []
    for f in adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md"):
        try:
            nums.append(int(f.name[:4]))
        except ValueError:
            continue
    return max(nums, default=0) + 1


def cmd_new(args):
    adr_dir = find_adr_dir()
    adr_dir.mkdir(parents=True, exist_ok=True)
    n = next_number(adr_dir)
    slug = slugify(args.title)
    path = adr_dir / f"{n:04d}-{slug}.md"
    date = datetime.date.today().isoformat()

    body = (
        f"# {n:04d}. {args.title}\n\n"
        f"Date: {date}\n"
        f"Status: {args.status}\n\n"
        f"## Context\n\n{args.context or '(fill in)'}\n\n"
        f"## Decision\n\n{args.decision or '(fill in)'}\n\n"
        f"## Consequences\n\n{args.consequences or '(fill in)'}\n"
    )
    path.write_text(body, encoding="utf-8")
    print("wrote %s" % path)
    return 0


def cmd_list(args):
    adr_dir = find_adr_dir()
    if not adr_dir.is_dir():
        print("no ADRs yet (%s doesn't exist)" % adr_dir)
        return 0
    files = sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md"), reverse=True)
    for f in files:
        first_line = f.read_text(encoding="utf-8").splitlines()[0]
        print("%s  %s" % (f.name, first_line.lstrip("# ")))
    if not files:
        print("no ADRs yet in %s" % adr_dir)
    return 0


def cmd_search(args):
    adr_dir = find_adr_dir()
    if not adr_dir.is_dir():
        print("no ADRs yet (%s doesn't exist)" % adr_dir)
        return 0
    needle = args.query.lower()
    hits = 0
    for f in sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md")):
        text = f.read_text(encoding="utf-8")
        if needle in text.lower():
            hits += 1
            first_line = text.splitlines()[0].lstrip("# ")
            print("%s  %s" % (f.name, first_line))
    if not hits:
        print("no ADRs matched %r" % args.query)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_new = sub.add_parser("new", help="record a new decision")
    p_new.add_argument("title")
    p_new.add_argument("--context", default="")
    p_new.add_argument("--decision", default="")
    p_new.add_argument("--consequences", default="")
    p_new.add_argument("--status", default="accepted", choices=["proposed", "accepted", "superseded"])
    p_new.set_defaults(func=cmd_new)

    p_list = sub.add_parser("list", help="list all ADRs, newest first")
    p_list.set_defaults(func=cmd_list)

    p_search = sub.add_parser("search", help="search ADR titles + body text")
    p_search.add_argument("query")
    p_search.set_defaults(func=cmd_search)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
