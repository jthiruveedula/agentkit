"""sync-external.sh must reject path-traversal / malformed lock fields."""

import json
import shutil
import subprocess
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
