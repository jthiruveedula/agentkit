"""Wraps memory-sync's pattern-ranking selftest so pytest picks it up
alongside the rest of the suite."""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_rank_patterns_selftest_passes():
    script = REPO_ROOT / "skills" / "memory-sync" / "scripts" / "rank_patterns.py"
    result = subprocess.run(
        [sys.executable, str(script), "--selftest"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
