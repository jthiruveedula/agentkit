import json
import sqlite3
import sys

import pytest

from prompt_analytics.adapters.base import user_data_dirs
from prompt_analytics.adapters.copilot import CopilotAdapter, replay

SID = "sess-1"


def L(**d):
    return json.dumps(d)


def build(tmp_path, monkeypatch, lines, sid=SID, index=None):
    monkeypatch.setenv("PA_HOME", str(tmp_path))
    u = user_data_dirs("Code")[0]
    ws = u / "workspaceStorage" / "h1"
    (ws / "chatSessions").mkdir(parents=True, exist_ok=True)
    (ws / "workspace.json").write_text(json.dumps({"folder": "file:///tmp/my%20proj"}))
    f = ws / "chatSessions" / f"{sid}.jsonl"
    f.write_text("\n".join(lines) + "\n")
    g = u / "globalStorage"
    g.mkdir(parents=True, exist_ok=True)
    (g / "state.vscdb").unlink(missing_ok=True)
    c = sqlite3.connect(g / "state.vscdb")
    c.execute("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
    c.execute("INSERT INTO ItemTable VALUES (?,?)",
              ("chat.ChatSessionStore.index", json.dumps({"version": 1, "entries": index or {}})))
    c.commit()
    c.close()
    return ws


def init(requests=None):
    return L(kind=0, v={"version": 3, "creationDate": 1_700_000_000_000, "sessionId": SID,
                        "requests": requests or [], "inputState": {"mode": {"id": "agent", "kind": "agent"}}})


REQ = {
    "timestamp": 1_700_000_001_000, "message": {"text": "hello"}, "modelId": "gpt-x",
    "modelState": {"value": 1}, "elapsedMs": 50,
    "response": [{"value": "hi "}, {"kind": "thinking", "value": "zzz"}, {"value": "there"},
                 {"kind": "toolInvocationSerialized", "toolId": "run_in_terminal", "toolCallId": "t1", "isComplete": True},
                 {"kind": "textEditGroup", "uri": {"path": "/tmp/my proj/a.py"}, "edits": [[{"text": "a\nb"}]]}],
    "editedFileEvents": [{"uri": {"path": "/tmp/my proj/a.py"}, "eventKind": 2}],
}


def test_replay_ops():
    s = replay([L(kind=0, v={"a": [1, 2, 3], "b": {"c": 1}}), L(kind=2, k=["a"], v=[9], i=1),
                L(kind=1, k=["b", "c"], v=5), L(kind=3, k=["b", "d"])])
    assert s == {"a": [1, 9], "b": {"c": 5}}


def test_parse_full(tmp_path, monkeypatch):
    lines = [init([REQ]),
             L(kind=1, k=["requests", 0, "result"], v={"metadata": {"promptTokens": 10, "outputTokens": 5, "resolvedModel": "gpt-real"},
                                                      "timings": {"totalElapsed": 700}}),
             L(kind=1, k=["customTitle"], v="My title")]
    build(tmp_path, monkeypatch, lines)
    a = CopilotAdapter()
    fs = a.discover()
    assert len(fs) == 1
    b = a.parse(fs[0])
    s = b.sessions[0]
    assert (s.session_id, s.title, s.project_path, s.mode, s.model) == ("copilot:sess-1", "My title", "/tmp/my proj", "agent", "gpt-real")
    assert s.started_at.tzinfo is not None and not s.tokens_estimated
    assert s.ended_at.timestamp() == 1_700_000_001.7
    u, asst = b.turns
    assert (u.role, u.text, asst.text, asst.tokens_in, asst.tokens_out, asst.latency_ms, asst.status) == ("user", "hello", "hi there", 10, 5, 700, "ok")
    assert b.tool_calls[0].name == "run_in_terminal" and b.tool_calls[0].status == "ok"
    e = b.code_edits[0]
    assert (e.lines_added, e.state) == (2, "rejected")
    assert a.health().status == "ok" and a.health().versions_seen == ["3"]


def test_estimate_and_error(tmp_path, monkeypatch):
    r = dict(REQ, modelState={"value": 3}, editedFileEvents=[])
    ws = build(tmp_path, monkeypatch, [init([r]), L(kind=1, k=["requests", 0, "result"], v={"errorDetails": {"code": "x"}})])
    (ws / "chatEditingSessions" / SID).mkdir(parents=True)
    (ws / "chatEditingSessions" / SID / "state.json").write_text(json.dumps(
        {"recentSnapshot": {"entries": [{"resource": "file:///tmp/my%20proj/a.py", "state": 1}]}}))
    a = CopilotAdapter()
    b = a.parse(a.discover()[0])
    assert b.sessions[0].tokens_estimated and b.turns[1].tokens_out == len("hi there") // 4
    assert b.turns[1].status == "error"
    assert b.code_edits[0].state == "accepted"


def test_external_skipped_and_malformed(tmp_path, monkeypatch):
    build(tmp_path, monkeypatch, [init([REQ])], index={SID: {"isExternal": True}})
    a = CopilotAdapter()
    b = a.parse(a.discover()[0])
    assert not b.sessions and "external" in b.warnings[0]
    build(tmp_path, monkeypatch, ["{broken"], sid="bad")
    a = CopilotAdapter()
    f = [x for x in a.discover() if x.path.stem == "bad"][0]
    b = a.parse(f)
    assert not b.sessions and b.warnings


def test_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("PA_HOME", str(tmp_path))
    assert CopilotAdapter().health().status == "missing"
