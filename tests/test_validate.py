"""Unit tests for scripts/validate.py -- run: python3 -m pytest tests/ -q"""
import json
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


def test_secret_in_skill_scripts_dir_is_caught(tmp_path):
    skill_dir = tmp_path / "skills" / "leaky-scripts"
    (skill_dir / "scripts").mkdir(parents=True)
    desc = "x" * 45 + " use when testing."
    (skill_dir / "SKILL.md").write_text(
        "---\nname: leaky-scripts\ndescription: %s\nversion: 0.1.0\n---\n\nbody\n" % desc
    )
    (skill_dir / "scripts" / "helper.sh").write_text(
        "#!/bin/sh\nTOKEN=ghp_%s\n" % ("b" * 36)
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any(
            "scripts/helper.sh" in e.replace("\\", "/")
            and "GitHub personal access token" in e
            for e in errors
        ), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_secret_in_skill_reference_dir_is_caught(tmp_path):
    skill_dir = tmp_path / "skills" / "leaky-ref"
    (skill_dir / "reference").mkdir(parents=True)
    desc = "x" * 45 + " use when testing."
    (skill_dir / "SKILL.md").write_text(
        "---\nname: leaky-ref\ndescription: %s\nversion: 0.1.0\n---\n\nbody\n" % desc
    )
    (skill_dir / "reference" / "notes.md").write_text(
        "example key: sk-ant-%s\n" % ("c" * 20)
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any(
            "reference/notes.md" in e.replace("\\", "/") and "Anthropic API key" in e
            for e in errors
        ), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def _write_lock(tmp_path, data):
    path = tmp_path / "skills.lock.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _good_lock():
    return {
        "sources": [
            {"name": "x", "repo": "o/r", "sha": "a" * 40,
             "license": "MIT", "for": "testing"},
            {"name": "y", "repo": "o/r2", "sha": "b" * 40,
             "license": "Apache-2.0", "sha256": "c" * 64},
        ]
    }


def test_lock_file_validates(tmp_path):
    assert validate.check_lock(_write_lock(tmp_path, _good_lock())) == []


def test_lock_file_rejects_missing_required_field(tmp_path):
    bad = _good_lock()
    del bad["sources"][0]["sha"]
    errors = validate.check_lock(_write_lock(tmp_path, bad))
    assert any("sources[0]" in e and "'sha'" in e for e in errors), errors


def test_lock_file_rejects_bad_sha_format(tmp_path):
    bad = _good_lock()
    bad["sources"][1]["sha"] = "not-a-sha"
    errors = validate.check_lock(_write_lock(tmp_path, bad))
    assert any("sources[1]" in e and "'sha'" in e for e in errors), errors


def test_lock_file_rejects_unknown_field(tmp_path):
    bad = _good_lock()
    bad["sources"][0]["licence"] = "MIT"  # typo'd key
    errors = validate.check_lock(_write_lock(tmp_path, bad))
    assert any("unexpected field 'licence'" in e for e in errors), errors


def test_lock_file_rejects_non_object(tmp_path):
    path = tmp_path / "skills.lock.json"
    path.write_text('{"sources": "nope"}', encoding="utf-8")
    errors = validate.check_lock(path)
    assert any("'sources' must be a non-empty array" in e for e in errors), errors


def test_real_lock_file_validates_clean():
    assert validate.check_lock() == []


def test_lock_schema_is_valid_json():
    schema = json.loads(
        (REPO_ROOT / "external" / "skills.lock.schema.json").read_text(encoding="utf-8")
    )
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert "sources" in schema["properties"]
    assert set(schema["properties"]["sources"]["items"]["required"]) == {
        "name", "repo", "sha", "license",
    }
