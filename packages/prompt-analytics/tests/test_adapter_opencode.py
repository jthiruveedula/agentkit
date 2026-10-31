import json
import sqlite3

from prompt_analytics.adapters.opencode import OpencodeAdapter


def make_db(path, filediff=True):
    con = sqlite3.connect(path)
    con.executescript("""
    create table project(id text primary key, worktree text);
    create table session(id text primary key, project_id text, parent_id text, directory text,
      title text, time_created integer, time_updated integer, model text, cost real);
    create table message(id text primary key, session_id text, time_created integer, data text);
    create table part(id text primary key, message_id text, session_id text, time_created integer, data text);
    """)
    con.execute("insert into project values('p','/w')")
    con.execute("insert into session values('s1','p',null,'/w','T',1000,5000,?,0.0123)",
                (json.dumps({"id": "m-x", "providerID": "z"}),))
    con.execute("insert into session values('s2','p','s1','/w','sub',2000,3000,null,null)")
    def msg(i, sid, t, d):
        con.execute("insert into message values(?,?,?,?)", (i, sid, t, json.dumps(d)))
    def part(i, mid, t, d):
        con.execute("insert into part values(?,?,'x',?,?)", (i, mid, t, json.dumps(d)))
    msg("mu", "s1", 1000, {"role": "user", "time": {"created": 1000}})
    part("p1", "mu", 1000, {"type": "text", "text": "hi there"})
    msg("ma", "s1", 2000, {"role": "assistant", "modelID": "m-x", "cost": 0.0123,
        "time": {"created": 2000, "completed": 4500},
        "tokens": {"input": 100, "output": 20, "reasoning": 5, "cache": {"read": 7, "write": 3}}})
    part("p2", "ma", 2001, {"type": "step-start"})
    part("p3", "ma", 2002, {"type": "text", "text": "ok"})
    md = {"filediff": {"additions": 4, "deletions": 1}} if filediff else {}
    part("p4", "ma", 2003, {"type": "tool", "tool": "edit", "callID": "c1", "state": {
        "status": "completed", "time": {"start": 2100, "end": 2400}, "metadata": md,
        "input": {"filePath": "/w/a.py", "oldString": "a\nb\nc", "newString": "d\ne"}}})
    part("p5", "ma", 2004, {"type": "tool", "tool": "bash", "callID": "c2", "state": {
        "status": "error", "time": {"start": 2500, "end": 2600}, "input": {}}})
    part("p6", "ma", 2005, {"type": "patch", "hash": "h", "files": ["/w/a.py"]})
    part("p7", "ma", 2006, {"type": "step-finish", "cost": 0.0123, "tokens": {"input": 100}})
    msg("sa", "s2", 2100, {"role": "assistant", "modelID": "m-x", "tokens": {"input": 1, "output": 2}})
    con.commit()
    con.close()


def run(tmp_path, monkeypatch, filediff=True):
    db = tmp_path / "opencode.db"
    make_db(db, filediff)
    monkeypatch.setenv("OPENCODE_DB", str(db))
    a = OpencodeAdapter()
    return a, {f.key.rsplit("#", 1)[1]: f for f in a.discover()}


def test_discover_and_parse(tmp_path, monkeypatch):
    a, fs = run(tmp_path, monkeypatch)
    assert set(fs) == {"s1", "s2"} and fs["s1"].marker == "5000"
    b = a.parse(fs["s1"])
    (s,) = b.sessions
    assert s.session_id == "opencode:s1" and s.cost_usd == 0.0123 and s.model == "m-x"
    assert s.project_path == "/w" and not s.is_subagent and s.started_at.year == 1970
    u, asst = b.turns
    assert u.text == "hi there" and asst.text == "ok"
    assert (asst.tokens_in, asst.tokens_out, asst.tokens_cache_read, asst.tokens_cache_write) == (100, 25, 7, 3)
    assert asst.cost_usd == 0.0123 and asst.latency_ms == 2500
    assert [(c.name, c.status, c.is_edit, c.duration_ms) for c in b.tool_calls] == [
        ("edit", "ok", True, 300), ("bash", "error", False, 100)]
    (ce,) = b.code_edits  # patch part not double counted
    assert (ce.file, ce.lines_added, ce.lines_removed, ce.state) == ("/w/a.py", 4, 1, "applied")
    sub = a.parse(fs["s2"]).sessions[0]
    assert sub.is_subagent and sub.parent_session_id == "opencode:s1" and sub.cost_usd is None


def test_missing_filediff(tmp_path, monkeypatch):
    a, fs = run(tmp_path, monkeypatch, filediff=False)
    (ce,) = a.parse(fs["s1"]).code_edits
    assert (ce.lines_added, ce.lines_removed) == (2, 3)


def test_health(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENCODE_DB", raising=False)
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    a = OpencodeAdapter()
    assert a.health().status == "missing" and a.discover() == []
    (tmp_path / "opencode" / "storage" / "session").mkdir(parents=True)
    assert a.health().status == "unsupported"
    make_db(tmp_path / "opencode" / "opencode.db")
    h = a.health()
    assert h.status == "ok" and h.sessions_found == 2
