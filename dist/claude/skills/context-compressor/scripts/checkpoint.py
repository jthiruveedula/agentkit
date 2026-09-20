#!/usr/bin/env python3
"""checkpoint.py — render a blank checkpoint template, or lint one.

Usage:
    python3 scripts/checkpoint.py render
    python3 scripts/checkpoint.py lint <file> [--json]

`lint` requires every section (Goal, Decisions, State, Open threads /
Next action) to be present and non-empty, and the whole file to be
<= 60 lines. Exit 0 on pass; non-zero with specific complaints on fail.
"""
import json
import re
import sys
from pathlib import Path

MAX_LINES = 60

# Section label -> heading patterns (case-insensitive) that satisfy it.
REQUIRED_SECTIONS = {
    "Goal": [r"^#+\s*goal\b"],
    "Decisions": [r"^#+\s*decisions?\b"],
    "State": [r"^#+\s*state\b"],
    "Open threads / Next action": [r"^#+\s*open\s*threads?\b", r"^#+\s*next\s*actions?\b"],
}

TEMPLATE = """# Checkpoint: <workstream name>
Key: <canonical key, e.g. proj.<name>.checkpoint>
Updated: <YYYY-MM-DD HH:MM TZ>

## Goal
<one line: the outcome this workstream is driving toward>

## Decisions
- <decision> — <reason>

## State
Done:
- <completed item, with artifact path if any>
In flight:
- <unfinished item — where it stands right now>

## Open threads
- <unresolved item> -> next: <concrete next action>

## Memory keys touched
- <key> — <what changed / why>
"""


def render() -> None:
    print(TEMPLATE, end="")


def lint(path: Path) -> tuple[bool, list[str], dict]:
    errors: list[str] = []
    if not path.is_file():
        return False, [f"not found: {path}"], {}
    lines = path.read_text(encoding="utf-8").splitlines()
    line_count = len(lines)
    if line_count > MAX_LINES:
        errors.append(
            f"too long: {line_count} lines (limit {MAX_LINES}) — compress it"
        )

    # Map each heading line to its section label, or None.
    section_body: dict[str, list[str]] = {label: [] for label in REQUIRED_SECTIONS}
    current: str | None = None
    for line in lines:
        stripped = line.strip()
        matched = None
        for label, patterns in REQUIRED_SECTIONS.items():
            if any(re.match(p, stripped, re.IGNORECASE) for p in patterns):
                matched = label
                break
        if matched is not None:
            current = matched
        elif current is not None:
            section_body[current].append(line)

    def is_placeholder(text: str) -> bool:
        t = text.strip()
        return (
            not t
            or t in ("...", "—", "-", "TODO", "TBD", "N/A", "n/a", "none", "None")
            or t.startswith("<") and t.endswith(">")
        )

    for label in REQUIRED_SECTIONS:
        content = [l for l in section_body[label] if not is_placeholder(l)]
        if not content:
            if not section_body[label]:
                errors.append(f"missing section: {label}")
            else:
                errors.append(f"empty section: {label} (only placeholders)")

    info = {
        "file": str(path),
        "line_count": line_count,
        "sections": {label: len([l for l in body if l.strip()]) > 0
                     for label, body in section_body.items()},
    }
    return not errors, errors, info


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in ("render", "lint"):
        print(__doc__.strip().splitlines()[0], file=sys.stderr)
        print("usage: checkpoint.py render | lint <file> [--json]", file=sys.stderr)
        return 2
    if argv[1] == "render":
        render()
        return 0
    if len(argv) < 3:
        print("lint: checkpoint file required", file=sys.stderr)
        return 2
    ok, errors, info = lint(Path(argv[2]))
    as_json = "--json" in argv[3:]
    if as_json:
        print(json.dumps({"ok": ok, "errors": errors, **info}, indent=2))
    else:
        if ok:
            print(f"OK: {info['file']} — {info['line_count']} lines, all sections present")
        else:
            print(f"FAIL: {info.get('file', argv[2])}")
            for e in errors:
                print(f"  - {e}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
