#!/usr/bin/env python3
"""Build the landing page's skill catalog data.

Reads every `skills/*/SKILL.md` frontmatter block (name, description,
version), derives the `kind` facet from the name prefix (`ext-*` skills
are the router skills; the rest are native), and writes
`site/assets/skills.json`.

GitHub Pages deploys `site/` statically with NO build step, so the
generated JSON is committed to the repo and the page loads it at
runtime. Re-run this script whenever a skill is added, renamed, or its
frontmatter changes:

    python3 site/scripts/build-catalog.py

Run it from the repo root. Exits non-zero if no skills are found.
"""

from __future__ import annotations

import json
import re
import sys
from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]  # repo root (site/scripts/ -> repo)
OUT = REPO / "site" / "assets" / "skills.json"
INDEX = REPO / "site" / "index.html"
BAKE_RE = re.compile(r"(<!-- slips:start -->\n).*?(<!-- slips:end -->)", re.DOTALL)
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*", re.DOTALL)


def parse_frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(text)
    if not match:
        raise ValueError(f"{path}: no frontmatter block found")
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip()
    return fields


def bake(skills: list, html: str) -> str:
    """Return html with the skill list baked between the slips markers.

    Gives the catalog a no-JS rendering; app.js clears and rebuilds it
    (progressive enhancement). Sorted by name, like app.js.
    """
    items = "".join(
        '<li class="%s"><span class="b">%s</span></li>\n'
        % ("" if s["kind"] == "native" else "x", escape(s["name"]))
        for s in sorted(skills, key=lambda s: s["name"])
    )
    return BAKE_RE.sub(lambda m: m.group(1) + items + m.group(2), html, count=1)


def main() -> int:
    skill_dirs = sorted((REPO / "skills").iterdir())
    skills = []
    for skill_dir in skill_dirs:
        md = skill_dir / "SKILL.md"
        if not skill_dir.is_dir() or not md.exists():
            continue
        fm = parse_frontmatter(md)
        for key in ("name", "description", "version"):
            if not fm.get(key):
                raise ValueError(f"{md}: frontmatter missing '{key}'")
        skills.append(
            {
                "name": fm["name"],
                "description": fm["description"],
                "version": fm["version"],
                "kind": "router" if fm["name"].startswith("ext-") else "native",
            }
        )

    if not skills:
        print("build-catalog: no skills found under skills/", file=sys.stderr)
        return 1

    # Native first, then router skills; alphabetical inside each group.
    skills.sort(key=lambda s: (s["kind"] != "native", s["name"]))

    payload = {
        "generated_by": "site/scripts/build-catalog.py",
        "count": len(skills),
        "skills": skills,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    INDEX.write_text(bake(skills, INDEX.read_text(encoding="utf-8")), encoding="utf-8")

    native = sum(1 for s in skills if s["kind"] == "native")
    router = len(skills) - native
    print(
        f"build-catalog: wrote {OUT.relative_to(REPO)} ({len(skills)} skills: {native} native, {router} router)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
