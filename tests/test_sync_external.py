"""sync-external.sh must reject path-traversal / malformed lock fields."""

import json
import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "sync-external.sh"


@pytest.mark.skipif(shutil.which("jq") is None, reason="jq required")
@pytest.mark.parametrize(
    "name,repo,sha",
    [
        ("../scripts", "a/b", "0" * 40),
        ("ok", "a/b/../../evil/y", "0" * 40),
        ("ok", "a/b", "main"),
    ],
)
def test_bad_lock_entry_skipped(tmp_path, name, repo, sha):
    (tmp_path / "scripts").mkdir()
    (tmp_path / "external").mkdir()
    script = tmp_path / "scripts" / "sync-external.sh"
    shutil.copy(SCRIPT, script)
    (tmp_path / "external" / "skills.lock.json").write_text(
        json.dumps({"sources": [{"name": name, "repo": repo, "sha": sha}]})
    )
    r = subprocess.run(["sh", str(script)], capture_output=True, text=True)
    assert "invalid lock entry" in r.stderr
    assert (tmp_path / "scripts").is_dir()


@pytest.mark.skipif(shutil.which("jq") is None, reason="jq required")
def test_sync_forces_https_and_swaps_checkout(tmp_path):
    (tmp_path / "scripts").mkdir()
    (tmp_path / "external" / "demo").mkdir(parents=True)
    (tmp_path / "external" / "demo" / "old.txt").write_text("old")
    script = tmp_path / "scripts" / "sync-external.sh"
    shutil.copy(SCRIPT, script)
    (tmp_path / "external" / "skills.lock.json").write_text(
        json.dumps({"sources": [{"name": "demo", "repo": "a/b", "sha": "a" * 40}]})
    )
    payload = tmp_path / "payload"
    payload.mkdir()
    (payload / "new.txt").write_text("new")
    tar = tmp_path / "src.tar.gz"
    with tarfile.open(str(tar), "w:gz") as t:
        t.add(str(payload), arcname="b")
    # fake curl: log argv, then "download" the tarball above
    bindir = tmp_path / "bin"
    bindir.mkdir()
    curl = bindir / "curl"
    curl.write_text(
        '#!/bin/sh\necho "$@" > "%s"\n'
        'while [ $# -gt 0 ]; do [ "$1" = -o ] && out=$2; shift; done\n'
        'cp "%s" "$out"\n' % (tmp_path / "curl.args", tar)
    )
    curl.chmod(0o755)
    env = dict(os.environ, PATH="%s:%s" % (bindir, os.environ["PATH"]))
    r = subprocess.run(["sh", str(script)], capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr
    assert "--proto =https --proto-redir =https" in (tmp_path / "curl.args").read_text()
    assert (tmp_path / "external" / "demo" / "new.txt").exists()
    assert not (tmp_path / "external" / "demo" / "old.txt").exists()
    assert not (tmp_path / "external" / "demo.old").exists()
