"""Unit tests for scripts/validate.py -- run: python3 -m pytest tests/ -q"""

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

import validate  # noqa: E402
from frontmatter import FrontmatterError, dump, parse  # noqa: E402


def test_real_skills_validate_clean():
    assert validate.validate() == []


def test_frontmatter_roundtrip():
    meta, body = parse(
        "---\nname: x\ndescription: 'a, b'\nallowed-tools: [Read, Bash]\n---\n\nhello\n"
    )
    assert meta == {
        "name": "x",
        "description": "a, b",
        "allowed-tools": ["Read", "Bash"],
    }
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


def test_globs_must_be_a_string(tmp_path):
    skill_dir = tmp_path / "skills" / "globby"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: globby\ndescription: "
        + "x" * 45
        + " use when testing.\nversion: 0.1.0\nglobs: [a, b]\n---\n\nbody\n"
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any("'globs' must be" in e for e in errors), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_kebab_case_name_required(tmp_path):
    skill_dir = tmp_path / "skills" / "Bad_Name"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: Bad_Name\ndescription: "
        + "x" * 45
        + " use when testing.\nversion: 0.1.0\n---\n\nbody\n"
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any("not kebab-case" in e for e in errors), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def _bash_errors(tmp_path, tools):
    skill_dir = tmp_path / "skills" / "bashy"
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: bashy\ndescription: "
        + "x" * 45
        + " use when testing.\nversion: 0.1.0\nallowed-tools: %s\n---\n\nbody\n" % tools
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        return [e for e in validate.validate() if "bare 'Bash'" in e]
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_bare_bash_in_allowed_tools_is_rejected(tmp_path):
    assert _bash_errors(tmp_path, "Read, Bash")
    assert _bash_errors(tmp_path, "Bash")
    assert _bash_errors(tmp_path, "[Read, Bash]")
    assert _bash_errors(tmp_path, "Bash(git log *), Bash, Read")


def test_scoped_bash_in_allowed_tools_is_accepted(tmp_path):
    assert not _bash_errors(tmp_path, "Bash(git log *), Bash(gh pr view:*), Read")
    assert not _bash_errors(tmp_path, "Read, Grep")


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
        assert any("disallowed pattern" in e and "[github]" in e for e in errors), (
            errors
        )
        assert not any("ghp_" + "a" * 36 in e for e in errors), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_cli_exit_code_clean_repo():
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "validate.py")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_secret_in_skill_scripts_dir_is_caught(tmp_path):
    skill_dir = tmp_path / "skills" / "leaky-scripts"
    (skill_dir / "scripts").mkdir(parents=True)
    desc = "x" * 45 + " use when testing."
    (skill_dir / "SKILL.md").write_text(
        "---\nname: leaky-scripts\ndescription: %s\nversion: 0.1.0\n---\n\nbody\n"
        % desc
    )
    (skill_dir / "scripts" / "helper.sh").write_text(
        "#!/bin/sh\nTOKEN=ghp_%s\n" % ("b" * 36)
    )
    validate.SKILLS_DIR = tmp_path / "skills"
    try:
        errors = validate.validate()
        assert any(
            "scripts/helper.sh" in e.replace("\\", "/")
            and "disallowed pattern" in e
            and "[github]" in e
            for e in errors
        ), errors
        assert not any("ghp_" + "b" * 36 in e for e in errors), errors
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
            "reference/notes.md" in e.replace("\\", "/")
            and "disallowed pattern" in e
            and "[anthropic]" in e
            for e in errors
        ), errors
        assert not any("sk-ant-" + "c" * 20 in e for e in errors), errors
    finally:
        validate.SKILLS_DIR = REPO_ROOT / "skills"


