"""Tests for the setup-guardian skill (skills/setup-guardian/scripts/doctor.py).

Pure-helper tests use synthetic inputs in tmp dirs; the integration tests at
the bottom run (read-only) against the real repo. Nothing touches the real
$HOME -- explicit tmp home paths are passed everywhere.
"""

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "skills" / "setup-guardian" / "scripts"))

import doctor  # noqa: E402


# ---------------------------------------------------------------------------
# Pure helpers (synthetic inputs, no repo needed)
# ---------------------------------------------------------------------------


def _make_skill(repo: Path, name: str) -> None:
    d = repo / "skills" / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(f"# {name}\n")


def test_iter_skill_names(tmp_path):
    _make_skill(tmp_path, "a")
    _make_skill(tmp_path, "b")
    (tmp_path / "skills" / "empty").mkdir(parents=True)
    assert doctor.iter_skill_names(tmp_path) == ["a", "b"]


def test_iter_skill_names_sorted(tmp_path):
    _make_skill(tmp_path, "zeta")
    _make_skill(tmp_path, "alpha")
    assert doctor.iter_skill_names(tmp_path) == ["alpha", "zeta"]


def test_readme_claimed_count(tmp_path):
    assert doctor.readme_claimed_count("27 skills.") == 27
    assert doctor.readme_claimed_count("no count here") is None


def test_readme_claimed_count_first_match(tmp_path):
    text = "12 skills.\nLater the repo grew to 28 skills.\n"
    assert doctor.readme_claimed_count(text) == 12


def test_agents_table_names(tmp_path):
    text = (
        "# Agents\n\n"
        "## Skill catalog\n\n"
        "| `foo` | 0.1.0 | does foo |\n"
        "| `bar` | 0.2.0 | does bar |\n\n"
        "## Other\n\n"
        "| `baz` | 1.0.0 | not a skill |\n"
    )
    assert doctor.agents_table_names(text) == ["foo", "bar"]


def test_agents_table_names_no_section(tmp_path):
    text = "# Agents\n\n| `foo` | 0.1.0 | x |\n"
    assert doctor.agents_table_names(text) == []


def test_uses_pins_and_ref_kind():
    sha = "a" * 40
    text = (
        f"- uses: actions/checkout@{sha}\n"
        "- uses: actions/setup-python@12345678\n"
        "- uses: actions/upload-artifact@v4\n"
        "- uses: actions/cache@main\n"
    )
    pins = doctor.uses_pins(text)
    assert pins == [
        ("actions/checkout", sha),
        ("actions/setup-python", "12345678"),
        ("actions/upload-artifact", "v4"),
        ("actions/cache", "main"),
    ]
    assert doctor.ref_kind(sha) == "sha"
    assert doctor.ref_kind("12345678") == "malformed"
    assert doctor.ref_kind("v4") == "tag"
    assert doctor.ref_kind("main") == "tag"


def test_known_bad_shas():
    assert "249970729cb0ef3589644e2896644e5dc5ba9c38" in doctor.KNOWN_BAD_SHAS


def test_ci_aggregator_ok():
    fixed = (
        "failed = {k: v for k, v in needs.items() "
        'if v.get("result") not in ("success", "skipped")}'
    )
    ok, msg = doctor.ci_aggregator_ok(fixed)
    assert ok is True
    assert isinstance(msg, str)

    buggy = (
        'failed = {k: v for k, v in needs.items() if v not in ("success", "skipped")}'
    )
    ok, msg = doctor.ci_aggregator_ok(buggy)
    assert ok is False
    assert isinstance(msg, str)


def test_lock_problems():
    good = {"sha": "b" * 40, "license": "MIT"}
    assert doctor.lock_problems(good) == []

    bad_sha = {
        "sha": "249970729cb0ef3589644e2896644e5dc5ba9c38",
        "license": "MIT",
    }
    assert doctor.lock_problems(bad_sha) != []

    missing_license = {"sha": "c" * 40}
    assert doctor.lock_problems(missing_license) != []


def test_subprocess_env_findings():
    bad = 'import subprocess\nsubprocess.run(["ls"], env={"A": "1"})\n'
    findings = doctor.subprocess_env_findings(bad)
    assert any(level == "fail" for _, level, _ in findings)
    assert all(
        isinstance(lineno, int) and isinstance(msg, str) for lineno, _, msg in findings
    )

    ok_inherit = (
        'import os, subprocess\nsubprocess.run(["ls"], env=dict(os.environ, X="1"))\n'
    )
    assert doctor.subprocess_env_findings(ok_inherit) == []

    ok_none = 'import subprocess\nsubprocess.run(["ls"], env=None)\n'
    assert doctor.subprocess_env_findings(ok_none) == []


def test_tool_bases_keys_and_claude_home_override(tmp_path):
    bases = doctor.tool_bases(tmp_path, "linux", {})
    assert set(bases) == {"claude", "copilot", "cursor", "antigravity"}
    assert all(isinstance(p, Path) for p in bases.values())

    override = tmp_path / "custom-claude"
    bases = doctor.tool_bases(tmp_path, "linux", {"CLAUDE_HOME": str(override)})
    assert bases["claude"] == override


def test_tool_bases_darwin_copilot_path(tmp_path):
    darwin = doctor.tool_bases(tmp_path, "darwin", {})
    linux = doctor.tool_bases(tmp_path, "linux", {})
    # Darwin uses a platform-specific copilot path.
    assert darwin["copilot"] != linux["copilot"]
    assert darwin["copilot"].is_absolute()


