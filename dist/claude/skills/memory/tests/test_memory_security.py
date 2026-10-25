import os
import stat
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import memory as mem  # noqa: E402


@pytest.mark.skipif(os.name == "nt", reason="POSIX permission bits")
def test_db_and_dir_private(tmp_path):
    p = tmp_path / "sub" / "m.db"
    db, _ = mem.connect(str(p))
    db.close()
    assert stat.S_IMODE(os.stat(p).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(p.parent).st_mode) == 0o700


def test_secret_warning():
    assert mem.warn_if_secret("key " + "s" + "k-" + "a" * 24)
    assert mem.warn_if_secret("password = hunter2hunter2")
    assert not mem.warn_if_secret("deployed to staging")
