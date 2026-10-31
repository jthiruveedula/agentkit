"""Golden tests for session-insights: the fixture transcript pins each
friction signal, and the CLI must report on an empty root without crashing."""

import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "insights.py"


def run(*args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], capture_output=True, text=True
    )


def test_selftest_passes():
    r = run("--selftest")
    assert r.returncode == 0, r.stdout + r.stderr


def test_empty_root_reports_cleanly(tmp_path):
    r = run("--root", str(tmp_path))
    assert r.returncode == 0
    assert "no sessions found" in r.stdout


def test_json_and_incidents(tmp_path):
    proj = tmp_path / "proj"
    proj.mkdir()
    (proj / "s.jsonl").write_text(
        (SCRIPT.parents[1] / "tests" / "fixture.jsonl").read_text()
    )
    r = run("--root", str(tmp_path), "--json")
    assert r.returncode == 0 and '"correction_rate": 0.5' in r.stdout, r.stdout
    r = run("--root", str(tmp_path), "--incidents")
    assert r.stdout.count("\n") == 3, r.stdout


def _load(name):
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "si_" + name, SCRIPT.parent / (name + ".py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _root(tmp_path, copies=1):
    fixture = (SCRIPT.parents[1] / "tests" / "fixture.jsonl").read_text()
    for i in range(copies):
        proj = tmp_path / "projects" / f"p{i}"
        proj.mkdir(parents=True)
        (proj / f"s{i}.jsonl").write_text(fixture)
    return tmp_path / "projects"


def test_outcome_cost_subagents_and_gaps(tmp_path):
    ins = _load("insights")
    root = _root(tmp_path, copies=3)
    sessions = [
        ins.parse_session(str(f), ins._load_classifier())
        for f in sorted(root.glob("*/*.jsonl"))
    ]
    m = ins.analyze(sessions)
    assert m["outcomes"] == {"abandoned": 3} and m["success_rate"] == 0.0
    assert m["subagents"]["calls"] == 3 and m["subagents"]["share"] == 0.44
    assert m["setup_gaps"][0]["gap"] == "missing Python deps"
    assert sum(v["sessions"] for v in m["cost_by_intent"].values()) == 3


def test_outcome_rules():
    ins = _load("insights")
    base = {"shipped": False, "last_test_ok": None, "ended_on_friction": False}
    assert ins.outcome(dict(base, shipped=True)) == "shipped"
    assert ins.outcome(dict(base, last_test_ok=True)) == "tests-green"
    assert ins.outcome(dict(base, last_test_ok=False)) == "abandoned"
    assert ins.outcome(base) == "exploratory"


def test_subagent_transcript_dir(tmp_path):
    ins = _load("insights")
    root = _root(tmp_path)
    sub = root / "p0" / "s0" / "subagents"
    sub.mkdir(parents=True)
    (sub / "agent-1.jsonl").write_text(
        '{"message": {"id": "m1", "usage": {"input_tokens": 100}}}\n'
        '{"message": {"id": "m1", "usage": {"input_tokens": 100}}}\nnot json\n'
    )
    s = ins.parse_session(str(root / "p0" / "s0.jsonl"), lambda t: "debug")
    assert s["subagent_tokens"] == 160  # 60 inline + 100 deduped by message id


def test_save_trend_html_and_drafts(tmp_path, monkeypatch, capsys):
    ins = _load("insights")
    monkeypatch.setenv("AGENTKIT_HOME", str(tmp_path / "home"))
    root = _root(tmp_path, copies=3)
    old = {"date": "2026-01-01", "correction_rate": 0.9, "vague_rate": 0.1}
    (tmp_path / "home" / "insights").mkdir(parents=True)
    (tmp_path / "home" / "insights" / "2026-01-01.json").write_text(
        __import__("json").dumps(old)
    )
    out_html = tmp_path / "r.html"
    assert ins.main(["--root", str(root), "--save", "--html", str(out_html)]) == 0
    text = capsys.readouterr().out
    assert "since 2026-01-01" in text and "corrections 90% -> 50% (better)" in text
    assert "vague prompts 10% -> 25% (worse)" in text
    assert len(ins.history()) == 2
    page = out_html.read_text()
    assert "2026-01-01" in page and "missing Python deps" in page

    cmds = tmp_path / "cmds"
    assert ins.main(["--root", str(root), "--draft-commands", str(cmds)]) == 0
    drafts = list(cmds.glob("*.md"))
    assert drafts, capsys.readouterr().out
    body = drafts[0].read_text()
    assert "$ARGUMENTS" in body and body.startswith("---\ndescription:")
    drafts[0].write_text("hand edited")
    ins.main(["--root", str(root), "--draft-commands", str(cmds)])
    assert drafts[0].read_text() == "hand edited"  # never overwrites


def test_save_prunes_old_snapshots(tmp_path):
    ins = _load("insights")
    home = tmp_path / "h"
    home.mkdir()
    for d in range(1, 6):
        (home / f"2026-01-0{d}.json").write_text("{}")
    ins.save({"x": 1}, home=str(home), keep=3)
    assert len(list(home.glob("*.json"))) == 3


def test_nudge_verdicts(monkeypatch):
    nh = _load("nudge_hook")
    monkeypatch.delenv("AGENTKIT_NUDGE", raising=False)
    hit = nh.verdict("fix the bug")
    assert "done-condition" in hit["hookSpecificOutput"]["additionalContext"]
    assert hit["systemMessage"]
    for quiet in (
        "fix the bug in src/app.py",
        "yes go ahead",
        "/clear",
        "",
        "no, revert",
    ):
        assert nh.verdict(quiet) is None, quiet
    monkeypatch.setenv("AGENTKIT_NUDGE", "model")
    assert "systemMessage" not in nh.verdict("refactor this")
    monkeypatch.setenv("AGENTKIT_NUDGE", "off")
    assert nh.verdict("fix the bug") is None


def test_nudge_check_never_raises(capsys):
    import io

    nh = _load("nudge_hook")
    assert nh.check(io.StringIO("not json")) == 0
    assert nh.check(io.StringIO('{"prompt": "implement a login page"}')) == 0
    assert "UserPromptSubmit" in capsys.readouterr().out


def test_nudge_install_idempotent(tmp_path):
    import json

    nh = _load("nudge_hook")
    settings = tmp_path / "settings.json"
    other = {"hooks": [{"type": "command", "command": "other.sh"}]}
    settings.write_text(json.dumps({"hooks": {"UserPromptSubmit": [other]}}))
    assert nh.main(["install", "--settings", str(settings)]) == 0
    nh.main(["install", "--settings", str(settings)])
    groups = json.loads(settings.read_text())["hooks"]["UserPromptSubmit"]
    assert len(groups) == 2 and (tmp_path / "settings.json.bak").exists()
    nh.main(["install", "--settings", str(settings), "--uninstall"])
    assert json.loads(settings.read_text())["hooks"]["UserPromptSubmit"] == [other]
    fresh = tmp_path / "new" / "settings.json"
    nh.main(["install", "--settings", str(fresh)])
    nh.main(["install", "--settings", str(fresh), "--uninstall"])
    assert json.loads(fresh.read_text()) == {}
    assert nh.main([]) == 2


def test_nudge_install_one_backup_atomic_and_quoted(tmp_path):
    import json
    import shlex

    nh = _load("nudge_hook")
    settings = tmp_path / "settings.json"
    settings.write_text('{"model": "opus"}\n')
    for _ in range(2):
        assert nh.main(["install", "--settings", str(settings)]) == 0
    assert (tmp_path / "settings.json.bak").read_text() == '{"model": "opus"}\n'
    assert sorted(p.name for p in tmp_path.iterdir()) == [
        "settings.json",
        "settings.json.bak",
    ]
    nh.HERE = "/tmp/my dir"
    cmd = nh.apply({})["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"]
    assert shlex.split(cmd) == ["python3", "/tmp/my dir/nudge_hook.py", "check"]
    assert json.loads(settings.read_text())["model"] == "opus"


def test_nudge_check_logs_error_to_stderr_and_exits_zero(capsys):
    import io

    nh = _load("nudge_hook")
    assert nh.check(io.StringIO("not json")) == 0
    assert "nudge_hook" in capsys.readouterr().err


def test_nudge_runs_without_insights_py(tmp_path):
    import shutil

    skills = SCRIPT.parents[2]
    dst = tmp_path / "skills" / "session-insights" / "scripts"
    dst.mkdir(parents=True)
    for name in ("nudge_hook.py", "prompt_signals.py"):
        shutil.copy(SCRIPT.parent / name, dst / name)
    cls = tmp_path / "skills" / "prompt-enhancer" / "scripts"
    cls.mkdir(parents=True)
    shutil.copy(skills / "prompt-enhancer" / "scripts" / "classify.py", cls)
    r = subprocess.run(
        [sys.executable, str(dst / "nudge_hook.py"), "check"],
        input='{"prompt": "fix the bug"}',
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0 and "UserPromptSubmit" in r.stdout, r.stderr


def test_redact_in_snapshot_drafts_and_html(tmp_path, monkeypatch):
    import json
    import stat

    ins = _load("insights")
    secret = "sk-" + "abcdef1234567890"  # split so scanners ignore the fake
    prompt = f"deploy the staging stack using token={secret} then smoke test it"
    root = tmp_path / "projects" / "p"
    root.mkdir(parents=True)
    for i in range(3):
        (root / f"s{i}.jsonl").write_text(
            json.dumps({"type": "user", "message": {"role": "user", "content": prompt}})
            + "\n"
        )
    data = tmp_path / "data"
    monkeypatch.setenv("AGENTKIT_DATA_DIR", str(data))
    cmds, page = tmp_path / "cmds", tmp_path / "r.html"
    argv = ["--root", str(root.parent), "--save", "--html", str(page)]
    assert ins.main(argv + ["--draft-commands", str(cmds)]) == 0
    assert ins.main(argv) == 0
    files = list(cmds.glob("*.md")) + [page] + list((data / "insights").glob("*.json"))
    assert len(files) == 3
    for f in files:
        assert secret not in f.read_text(), f
    assert "[REDACTED]" in next(cmds.glob("*.md")).read_text()
    if os.name == "posix":
        for f in files:
            assert stat.S_IMODE(f.stat().st_mode) == 0o600, f
        for d in (cmds, data / "insights"):
            assert stat.S_IMODE(d.stat().st_mode) == 0o700, d


def test_insights_data_dir_beats_home(tmp_path, monkeypatch):
    ins = _load("insights")
    monkeypatch.setenv("AGENTKIT_HOME", str(tmp_path / "old"))
    assert ins._insights_home() == str(tmp_path / "old" / "insights")
    monkeypatch.setenv("AGENTKIT_DATA_DIR", str(tmp_path / "new"))
    assert ins._insights_home() == str(tmp_path / "new" / "insights")
