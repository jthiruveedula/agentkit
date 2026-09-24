"""Tests for scripts/budget_hook.py and scripts/install_hooks.py. Run with:
python3 -m pytest skills/context-budget/tests
"""

import json
import os
import subprocess
import sys
import tempfile
import time

SCRIPTS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"
)
HOOK = os.path.join(SCRIPTS, "budget_hook.py")
sys.path.insert(0, SCRIPTS)
import install_hooks  # noqa: E402


def _transcript(tokens, sidechain_tokens=None):
    d = tempfile.mkdtemp()
    path = os.path.join(d, "t.jsonl")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps({"type": "user"}) + "\n")
        fh.write(
            json.dumps(
                {
                    "message": {
                        "usage": {
                            "input_tokens": 1,
                            "cache_creation_input_tokens": 9,
                            "cache_read_input_tokens": tokens - 10,
                        }
                    }
                }
            )
            + "\n"
        )
        if sidechain_tokens:
            fh.write(
                json.dumps(
                    {
                        "isSidechain": True,
                        "message": {"usage": {"input_tokens": sidechain_tokens}},
                    }
                )
                + "\n"
            )
    return path


def _run(cmd, payload, home):
    env = dict(
        os.environ,
        AGENTKIT_HOME=home,
        AGENTKIT_BUDGET_TOKENS="1000",
        AGENTKIT_BUDGET_STEP="500",
    )
    r = subprocess.run(
        [sys.executable, HOOK, cmd],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
    )
    assert r.returncode == 0
    return json.loads(r.stdout) if r.stdout.strip() else None


def test_silent_under_budget_then_warns_once_per_step():
    home, cwd = tempfile.mkdtemp(), tempfile.mkdtemp()
    base = {"session_id": "s1", "cwd": cwd, "hook_event_name": "PostToolUse"}
    assert _run("check", dict(base, transcript_path=_transcript(900)), home) is None
    out = _run("check", dict(base, transcript_path=_transcript(1200)), home)
    assert "1200" in out["hookSpecificOutput"]["additionalContext"]
    assert out["hookSpecificOutput"]["hookEventName"] == "PostToolUse"
    assert (
        _run("check", dict(base, transcript_path=_transcript(1400)), home) is None
    )  # same step
    assert (
        _run("check", dict(base, transcript_path=_transcript(1600)), home) is not None
    )  # next step


def test_ignores_subagent_usage():
    home = tempfile.mkdtemp()
    t = _transcript(100, sidechain_tokens=99999)
    assert (
        _run("check", {"session_id": "s2", "cwd": home, "transcript_path": t}, home)
        is None
    )


def test_resume_injects_fresh_checkpoint_only_after_compact_or_clear():
    home, cwd = tempfile.mkdtemp(), tempfile.mkdtemp()
    env = dict(os.environ, AGENTKIT_HOME=home)
    cp = subprocess.run(
        [sys.executable, HOOK, "path", cwd], capture_output=True, text=True, env=env
    ).stdout.strip()
    os.makedirs(os.path.dirname(cp))
    with open(cp, "w", encoding="utf-8") as fh:
        fh.write("## Goal\nship it\n")
    assert _run("resume", {"source": "startup", "cwd": cwd}, home) is None
    out = _run("resume", {"source": "compact", "cwd": cwd}, home)
    assert "ship it" in out["hookSpecificOutput"]["additionalContext"]
    old = time.time() - 2 * 86400
    os.utime(cp, (old, old))
    assert _run("resume", {"source": "clear", "cwd": cwd}, home) is None  # stale


def test_bad_input_never_fails():
    r = subprocess.run(
        [sys.executable, HOOK, "check"],
        input="not json",
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0 and r.stdout == ""


def test_install_is_idempotent_and_preserves_other_hooks():
    other = {"hooks": [{"type": "command", "command": "codegraph prompt-hook"}]}
    s = {"hooks": {"UserPromptSubmit": [other]}, "model": "opus"}
    s = install_hooks.apply(install_hooks.apply(s))
    ups = s["hooks"]["UserPromptSubmit"]
    assert other in ups and len(ups) == 2
    assert len(s["hooks"]["PostToolUse"]) == 1
    assert s["hooks"]["SessionStart"][0]["matcher"] == "compact|clear|resume"
    s = install_hooks.apply(s, uninstall=True)
    assert s["hooks"] == {"UserPromptSubmit": [other]} and s["model"] == "opus"
