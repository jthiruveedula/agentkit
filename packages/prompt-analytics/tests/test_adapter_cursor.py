import json
import sqlite3

from prompt_analytics.adapters.cursor import CursorAdapter


def mk(tmp_path, monkeypatch, headers=True, bubble_v=3, tool_status="completed", tokens=None):
    monkeypatch.setenv("CURSOR_DATA_PATH", str(tmp_path))
    monkeypatch.setenv("PA_HOME", str(tmp_path / "nohome"))
    g = tmp_path / "globalStorage"
    g.mkdir()
    db = g / "state.vscdb"
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)")
    kv = lambda k, v: c.execute("INSERT INTO cursorDiskKV VALUES (?,?)", (k, json.dumps(v).encode()))
    if headers:
        c.execute("CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INT, lastUpdatedAt INT, isArchived INT, isSubagent INT, value BLOB)")
        c.execute("INSERT INTO composerHeaders VALUES ('c1','w1',1,2000,0,0,?)",
                  (json.dumps({"name": "T", "unifiedMode": "agent", "workspaceIdentifier": {"uri": {"fsPath": "/proj"}}}),))
        c.execute("INSERT INTO composerHeaders VALUES ('draft','w1',1,1,0,0,?)", (json.dumps({"isDraft": True}),))
    kv("composerData:c1", {"_v": 17, "createdAt": 1_700_000_000_000, "modelConfig": {"modelName": "default"},
                           "fullConversationHeadersOnly": [{"bubbleId": "b1"}, {"bubbleId": "b2"}, {"bubbleId": "b3"}, {"bubbleId": "b1"}]})
    kv("bubbleId:c1:b1", {"_v": bubble_v, "type": 1, "createdAt": "2024-01-01T00:00:00Z", "text": "do it"})
    kv("bubbleId:c1:b2", {"_v": bubble_v, "type": 2, "createdAt": 1_700_000_001_000, "text": "ok",
                          "modelInfo": {"modelName": "claude"}, "tokenCount": tokens or {"inputTokens": 7, "outputTokens": 3},
                          "toolFormerData": {"name": "edit_file", "toolCallId": "tc1", "status": tool_status}})
    kv("bubbleId:c1:b3", {"_v": bubble_v, "type": 2, "createdAt": 1_700_000_002_000, "text": "x" * 40,
                          "codeBlockData": {"file:///proj/a.py": {"status": "accepted"}}})
    c.commit()
    c.close()


def run(tmp_path):
    a = CursorAdapter()
    fs = a.discover()
    return a, fs, [a.parse(f) for f in fs]


def test_full(tmp_path, monkeypatch):
    mk(tmp_path, monkeypatch)
    a, fs, bs = run(tmp_path)
    assert len(fs) == 1 and fs[0].key.endswith("#c1") and fs[0].marker == "2000"
    b = bs[0]
    s = b.sessions[0]
    assert (s.session_id, s.project_path, s.title, s.mode, s.model) == ("cursor:c1", "/proj", "T", "agent", "claude")
    assert [t.role for t in b.turns] == ["user", "assistant", "assistant"]  # b1 deduped
    assert b.turns[0].ts.tzinfo and b.turns[1].tokens_in == 7
    assert b.turns[2].tokens_out == 10 and s.tokens_estimated
    tc = b.tool_calls[0]
    assert (tc.name, tc.status, tc.is_edit) == ("edit_file", "ok", True)
    assert (b.code_edits[0].file, b.code_edits[0].state) == ("/proj/a.py", "accepted")
    assert a.health().status == "ok"


def test_no_headers_table(tmp_path, monkeypatch):
    mk(tmp_path, monkeypatch, headers=False)
    _, fs, bs = run(tmp_path)
    assert len(fs) == 1 and bs[0].sessions[0].project_path is None and len(bs[0].turns) == 3


def test_error_and_zero_tokens(tmp_path, monkeypatch):
    mk(tmp_path, monkeypatch, tool_status="error", tokens={"inputTokens": 0, "outputTokens": 0})
    _, _, bs = run(tmp_path)
    assert bs[0].tool_calls[0].status == "error"
    assert bs[0].turns[1].tokens_out == 0 and bs[0].sessions[0].tokens_estimated


def test_unknown_version_degraded(tmp_path, monkeypatch):
    mk(tmp_path, monkeypatch, bubble_v=9)
    h = CursorAdapter().health()
    assert h.status == "degraded" and "bubble _v=9" in " ".join(h.messages)


def test_missing_and_readonly(tmp_path, monkeypatch):
    monkeypatch.setenv("CURSOR_DATA_PATH", str(tmp_path / "x"))
    monkeypatch.setenv("PA_HOME", str(tmp_path))
    assert CursorAdapter().health().status == "missing"
    mk(tmp_path, monkeypatch)
    db = tmp_path / "globalStorage" / "state.vscdb"
    before = db.stat().st_mtime_ns
    run(tmp_path)
    assert db.stat().st_mtime_ns == before and not list(db.parent.glob("*.copy*"))


def test_legacy_chat(tmp_path, monkeypatch):
    mk(tmp_path, monkeypatch)
    w = tmp_path / "workspaceStorage" / "h"
    w.mkdir(parents=True)
    (w / "workspace.json").write_text(json.dumps({"folder": "file:///lp"}))
    c = sqlite3.connect(w / "state.vscdb")
    c.execute("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
    c.execute("INSERT INTO ItemTable VALUES (?,?)", ("workbench.panel.aichat.view.aichat.chatdata", json.dumps(
        {"tabs": [{"tabId": "t1", "chatTitle": "old", "bubbles": [{"type": "user", "text": "q"}, {"type": "ai", "text": "answer!"}]}]})))
    c.commit()
    c.close()
    _, fs, bs = run(tmp_path)
    leg = [b for b in bs if b.sessions and b.sessions[0].session_id.startswith("cursor:legacy")]
    assert len(fs) == 2 and leg[0].sessions[0].project_path == "/lp" and len(leg[0].turns) == 2
