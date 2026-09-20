"""Unit tests for scripts/validate.py -- run: python3 -m pytest tests/ -q"""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

import validate  # noqa: E402
from frontmatter import FrontmatterError, dump, load, parse  # noqa: E402


def test_real_skills_validate_clean():
    assert validate.validate() == []


def test_frontmatter_roundtrip():
    meta, body = parse("---\nname: x\ndescription: 'a, b'\nallowed-tools: [Read, Bash]\n---\n\nhello\n")
    assert meta == {"name": "x", "description": "a, b", "allowed-tools": ["Read", "Bash"]}
    assert body == "hello\n"
    rendered = dump(meta)
    reparsed, _ = parse(rendered + "\nbody\n")
    assert reparsed == meta


def test_frontmatter_rejects_missing_delimiter():
    try:
        parse("no frontmatter here")
    except FrontmatterError:
        pass
    else:
        raise AssertionError("expected FrontmatterError")


def test_frontmatter_rejects_unterminated_block():
    try:
        parse("---\nname: x\n")
    except FrontmatterError:
        pass
    else:
        raise AssertionError("expected FrontmatterError")


def test_kebab_case_name_required(tmp_path):
    skill_dir = tmp_path / "skills" / "Bad_Name"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: Bad_Name\ndescription: " + "x" * 45 + " use when testing.\nversion: 0.1.0\n---\n\nbody\n"
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any("not kebab-case" in e for e in errors), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_description_too_short_is_rejected(tmp_path):
    skill_dir = tmp_path / "skills" / "short-desc"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: short-desc\ndescription: too short. use when.\nversion: 0.1.0\n---\n\nbody\n"
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any("40-500" in e for e in errors), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_secret_pattern_detected(tmp_path):
    skill_dir = tmp_path / "skills" / "leaky"
    skill_dir.mkdir(parents=True)
    desc = "x" * 45 + " use when testing."
    (skill_dir / "SKILL.md").write_text(
        "---\nname: leaky\ndescription: %s\nversion: 0.1.0\n---\n\n"
        "token: ghp_%s\n" % (desc, "a" * 36)
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any("GitHub personal access token" in e for e in errors), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_cli_exit_code_clean_repo():
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py")],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
