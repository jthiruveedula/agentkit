"""Golden tests for session-insights: the fixture transcript pins each
friction signal, and the CLI must report on an empty root without crashing."""

import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "insights.py"


def run(*args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], capture_output=True, text=True
    )


def test_selftest_passes():
    r = run("--selftest")
    assert r.returncode == 0, r.stdout + r.stderr


def test_empty_root_reports_cleanly(tmp_path):
    r = run("--root", str(tmp_path))
    assert r.returncode == 0
    assert "no sessions found" in r.stdout


def test_json_and_incidents(tmp_path):
    proj = tmp_path / "proj"
    proj.mkdir()
    (proj / "s.jsonl").write_text(
        (SCRIPT.parents[1] / "tests" / "fixture.jsonl").read_text()
    )
    r = run("--root", str(tmp_path), "--json")
    assert r.returncode == 0 and '"correction_rate": 0.5' in r.stdout, r.stdout
    r = run("--root", str(tmp_path), "--incidents")
    assert r.stdout.count("\n") == 3, r.stdout
