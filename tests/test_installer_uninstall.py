"""install.sh uninstall must only remove paths inside the agentkit install roots."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

INSTALL = Path(__file__).resolve().parent.parent / "install.sh"


posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="POSIX sh installer; manifest holds native paths"
)


def _env(home):
    env = os.environ.copy()
    env["HOME"] = str(home)
    env["XDG_STATE_HOME"] = str(home / ".local" / "state")
    for k in ("CLAUDE_HOME", "CURSOR_HOME", "ANTIGRAVITY_HOME"):
        env.pop(k, None)
    return env


def _run(home, *args):
    env = os.environ.copy()
    env.update(_env(home))
    r = subprocess.run(
        ["sh", str(INSTALL), *args], env=env, capture_output=True, text=True
    )
    assert r.returncode == 0, r.stderr
    return r


@posix_only
def test_uninstall_skips_paths_outside_install_roots(tmp_path):
    home = tmp_path / "home"
    state = home / ".local" / "state" / "agentkit"
    state.mkdir(parents=True)
    ours = home / ".claude" / "agents" / "x.md"
    ours.parent.mkdir(parents=True)
    ours.symlink_to(INSTALL.parent / "dist" / "missing-target")  # link into the kit
    victim = tmp_path / "victim"
    victim.mkdir()
    (victim / "keep.txt").write_text("keep")
    (home / ".claude" / "skills").mkdir()
    escape = home / ".claude" / "skills" / ".." / ".." / ".." / "victim"
    (state / "manifest.tsv").write_text("%s\n%s\n%s\n" % (ours, victim, escape))

    r = _run(home, "uninstall")
    assert not ours.is_symlink()
    assert (victim / "keep.txt").read_text() == "keep"
    assert r.stderr.count("skipping manifest entry") == 2


def _cursor_rules(home):
    rules = sorted((home / ".cursor" / "rules").glob("*.mdc"))
    assert len(rules) >= 2
    return rules


@posix_only
def test_reinstall_backs_up_user_file_that_replaced_link(tmp_path):
    home = tmp_path / "home"
    _run(home, "--tools=cursor")
    mine = _cursor_rules(home)[-1]
    assert mine.is_symlink()
    mine.unlink()
    mine.write_text("MINE")
    r = _run(home, "--tools=cursor")
    baks = list(mine.parent.glob(mine.name + ".bak.*"))
    assert [b.read_text() for b in baks] == ["MINE"]
    assert "backing up" in r.stderr
    assert mine.is_symlink()


@posix_only
def test_user_symlink_is_kept_on_uninstall_and_backed_up_on_install(tmp_path):
    home = tmp_path / "home"
    _run(home, "--tools=cursor")
    link = _cursor_rules(home)[-1]
    theirs = tmp_path / "theirs.mdc"
    theirs.write_text("THEIRS")
    link.unlink()
    link.symlink_to(theirs)
    r = _run(home, "uninstall")
    assert "modified since install" in r.stderr
    assert link.resolve() == theirs.resolve()
    r = _run(home, "--tools=cursor")
    baks = list(link.parent.glob(link.name + ".bak.*"))
    assert [b.read_text() for b in baks] == ["THEIRS"]
    assert "backing up" in r.stderr


@posix_only
def test_upgrade_prune_keeps_edited_copy_removed_upstream(tmp_path, monkeypatch):
    import shutil

    # `git commit`/`pull` spawn a detached `git maintenance run --auto` that
    # repacks (deletes loose objects) while the next clone/pull is reading them
    # ("unable to read tree"). Disable it for every git this test starts.
    for i, k in enumerate(("maintenance.auto", "gc.auto")):
        monkeypatch.setenv("GIT_CONFIG_KEY_%d" % i, k)
        monkeypatch.setenv("GIT_CONFIG_VALUE_%d" % i, "false" if i == 0 else "0")
    monkeypatch.setenv("GIT_CONFIG_COUNT", "2")

    git = ["git", "-c", "user.name=t", "-c", "user.email=t@t"]
    git += ["-c", "commit.gpgsign=false"]
    origin = tmp_path / "origin"
    shutil.copytree(INSTALL.parent / "dist" / "cursor", origin / "dist" / "cursor")
    shutil.copy(INSTALL.parent / "AGENTS.md", origin / "AGENTS.md")
    shutil.copy(INSTALL, origin / "install.sh")
    subprocess.run(["git", "init", "-q", str(origin)], check=True)
    subprocess.run(git + ["-C", str(origin), "add", "-A"], check=True)
    subprocess.run(git + ["-C", str(origin), "commit", "-qm", "v1"], check=True)
    kit = tmp_path / "kit"
    subprocess.run(["git", "clone", "-q", str(origin), str(kit)], check=True)
    home = tmp_path / "home"
    env = os.environ.copy()
    env.update(_env(home), AGENTKIT_HOME=str(kit))

    def run(*args):
        r = subprocess.run(
            ["sh", str(kit / "install.sh"), *args],
            env=env,
            capture_output=True,
            text=True,
        )
        assert r.returncode == 0, r.stderr
        return r

    run("--copy", "--tools=cursor")
    names = sorted(p.name for p in (kit / "dist" / "cursor" / "rules").glob("*.mdc"))
    edited, untouched = names[0], names[1]
    rules = home / ".cursor" / "rules"
    (rules / edited).write_text("my edit\n")
    for n in (edited, untouched):
        (origin / "dist" / "cursor" / "rules" / n).unlink()
    subprocess.run(git + ["-C", str(origin), "commit", "-qam", "v2"], check=True)

    r = run("upgrade", "--tools=cursor", "--copy")
    assert (rules / edited).read_text() == "my edit\n"
    assert not (rules / untouched).exists()
    assert "modified since install" in r.stderr


@posix_only
def test_uninstall_keeps_edited_copy(tmp_path):
    home = tmp_path / "home"
    _run(home, "--copy", "--tools=cursor")
    rules = _cursor_rules(home)
    edited, untouched = rules[-1], rules[-2]
    assert not edited.is_symlink()
    edited.write_text(edited.read_text() + "\nmy edit\n")
    r = _run(home, "uninstall")
    assert edited.read_text().endswith("my edit\n")
    assert not untouched.exists()
    assert "modified since install" in r.stderr


@posix_only
def test_dry_run_creates_nothing(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    _run(home, "--dry-run", "--tools=cursor")
    assert list(home.iterdir()) == []


@posix_only
def test_help_prints_whole_header_and_no_code(tmp_path):
    out = _run(tmp_path, "-h").stdout
    assert "ANTIGRAVITY_HOME" in out
    assert "set -eu" not in out


@posix_only
def test_copy_upgrade_after_dist_change_leaves_no_bak_or_strays(tmp_path):
    # Scratch AGENTKIT_HOME so the dist edit below never touches the repo.
    import shutil

    repo = INSTALL.parent
    kit = tmp_path / "kit"
    shutil.copytree(repo / "dist" / "cursor", kit / "dist" / "cursor")
    shutil.copy(repo / "AGENTS.md", kit / "AGENTS.md")
    home = tmp_path / "home"
    env = os.environ.copy()
    env.update(_env(home), AGENTKIT_HOME=str(kit))

    def run(*args):
        r = subprocess.run(
            ["sh", str(INSTALL), *args], env=env, capture_output=True, text=True
        )
        assert r.returncode == 0, r.stderr
        return r

    run("--copy", "--tools=cursor")
    src = sorted((kit / "dist" / "cursor" / "rules").glob("*.mdc"))[0]
    src.write_text(src.read_text() + "\nupstream change\n")

    r = run("uninstall")  # plain pull, no re-install: still ours
    assert "modified since install" not in r.stderr
    run("--copy", "--tools=cursor")
    r = run("--copy", "--tools=cursor")  # what `upgrade` does after its pull
    assert "backing up" not in r.stderr
    rules = home / ".cursor" / "rules"
    assert (rules / src.name).read_text().endswith("upstream change\n")
    src.write_text(src.read_text() + "\nsecond change\n")
    r = run("--copy", "--tools=cursor")
    assert "backing up" not in r.stderr

    run("uninstall")
    assert not list(rules.glob("*"))
    assert not (home / "AGENTS.md").exists()
