import os
import subprocess
from datetime import datetime, timedelta, timezone

from prompt_analytics import outcomes, store
from prompt_analytics.schema import ParsedBatch, Session


def _git(repo, *a, when):
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@example.com", "GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when}
    subprocess.run(["git", "-C", str(repo), *a], check=True, env=env, capture_output=True)


def test_outcomes_linked_no_raw_sha(cfg, tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    now = datetime.now(timezone.utc).replace(microsecond=0)
    _git(repo, "init", "-q", when=now.isoformat())
    (repo / "a.txt").write_text("1\n2\n")
    _git(repo, "add", ".", when=now.isoformat())
    c1 = (now - timedelta(minutes=30)).isoformat()
    _git(repo, "commit", "-qm", "SECRET-MESSAGE one", when=c1)
    (repo / "a.txt").write_text("1\n")
    (repo / "b.txt").write_text("x\n")
    _git(repo, "add", ".", when=now.isoformat())
    c2 = (now - timedelta(hours=20)).isoformat()  # outside any session window
    _git(repo, "commit", "-qm", "two", when=c2)

    ctx = store.make_ctx(cfg)
    con = store.connect(cfg)
    s = Session("s:1", "s", "k", project_path=str(repo), started_at=now - timedelta(hours=1), ended_at=now - timedelta(minutes=40))
    sub = Session("s:sub", "s", "k", project_path=str(repo), started_at=now - timedelta(minutes=50),
                  ended_at=now - timedelta(minutes=35), is_subagent=True)
    store.replace_batch(con, "s", "k", ParsedBatch([s, sub]), ctx)
    # c2 predates the session by 19h: the since cutoff (session start - 1d) still includes it, but no link
    rep = outcomes.collect(con, cfg)
    assert rep["repos"] == 1 and rep["outcomes"] == 2 and rep["linked"] == 1
    rows = con.execute("SELECT session_id, files_changed, insertions, deletions FROM outcomes ORDER BY files_changed").fetchall()
    assert ("s:1", 1, 2, 0) in rows and (None, 2, 1, 1) in rows
    shas = subprocess.run(["git", "-C", str(repo), "log", "--format=%H"], capture_output=True, text=True).stdout.split()
    dump = repr(con.execute("SELECT outcome_id, project_id, session_id, kind FROM outcomes").fetchall())
    assert not any(h in dump or h[:16] in dump for h in shas) and "SECRET-MESSAGE" not in dump
    outcomes.collect(con, cfg)  # idempotent
    assert con.execute("SELECT count(*) FROM outcomes").fetchone()[0] == 2
    con.close()


def test_missing_repo_is_warning(cfg, tmp_path):
    cfg.outcomes["repos"] = [str(tmp_path / "nope")]
    con = store.connect(cfg)
    assert outcomes.collect(con, cfg)["repos"] == 0
    con.close()
