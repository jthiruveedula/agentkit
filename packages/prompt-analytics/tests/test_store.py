from datetime import timedelta

import pytest

from conftest import T0
from prompt_analytics import store
from prompt_analytics.schema import CodeEdit, ParsedBatch, Session, ToolCall, Turn


@pytest.fixture
def ctx(cfg):
    return store.make_ctx(cfg)


@pytest.fixture
def con(cfg, ctx):
    c = store.connect(cfg)
    yield c
    c.close()


def sess(sid="s:1", key="k1", **kw):
    return Session(sid, "s", key, started_at=kw.pop("started_at", T0), ended_at=kw.pop("ended_at", T0), **kw)


def one(con, q, *a):
    return con.execute(q, list(a)).fetchall()


def test_merge_same_session_across_keys(con, ctx):
    a = ParsedBatch([sess(started_at=T0, ended_at=T0 + timedelta(hours=1))],
                    [Turn("t1", "s:1", 0, "user", T0, "x"), Turn("t2", "s:1", 1, "assistant", T0, "y", tokens_out=10)])
    b = ParsedBatch([sess(key="k2", started_at=T0 - timedelta(hours=1), ended_at=T0 + timedelta(hours=3))],
                    [Turn("t2", "s:1", 1, "assistant", T0, "y", tokens_out=10), Turn("t3", "s:1", 2, "assistant", T0, "z", tokens_out=5)])
    store.replace_batch(con, "s", "k1", a, ctx)
    store.replace_batch(con, "s", "k2", b, ctx)
    r = one(con, "SELECT count(*), min(n_user_turns), min(n_assistant_turns), min(tokens_out), "
                 "min(epoch(started_at)), min(epoch(ended_at)) FROM sessions")[0]
    assert r[:4] == (1, 1, 2, 15)
    assert r[4] == (T0 - timedelta(hours=1)).timestamp() and r[5] == (T0 + timedelta(hours=3)).timestamp()
    assert one(con, "SELECT count(*) FROM turns")[0][0] == 3
    # re-parsing k1 must not delete k2's turn t3 (shared session)
    store.replace_batch(con, "s", "k1", a, ctx)
    assert one(con, "SELECT count(*) FROM turns")[0][0] == 3


def test_reparse_replaces_exclusive_rows(con, ctx):
    a = ParsedBatch([sess()], [Turn("t1", "s:1", 0, "user", T0, "x"), Turn("t2", "s:1", 1, "user", T0, "y")],
                    [ToolCall("c1", "s:1", "t1", "Bash")], [CodeEdit("e1", "s:1", "t1", "f.py")])
    store.replace_batch(con, "s", "k1", a, ctx)
    b = ParsedBatch([sess()], [Turn("t1", "s:1", 0, "user", T0, "x")])
    store.replace_batch(con, "s", "k1", b, ctx)
    assert one(con, "SELECT count(*) FROM turns")[0][0] == 1
    assert one(con, "SELECT count(*) FROM tool_calls")[0][0] == 0
    assert one(con, "SELECT count(*) FROM code_edits")[0][0] == 0


def test_cost_flags(con, ctx):
    b = ParsedBatch(
        [sess("s:est", model="claude-sonnet-4-5"), sess("s:src", cost_usd=1.5), sess("s:unk", model="mystery-1")],
        [Turn("a", "s:est", 0, "assistant", T0, "x", model="claude-sonnet-4-5", tokens_in=1_000_000, tokens_out=0),
         Turn("b", "s:src", 0, "assistant", T0, "x", model="claude-sonnet-4-5", tokens_in=10),
         Turn("c", "s:unk", 0, "assistant", T0, "x", model="mystery-1", tokens_in=10)])
    store.replace_batch(con, "s", "k", b, ctx)
    rows = {r[0]: r[1:] for r in one(con, "SELECT session_id, cost_usd, cost_is_estimate FROM sessions")}
    assert rows["s:est"] == (3.0, True)
    assert rows["s:src"] == (1.5, False)
    assert rows["s:unk"] == (None, False)


def test_turn_cost_provided_not_estimate(con, ctx):
    b = ParsedBatch([sess()], [Turn("a", "s:1", 0, "assistant", T0, "x", model="claude-sonnet-4-5", tokens_in=5, cost_usd=0.25)])
    store.replace_batch(con, "s", "k", b, ctx)
    assert one(con, "SELECT cost_usd, cost_is_estimate FROM sessions")[0] == (0.25, False)


def test_project_and_edit_paths(con, ctx, tmp_path):
    proj = tmp_path / "work" / "app"
    (proj / ".git").mkdir(parents=True)
    b = ParsedBatch([sess(project_path=str(proj))], [],
                    code_edits=[CodeEdit("e1", "s:1", None, str(proj / "src" / "a.py")),
                                CodeEdit("e2", "s:1", None, "/Users/alice/else/b.py")])
    store.replace_batch(con, "s", "k", b, ctx)
    p = one(con, "SELECT name, repo, project_id FROM projects")[0]
    assert p[0] == "app" and p[1] is True and len(p[2]) == 16
    assert one(con, "SELECT project_id FROM sessions")[0][0] == p[2]
    files = sorted(r[0] for r in one(con, "SELECT file FROM code_edits"))
    assert files == ["/Users/[USER]/else/b.py", "src/a.py"]


def test_source_key_not_stored_raw(con, ctx):
    store.replace_batch(con, "s", "/Users/alice/x.jsonl", ParsedBatch([sess(key="/Users/alice/x.jsonl")]), ctx)
    store.watermark_set(con, "s", "/Users/alice/x.jsonl", ctx, 1, 2, "h", "1")
    assert one(con, "SELECT source_key FROM sessions")[0][0] != "/Users/alice/x.jsonl"
    assert one(con, "SELECT source_key FROM watermarks")[0][0] == one(con, "SELECT source_key FROM sessions")[0][0]
    assert store.watermark_get(con, "s", "/Users/alice/x.jsonl", ctx).size == 1
    assert store.watermark_get(con, "s", "nope", ctx) is None


def test_rollback_on_error(con, ctx):
    bad = ParsedBatch([sess()], [Turn("t", "s:1", "not-an-int", "user", T0, "x")])  # type: ignore[arg-type]
    with pytest.raises(Exception):
        store.replace_batch(con, "s", "k", bad, ctx)
    assert one(con, "SELECT count(*) FROM sessions")[0][0] == 0
