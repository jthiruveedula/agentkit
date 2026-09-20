"""Tests for the memory substrate (skills/memory/scripts/memory.py).

Uses a fresh temp database per test -- nothing touches ~/.agentkit.
"""

import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "skills" / "memory" / "scripts"))

import memory as mem  # noqa: E402


@pytest.fixture()
def db(tmp_path):
    handle, path = mem.connect(str(tmp_path / "test.db"))
    yield handle
    handle.close()


def test_store_and_search_episode(db):
    mem.store_episode(db, "deployed v0.2.0 to staging", "cli", ["deploy"])
    mem.store_episode(db, "unrelated note about lunch", "cli", [])
    hits = mem.search(db, "deployed staging")
    assert len(hits) == 1
    assert hits[0]["kind"] == "episode"
    assert "v0.2.0" in hits[0]["text"]


def test_fact_upsert_supersedes(db):
    mem.store_fact(db, "user.timezone", "America/Chicago", 0.9, "cli")
    mem.store_fact(db, "user.timezone", "Europe/Berlin", 0.8, "cli")
    hits = mem.search(db, "timezone")
    assert len(hits) == 1
    assert hits[0]["text"] == "Europe/Berlin"
    cur = db.execute("SELECT COUNT(*) c FROM facts WHERE superseded=1")
    assert cur.fetchone()["c"] == 1


def test_correction_ranks_first(db):
    mem.store_episode(db, "ran npm install and it failed mysteriously", "cli", [])
    mem.store_fact(db, "repo.pkg", "the repo uses pnpm", 0.9, "cli")
    mem.store_correction(
        db,
        "assumed npm when repo uses pnpm",
        "check packageManager field first",
        "",
        "cli",
    )
    hits = mem.search(db, "npm pnpm")
    assert hits, "expected matches"
    assert hits[0]["kind"] == "correction"


def test_search_no_match(db):
    assert mem.search(db, "xyzzy-no-such-thing") == []


def test_forget_fact_by_key(db):
    mem.store_fact(db, "temp.key", "temp value", 0.5, "cli")
    assert mem.forget(db, "fact", key="temp.key") == 1
    assert mem.search(db, "temp value") == []


def test_forget_episode_by_id(db):
    rid = mem.store_episode(db, "forget me", "cli", [])
    assert mem.forget(db, "episode", rec_id=rid) == 1
    assert mem.get_record(db, "episode", rid) is None


def test_prune_dry_run_then_delete(db):
    old_id = mem.store_episode(db, "ancient history", "cli", [])
    db.execute(
        "UPDATE episodes SET ts='2020-01-01T00:00:00+00:00' WHERE id=?", (old_id,)
    )
    db.commit()
    mem.store_episode(db, "fresh news", "cli", [])

    doomed = mem.prune_episodes(db, "2021-01-01T00:00:00+00:00", dry_run=True)
    assert [r["id"] for r in doomed] == [old_id]
    # dry run deleted nothing
    assert mem.get_record(db, "episode", old_id) is not None

    mem.prune_episodes(db, "2021-01-01T00:00:00+00:00", dry_run=False)
    assert mem.get_record(db, "episode", old_id) is None
    assert mem.search(db, "fresh news")


def test_prune_never_touches_facts(db):
    mem.store_fact(db, "k", "v", 0.9, "cli")
    mem.store_correction(db, "p", "c", "", "cli")
    doomed = mem.prune_episodes(db, "2999-01-01T00:00:00+00:00", dry_run=False)
    assert doomed == []  # no episodes at all
    assert mem.search(db, "v")  # fact still there


def test_get_missing_returns_none(db):
    assert mem.get_record(db, "fact", 9999) is None


def test_fts_query_is_injection_safe(db):
    mem.store_episode(db, "plain text", "cli", [])
    # FTS5 syntax characters must not break the query or match everything
    assert mem.search(db, '" OR "1"="1') == []
    assert mem.search(db, "NEAR(test)") == []


def test_stats_counts(db):
    mem.store_episode(db, "e", "cli", [])
    mem.store_fact(db, "k1", "v", 0.9, "cli")
    mem.store_fact(db, "k1", "v2", 0.9, "cli")  # supersedes, still 1 current
    s = mem.stats(db, ":memory:")
    assert s["episodes"] == 1
    assert s["facts"] == 1
    assert s["corrections"] == 0


def test_cli_help_and_bad_usage():
    script = REPO_ROOT / "skills" / "memory" / "scripts" / "memory.py"
    r = subprocess.run(
        [sys.executable, str(script), "--help"], capture_output=True, text=True
    )
    assert r.returncode == 0
    r = subprocess.run(
        [sys.executable, str(script), "store", "--kind", "bogus", "--text", "x"],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 2


def test_cli_end_to_end_json(tmp_path):
    script = REPO_ROOT / "skills" / "memory" / "scripts" / "memory.py"
    dbp = str(tmp_path / "cli.db")
    env = {"AGENTKIT_MEMORY_DB": dbp, "PATH": "/usr/bin:/bin"}
    r = subprocess.run(
        [
            sys.executable,
            str(script),
            "store",
            "--kind",
            "fact",
            "--key",
            "cli.key",
            "--text",
            "cli value",
            "--json",
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    assert r.returncode == 0
    r = subprocess.run(
        [sys.executable, str(script), "search", "cli value", "--json"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert r.returncode == 0
    import json

    hits = json.loads(r.stdout)
    assert hits and hits[0]["text"] == "cli value"
