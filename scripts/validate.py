#!/usr/bin/env python3
"""Validate every skills/<name>/SKILL.md against the repo schema.

Checks: frontmatter parses, required keys present, name is kebab-case and
matches its directory, description length 40-500 chars and states a
trigger, no duplicate names, no broken relative links, no obvious secrets.
Exit 0 = clean, 1 = violations found (printed to stderr).
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from frontmatter import FrontmatterError, load  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = REPO_ROOT / "skills"
NAME_RE = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
LINK_RE = re.compile(r"\]\(([^)#]+)\)")

# Deliberately conservative -- these catch what's plausible to accidentally
# paste into a skill doc, not a general secret scanner.
SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9]{20,}"), "OpenAI-style API key"),
    (re.compile(r"sk-ant-[A-Za-z0-9-]{20,}"), "Anthropic API key"),
    (re.compile(r"ghp_[A-Za-z0-9]{36,}"), "GitHub personal access token"),
    (re.compile(r"gho_[A-Za-z0-9]{36,}"), "GitHub OAuth token"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key ID"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key block"),
    (re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"), "Slack token"),
]

REQUIRED_KEYS = ("name", "description", "version")


def find_skill_files():
    return sorted(SKILLS_DIR.glob("*/SKILL.md"))


def check_secrets(text, origin, errors):
    for pat, label in SECRET_PATTERNS:
        if pat.search(text):
            errors.append("%s: looks like a %s -- remove before committing" % (origin, label))


def check_links(body, skill_dir, origin, errors):
    for target in LINK_RE.findall(body):
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        if (skill_dir / target).resolve().exists():
            continue
        errors.append("%s: broken relative link -> %s" % (origin, target))


def validate():
    errors = []
    seen_names = {}
    files = find_skill_files()
    if not files:
        errors.append("no skills/*/SKILL.md found")

    for path in files:
        try:
            origin = str(path.relative_to(REPO_ROOT))
        except ValueError:
            origin = str(path)
        skill_dir = path.parent
        text = path.read_text(encoding="utf-8")
        check_secrets(text, origin, errors)

        try:
            meta, body = load(path)
        except FrontmatterError as e:
            errors.append(str(e))
            continue

        for key in REQUIRED_KEYS:
            if not meta.get(key):
                errors.append("%s: missing required frontmatter key '%s'" % (origin, key))

        name = meta.get("name", "")
        if name and not NAME_RE.match(name):
            errors.append("%s: name '%s' is not kebab-case" % (origin, name))
        if name and name != skill_dir.name:
            errors.append("%s: frontmatter name '%s' != directory '%s'" % (origin, name, skill_dir.name))
        if name:
            if name in seen_names:
                errors.append("%s: duplicate skill name '%s' (also in %s)" % (origin, name, seen_names[name]))
            else:
                seen_names[name] = origin

        desc = meta.get("description", "")
        if desc and not (40 <= len(desc) <= 500):
            errors.append("%s: description is %d chars, must be 40-500" % (origin, len(desc)))
        if desc and "use when" not in desc.lower():
            errors.append("%s: description must state a trigger (\"Use when ...\")" % origin)

        body_lines = len(body.splitlines())
        if body_lines > 500:
            errors.append("%s: body is %d lines, must be under 500 (push depth into reference/)" % (origin, body_lines))

        check_links(body, skill_dir, origin, errors)

    return errors


def main():
    errors = validate()
    for e in errors:
        print("FAIL " + e, file=sys.stderr)
    if errors:
        print("%d violation(s)" % len(errors), file=sys.stderr)
        return 1
    print("%d skill(s) validated clean" % len(find_skill_files()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
