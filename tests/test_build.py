"""Unit tests for scripts/build.py -- determinism and --check drift gate."""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import build  # noqa: E402


def test_build_is_deterministic():
    tree1 = build.build()
    tree2 = build.build()
    assert tree1 == tree2


def test_build_produces_all_four_tools():
    tree = build.build()
    tools = {rel.split("/")[0] for rel in tree if not rel.startswith("../")}
    assert tools == {"claude", "copilot", "cursor", "antigravity"}


def test_check_passes_on_committed_dist():
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "build.py"), "--check"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr + result.stdout
