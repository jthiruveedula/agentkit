"""install.sh uninstall must only remove paths inside the agentkit install roots."""

import os
import subprocess
from pathlib import Path

INSTALL = Path(__file__).resolve().parent.parent / "install.sh"


def test_uninstall_skips_paths_outside_install_roots(tmp_path):
    home = tmp_path / "home"
    state = home / ".local" / "state" / "agentkit"
    state.mkdir(parents=True)
    ours = home / ".claude" / "agents" / "x.md"
    ours.parent.mkdir(parents=True)
    ours.write_text("x")
    victim = tmp_path / "victim"
    victim.mkdir()
    (victim / "keep.txt").write_text("keep")
    (home / ".claude" / "skills").mkdir()
    escape = home / ".claude" / "skills" / ".." / ".." / ".." / "victim"
    (state / "manifest.tsv").write_text("%s\n%s\n%s\n" % (ours, victim, escape))

    env = os.environ.copy()
    env["HOME"] = str(home)
    env["XDG_STATE_HOME"] = str(home / ".local" / "state")
    for k in ("CLAUDE_HOME", "CURSOR_HOME", "ANTIGRAVITY_HOME"):
        env.pop(k, None)
    r = subprocess.run(
        ["sh", str(INSTALL), "uninstall"], env=env, capture_output=True, text=True
    )
    assert r.returncode == 0, r.stderr
    assert not ours.exists()
    assert (victim / "keep.txt").read_text() == "keep"
    assert r.stderr.count("skipping manifest entry") == 2
