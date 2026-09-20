"""Exercises pipeline-scaffold's generator for all 4 kinds in a temp dir."""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "skills" / "pipeline-scaffold" / "scripts" / "scaffold_pipeline.py"


def run(tmp_path, *args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--out", str(tmp_path), *args],
        capture_output=True, text=True,
    )


def test_dbt_scaffold(tmp_path):
    result = run(tmp_path, "--kind", "dbt", "--layer", "silver", "--name", "orders")
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "models" / "silver" / "orders.sql").exists()
    assert (tmp_path / "models" / "silver" / "orders.yml").exists()
    assert "orders" in (tmp_path / "models" / "silver" / "orders.yml").read_text()


def test_airflow_scaffold(tmp_path):
    result = run(tmp_path, "--kind", "airflow", "--name", "daily_extract")
    assert result.returncode == 0, result.stderr
    content = (tmp_path / "dags" / "daily_extract_dag.py").read_text()
    assert "daily_extract" in content and "DAG(" in content


def test_dagster_scaffold(tmp_path):
    result = run(tmp_path, "--kind", "dagster", "--layer", "gold", "--name", "revenue_mart")
    assert result.returncode == 0, result.stderr
    content = (tmp_path / "assets" / "revenue_mart_asset.py").read_text()
    assert "@asset" in content and "revenue_mart" in content


def test_spark_scaffold_and_no_clobber(tmp_path):
    result = run(tmp_path, "--kind", "spark", "--name", "event_dedup")
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "jobs" / "event_dedup_job.py").exists()
    assert (tmp_path / "jobs" / "test_event_dedup_job.py").exists()

    # re-running without --force must not overwrite
    before = (tmp_path / "jobs" / "event_dedup_job.py").read_text()
    (tmp_path / "jobs" / "event_dedup_job.py").write_text(before + "\n# hand-edited\n")
    run(tmp_path, "--kind", "spark", "--name", "event_dedup")
    after = (tmp_path / "jobs" / "event_dedup_job.py").read_text()
    assert after.endswith("# hand-edited\n")
