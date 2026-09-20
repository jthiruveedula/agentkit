"""Wraps the prompt-enhancer golden intent classification cases so `pytest`
picks them up alongside the rest of the suite."""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_golden_intent_cases_pass():
    script = REPO_ROOT / "skills" / "prompt-enhancer" / "scripts" / "classify.py"
    result = subprocess.run(
        [sys.executable, str(script), "--selftest"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "/" in result.stdout
