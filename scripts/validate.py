#!/usr/bin/env python3
"""Validate every skills/<name>/SKILL.md against the repo schema.

Checks: frontmatter parses, required keys present, name is kebab-case and
matches its directory, description length 40-500 chars and states a
trigger, no duplicate names, no broken relative links, no obvious secrets
(SKILL.md plus text files under each skill's reference/, scripts/ and
tests/ dirs), and external/skills.lock.json conforms to
external/skills.lock.schema.json (required fields and types per source).
Exit 0 = clean, 1 = violations found (printed to stderr).
"""
import json
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
#
# Finding CODES only -- the human-readable meaning lives in this comment,
# never in a string that reaches log output. The scanner reports the file
# and the code; the matched secret VALUE is never logged (a scanner that
# echoes secrets into CI logs would be worse than no scanner).
#   openai:    OpenAI-style API key (sk-...)
#   anthropic: Anthropic API key (sk-ant-...)
#   github:    GitHub token (ghp_... / gho_...)
#   aws:       AWS access key ID (AKIA...)
#   pem:       private key block
#   slack:     Slack token (xox...)
DISALLOWED_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9]{20,}"), "openai"),
    (re.compile(r"sk-ant-[A-Za-z0-9-]{20,}"), "anthropic"),
    (re.compile(r"ghp_[A-Za-z0-9]{36,}"), "github"),
    (re.compile(r"gho_[A-Za-z0-9]{36,}"), "github"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "aws"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "pem"),
    (re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"), "slack"),
]

# Skill subdirs whose text files are secret-scanned alongside SKILL.md, and
# the file types covered. Binary blobs and anything else are skipped.
SCAN_SUBDIRS = ("reference", "scripts", "tests")
SCAN_SUFFIXES = (".md", ".py", ".sh", ".js", ".json", ".yml", ".yaml", ".toml")

REQUIRED_KEYS = ("name", "description", "version")

# external/skills.lock.json validation -- mirrors
# external/skills.lock.schema.json (stdlib only; kept in sync by hand).
LOCK_FILE = REPO_ROOT / "external" / "skills.lock.json"
LOCK_TOP_KEYS = ("$schema", "note", "sources")
LOCK_REQUIRED_KEYS = ("name", "repo", "sha", "license")
LOCK_OPTIONAL_KEYS = ("for", "sha256")
LOCK_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
LOCK_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
LOCK_REPO_RE = re.compile(r"^[^/\s]+/[^/\s]+$")


def find_skill_files():
    return sorted(SKILLS_DIR.glob("*/SKILL.md"))


def check_disallowed_patterns(text, origin, errors):
    for pat, code in DISALLOWED_PATTERNS:
        if pat.search(text):
            errors.append("%s: disallowed pattern [%s] -- remove before committing" % (origin, code))


def check_skill_extra_files(skill_dir, errors):
    for sub in SCAN_SUBDIRS:
        subdir = skill_dir / sub
        if not subdir.is_dir():
            continue
        for path in sorted(subdir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SCAN_SUFFIXES:
                continue
            try:
                origin = str(path.relative_to(REPO_ROOT))
            except ValueError:
                origin = str(path)
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            check_disallowed_patterns(text, origin, errors)


def check_links(body, skill_dir, origin, errors):
    for target in LINK_RE.findall(body):
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        if (skill_dir / target).resolve().exists():
            continue
        errors.append("%s: broken relative link -> %s" % (origin, target))


def check_lock(lock_path=None):
    """Validate a skills lock file; defaults to the repo's own. Returns a
    list of error strings (empty = valid)."""
    errors = []
    lock_path = Path(lock_path) if lock_path is not None else LOCK_FILE
    try:
        origin = str(lock_path.relative_to(REPO_ROOT))
    except ValueError:
        origin = str(lock_path)
    try:
        data = json.loads(lock_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return ["%s: lock file not found" % origin]
    except (OSError, ValueError) as e:
        return ["%s: cannot be read as JSON: %s" % (origin, e)]
    if not isinstance(data, dict):
        return ["%s: top level must be an object" % origin]
    for key in data:
        if key not in LOCK_TOP_KEYS:
            errors.append("%s: unexpected top-level key '%s'" % (origin, key))
    sources = data.get("sources")
    if not isinstance(sources, list) or not sources:
        errors.append("%s: 'sources' must be a non-empty array" % origin)
        return errors
    for i, entry in enumerate(sources):
        where = "%s: sources[%d]" % (origin, i)
        if not isinstance(entry, dict):
            errors.append("%s: must be an object" % where)
            continue
        for key in LOCK_REQUIRED_KEYS:
            val = entry.get(key)
            if not isinstance(val, str) or not val:
                errors.append("%s: missing or empty required field '%s'" % (where, key))
        for key in LOCK_OPTIONAL_KEYS:
            if key in entry and not isinstance(entry[key], str):
                errors.append("%s: optional field '%s' must be a string" % (where, key))
        for key in entry:
            if key not in LOCK_REQUIRED_KEYS + LOCK_OPTIONAL_KEYS:
                errors.append("%s: unexpected field '%s'" % (where, key))
        sha = entry.get("sha")
        if isinstance(sha, str) and sha and not LOCK_SHA_RE.match(sha):
            errors.append("%s: 'sha' must be a 40-char hex commit sha" % where)
        repo = entry.get("repo")
        if isinstance(repo, str) and repo and not LOCK_REPO_RE.match(repo):
            errors.append("%s: 'repo' must look like 'owner/name'" % where)
        sha256 = entry.get("sha256")
        if isinstance(sha256, str) and sha256 and not LOCK_SHA256_RE.match(sha256):
            errors.append("%s: 'sha256' must be a 64-char hex digest" % where)
    names = [e.get("name") for e in sources if isinstance(e, dict) and isinstance(e.get("name"), str)]
    for name in sorted({n for n in names if names.count(n) > 1}):
        errors.append("%s: duplicate source name '%s'" % (origin, name))
    return errors


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
        check_disallowed_patterns(text, origin, errors)
        check_skill_extra_files(skill_dir, errors)

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

    errors.extend(check_lock())

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