def test_secret_value_never_echoed_in_cli_output(tmp_path):
    """Regression test for the CodeQL clear-text-logging alert: the scanner
    must report the file and finding code, but the secret VALUE must never
    appear in stdout/stderr (a scanner that echoes secrets into CI logs
    would be worse than no scanner)."""
    fake_token = "ghp_" + "z" * 36
    skill_dir = tmp_path / "skills" / "leaky-cli"
    skill_dir.mkdir(parents=True)
    desc = "x" * 45 + " use when testing."
    (skill_dir / "SKILL.md").write_text(
        "---\nname: leaky-cli\ndescription: %s\nversion: 0.1.0\n---\n\n"
        "token: %s\n" % (desc, fake_token)
    )
    # Point the CLI at the temp skills dir via a sitecustomize-style shim:
    # validate.py resolves skills/ relative to the repo root, so instead run
    # the module with SKILLS_DIR patched through a driver script.
    driver = tmp_path / "driver.py"
    driver.write_text(
        "import sys\n"
        "from pathlib import Path\n"
        "sys.path.insert(0, %r)\n"
        "sys.path.insert(0, %r)\n"
        "import validate\n"
        "validate.SKILLS_DIR = Path(%r)\n"
        "sys.exit(validate.main())\n"
        % (
            str(REPO_ROOT / "scripts"),
            str(REPO_ROOT / "scripts" / "lib"),
            str(tmp_path / "skills"),
        )
    )
    result = subprocess.run(
        [sys.executable, str(driver)],
        capture_output=True,
        text=True,
    )
    combined = result.stdout + result.stderr
    assert result.returncode != 0, combined
    assert "leaky-cli" in combined, combined  # file is named
    assert "[github]" in combined, combined  # finding code reported
    assert fake_token not in combined, combined  # value never echoed


def _write_lock(tmp_path, data):
    path = tmp_path / "skills.lock.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _good_lock():
    return {
        "sources": [
            {
                "name": "x",
                "repo": "o/r",
                "sha": "a" * 40,
                "license": "MIT",
                "for": "testing",
            },
            {
                "name": "y",
                "repo": "o/r2",
                "sha": "b" * 40,
                "license": "Apache-2.0",
                "sha256": "c" * 64,
            },
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
        "name",
        "repo",
        "sha",
        "license",
    }


def _agent(tmp_path, name="a", extra="", **over):
    fm = {
        "name": name,
        "description": "Does a thing. Use when needed.",
        "tools": "Read, Grep",
        "model": "sonnet",
    }
    fm.update(over)
    agents = tmp_path / "agents"
    agents.mkdir(exist_ok=True)
    text = "---\n%s\n---\n\nbody\n" % "\n".join("%s: %s" % kv for kv in fm.items())
    (agents / (name + ".md")).write_text(text + extra)
    return agents


def _check(tmp_path, agents):
    (tmp_path / "skills" / "real").mkdir(parents=True, exist_ok=True)
    (tmp_path / "skills" / "real" / "SKILL.md").write_text("x")
    return validate.check_agents(agents, tmp_path / "skills")


def test_real_agents_validate_clean():
    assert validate.check_agents() == []


def test_agent_good_passes(tmp_path):
    agents = _agent(tmp_path, skills="[real]")
    assert _check(tmp_path, agents) == []


def test_agent_name_must_match_filename(tmp_path):
    agents = _agent(tmp_path, name="a")
    (agents / "a.md").write_text(
        (agents / "a.md").read_text().replace("name: a", "name: b")
    )
    assert any("!= filename" in e for e in _check(tmp_path, agents))


def test_agent_rejects_unknown_tool_model_and_skill(tmp_path):
    agents = _agent(tmp_path, tools="Read, Frobnicate", model="gpt", skills="[nope]")
    errors = "\n".join(_check(tmp_path, agents))
    assert "unknown tool 'Frobnicate'" in errors
    assert "model 'gpt'" in errors
    assert "skills entry 'nope'" in errors


def test_agent_empty_description_and_missing_tools(tmp_path):
    agents = _agent(tmp_path, description="''", tools="''")
    errors = "\n".join(_check(tmp_path, agents))
    assert "empty description" in errors
    assert "'tools' missing" in errors


def test_agent_read_only_claim_forbids_write_tools(tmp_path):
    desc = "Read-only scout. Use when needed."
    agents = _agent(tmp_path, description=desc)
    assert _check(tmp_path, agents) == []
    agents = _agent(tmp_path, description=desc, tools="Read, Edit")
    assert any("read-only" in e for e in _check(tmp_path, agents))


def test_agent_roster_must_name_existing_agents(tmp_path):
    agents = _agent(tmp_path, name="a", tools="Read, Agent(b, ghost)")
    _agent(tmp_path, name="b")
    errors = _check(tmp_path, agents)
    assert any("unknown agent 'ghost'" in e for e in errors), errors
    assert not any("'b'" in e for e in errors), errors
