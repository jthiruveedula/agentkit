"""Exercises data-architect's ADR log script end to end in a throwaway
git repo, so `pytest` catches a regression in new/list/search."""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ADR_SCRIPT = REPO_ROOT / "skills" / "data-architect" / "scripts" / "adr.py"


def run(cwd, *args):
    return subprocess.run(
        [sys.executable, str(ADR_SCRIPT), *args],
        cwd=cwd, capture_output=True, text=True,
    )


def test_adr_new_list_search_roundtrip(tmp_path):
    (tmp_path / ".git").mkdir()  # marks tmp_path as the repo root the script walks up to

    result = run(
        tmp_path, "new", "Use BigQuery for the analytics warehouse",
        "--context", "team already on GCP",
        "--decision", "BigQuery, partitioned by event_date",
        "--consequences", "GCP lock-in",
    )
    assert result.returncode == 0, result.stderr
    adr_dir = tmp_path / "docs" / "adr"
    files = list(adr_dir.glob("*.md"))
    assert len(files) == 1
    assert files[0].name.startswith("0001-")
    text = files[0].read_text()
    assert "BigQuery" in text and "GCP lock-in" in text

    # a second ADR increments the number
    run(tmp_path, "new", "Use Airflow for orchestration")
    files = sorted((tmp_path / "docs" / "adr").glob("*.md"))
    assert len(files) == 2
    assert files[1].name.startswith("0002-")

    listed = run(tmp_path, "list")
    assert listed.returncode == 0
    assert "0001-" in listed.stdout and "0002-" in listed.stdout

    searched = run(tmp_path, "search", "bigquery")
    assert searched.returncode == 0
    assert "0001-" in searched.stdout
    assert "0002-" not in searched.stdout