def test_expected_install_dests_shape(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    home = tmp_path / "home"
    home.mkdir()
    dests = doctor.expected_install_dests(repo, home, "linux", {})
    assert set(dests) <= {"claude", "copilot", "cursor", "antigravity"}
    for tool, pairs in dests.items():
        assert isinstance(pairs, list)
        for src, dest in pairs:
            assert isinstance(src, Path) and isinstance(dest, Path)
            assert dest.is_absolute()


def test_classify_dest(tmp_path):
    src_file = tmp_path / "src.txt"
    src_file.write_text("src")
    other_file = tmp_path / "other.txt"
    other_file.write_text("other")

    # (a) valid symlink dest -> src
    ok_dest = tmp_path / "ok.txt"
    ok_dest.symlink_to(src_file)
    assert doctor.classify_dest(ok_dest, src_file) == "ok"

    # (b) symlink to nonexistent target
    dangling = tmp_path / "dangling.txt"
    dangling.symlink_to(tmp_path / "does-not-exist.txt")
    assert doctor.classify_dest(dangling, src_file) == "dangling"

    # (c) nothing at dest
    assert doctor.classify_dest(tmp_path / "missing.txt", src_file) == "missing"

    # (d) symlink to a different existing file
    elsewhere = tmp_path / "elsewhere.txt"
    elsewhere.symlink_to(other_file)
    assert doctor.classify_dest(elsewhere, src_file) == "elsewhere"

    # (e) real directory (a copy, not a symlink)
    src_dir = tmp_path / "srcdir"
    src_dir.mkdir()
    (src_dir / "f.txt").write_text("x")
    copy_dir = tmp_path / "copydir"
    copy_dir.mkdir()
    (copy_dir / "f.txt").write_text("x")
    assert doctor.classify_dest(copy_dir, src_dir) == "copy"


def test_checkresult_defaults():
    r = doctor.CheckResult(name="x", status="pass", message="m")
    assert r.fixed is False
    assert r.remediation == ""


# ---------------------------------------------------------------------------
# check_skill_count fix flow (synthetic repo)
# ---------------------------------------------------------------------------


def _write_skill_count_repo(repo: Path, readme_n: int, json_names, table_names):
    _make_skill(repo, "a")
    _make_skill(repo, "b")
    (repo / "README.md").write_text(f"{readme_n} skills.\n")
    assets = repo / "site" / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "skills.json").write_text(json.dumps([{"name": n} for n in json_names]))
    rows = "".join(f"| `{n}` | 0.1.0 | desc |\n" for n in table_names)
    (repo / "AGENTS.md").write_text(f"# Agents\n\n## Skill catalog\n\n{rows}")


def test_skill_count_fix_flow(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    _write_skill_count_repo(repo, readme_n=1, json_names=[], table_names=[])

    result = doctor.check_skill_count(repo)
    assert result.status == "fail"

    assert doctor.fix_readme_count(repo, 2) is True
    # Simulate regen of the generated artifacts.
    _write_skill_count_repo(
        repo, readme_n=2, json_names=["a", "b"], table_names=["a", "b"]
    )

    result = doctor.check_skill_count(repo)
    assert result.status == "pass"


def test_fix_readme_count_no_file(tmp_path):
    assert doctor.fix_readme_count(tmp_path, 2) is False


# ---------------------------------------------------------------------------
# main() CLI behaviour (monkeypatched run_all, no real repo)
# ---------------------------------------------------------------------------


def test_main_json_and_exit_codes(monkeypatch, capsys):
    monkeypatch.setattr(
        doctor,
        "run_all",
        lambda repo, fix=False: [
            doctor.CheckResult(name="x", status="pass", message="m")
        ],
    )
    with pytest.raises(SystemExit) as exc:
        doctor.main(["--json"])
    assert exc.value.code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True


def test_main_json_exit_code_on_fail(monkeypatch, capsys):
    monkeypatch.setattr(
        doctor,
        "run_all",
        lambda repo, fix=False: [
            doctor.CheckResult(name="x", status="fail", message="m")
        ],
    )
    with pytest.raises(SystemExit) as exc:
        doctor.main(["--json"])
    assert exc.value.code == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is False


# ---------------------------------------------------------------------------
# Real-repo integration (read-only; validate the sibling's integration work)
# ---------------------------------------------------------------------------


def test_find_repo_root():
    assert doctor.find_repo_root(Path(doctor.__file__)) == REPO_ROOT


def test_real_repo_skill_count():
    result = doctor.check_skill_count(REPO_ROOT)
    assert result.status == "pass", result.message


def test_real_repo_ci_aggregator():
    result = doctor.check_ci_aggregator(REPO_ROOT)
    assert result.status == "pass", result.message


def test_real_repo_pinned_shas():
    result = doctor.check_pinned_shas(REPO_ROOT)
    # pages.yml uses @v4 tag pins -> warn is acceptable; fail is not.
    assert result.status in ("pass", "warn"), result.message


def test_real_repo_external_lock():
    result = doctor.check_external_lock(REPO_ROOT)
    assert result.status in ("pass", "warn"), result.message


def test_real_repo_subprocess_env():
    result = doctor.check_subprocess_env(REPO_ROOT)
    assert result.status == "pass", result.message


def test_real_repo_dist_freshness():
    result = doctor.check_dist_freshness(REPO_ROOT)
    assert result.status == "pass", result.message
