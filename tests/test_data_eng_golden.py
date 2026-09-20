"""Wraps data-eng-router's golden platform-classification cases so pytest
picks them up alongside the rest of the suite."""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_data_eng_golden_cases_pass():
    script = REPO_ROOT / "skills" / "data-eng-router" / "scripts" / "classify.py"
    result = subprocess.run(
        [sys.executable, str(script), "--selftest"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "/" in result.stdout
