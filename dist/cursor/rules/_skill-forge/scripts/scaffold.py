#!/usr/bin/env python3
"""Scaffold a new canonical skill. Usage:
    python3 scaffold.py <kebab-case-name> "<description. Use when X.>"

Creates skills/<name>/{SKILL.md,reference/,scripts/,tests/} plus a golden
test stub at skills/<name>/tests/test_<name>.py.
"""
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILLS_DIR = REPO_ROOT / "skills"
NAME_RE = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")

TEST_STUB = '''"""Golden tests for the {name} skill.

Add (input, expected) pairs to GOLDEN_CASES below -- this file is picked up
by the repo's pytest suite. Modeled on tests/test_golden_intent.py: each
case pins one observable behavior of the skill so regressions fail loudly.
"""
import pytest
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]

# (input, expected) pairs pinning the skill's core behavior.
GOLDEN_CASES = [
    # ("example input", "expected output"),
]


def run_skill(given):
    """TODO: wire this to the skill's script/entry point, then fill in GOLDEN_CASES."""
    raise NotImplementedError("wire run_skill to skills/{name}/scripts/ first")


def test_skill_md_exists():
    assert (SKILL_DIR / "SKILL.md").exists()


def test_golden_cases():
    if not GOLDEN_CASES:
        pytest.skip("add (input, expected) pairs to GOLDEN_CASES")
    for given, want in GOLDEN_CASES:
        assert run_skill(given) == want
'''


def main(argv):
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    name, description = argv
    if not NAME_RE.match(name):
        print("error: name must be kebab-case (e.g. my-new-skill)", file=sys.stderr)
        return 2
    if not (40 <= len(description) <= 500):
        print("error: description must be 40-500 chars", file=sys.stderr)
        return 2
    if "use when" not in description.lower():
        print('error: description must state a trigger ("Use when ...")', file=sys.stderr)
        return 2

    skill_dir = SKILLS_DIR / name
    if skill_dir.exists():
        print("error: skills/%s already exists" % name, file=sys.stderr)
        return 2

    for sub in ("reference", "scripts", "tests"):
        (skill_dir / sub).mkdir(parents=True, exist_ok=True)

    (skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: %s\n"
        "description: %s\n"
        "version: 0.1.0\n"
        "---\n\n"
        "# %s\n\n"
        "TODO: procedure.\n" % (name, description, name.replace("-", " ").title()),
        encoding="utf-8",
    )
    (skill_dir / "reference" / ".gitkeep").touch()
    (skill_dir / "scripts" / ".gitkeep").touch()
    test_name = "test_%s.py" % name.replace("-", "_")
    (skill_dir / "tests" / test_name).write_text(
        TEST_STUB.format(name=name), encoding="utf-8"
    )
    print("created skills/%s/" % name)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
