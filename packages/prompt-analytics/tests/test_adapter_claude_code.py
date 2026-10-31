import json

from prompt_analytics.adapters.claude_code import ClaudeCodeAdapter

SID = "s1"


def L(**kw):
    kw.setdefault("sessionId", SID)
    kw.setdefault("cwd", "/work/proj")
    kw.setdefault("version", "2.1.300")
    kw.setdefault("entrypoint", "cli")
    return json.dumps(kw)


def asst(mid, ts, content, usage, model="claude-x", uuid=None):
    return L(type="assistant", timestamp=ts, uuid=uuid,
             message={"id": mid, "model": model, "content": content, "usage": usage})


def tr(tid, ts, text="ok", is_error=False, **extra):
    return L(type="user", timestamp=ts, message={"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": tid, "content": text, "is_error": is_error}]}, **extra)


def build(root):
    d = root / "projects" / "-work-proj"
    (d / SID / "subagents" / "workflows" / "wf_x").mkdir(parents=True)
    main = [
        L(type="ai-title", aiTitle="Fix thing"),
        L(type="user", timestamp="2026-01-01T00:00:00Z", uuid="u1", message={"content": "do the thing"}),
        L(type="user", isMeta=True, timestamp="2026-01-01T00:00:00Z", message={"content": "meta"}),
        L(type="user", timestamp="2026-01-01T00:00:00Z", message={"content": "<command-name>/x</command-name>"}),
        "{not json",
        asst("m1", "2026-01-01T00:00:02Z", [{"type": "text", "text": "hello"}],
             {"input_tokens": 10, "output_tokens": 1}),
        asst("m1", "2026-01-01T00:00:03Z",
             [{"type": "tool_use", "id": "t1", "name": "Edit",
               "input": {"file_path": "/work/proj/a.py", "old_string": "a\nb", "new_string": "c"}}],
             {"input_tokens": 10, "output_tokens": 50, "cache_read_input_tokens": 5,
              "cache_creation_input_tokens": 7}),
        tr("t1", "2026-01-01T00:00:04Z", toolUseResult={"structuredPatch": [
            {"lines": [" ctx", "-old1", "-old2", "+new1", "+new2", "+new3"]}]}),
        asst("m2", "2026-01-01T00:00:05Z",
             [{"type": "tool_use", "id": "t2", "name": "Bash", "input": {"command": "rm"}}],
             {"input_tokens": 3, "output_tokens": 4}),
        tr("t2", "2026-01-01T00:00:06Z", "The user doesn't want to take this action", True,
           toolDenialKind="user"),
        L(type="system", subtype="turn_duration", durationMs=4321, timestamp="2026-01-01T00:00:07Z"),
        L(type="user", timestamp="2026-01-01T00:01:00Z",
          message={"content": [{"type": "text", "text": "[Request interrupted by user]"}]}),
        L(type="user", timestamp="2026-01-01T00:02:00Z", uuid="u3", message={"content": "next"}),
        asst("m3", "2026-01-01T00:02:05Z", [{"type": "text", "text": "x"}],
             {"input_tokens": 1, "output_tokens": 1}),
        asst("m4", "2026-01-01T00:02:06Z", [{"type": "text", "text": "err"}], {"input_tokens": 99},
             model="<synthetic>"),
    ]
    (d / f"{SID}.jsonl").write_text("\n".join(main) + "\n")
    sub = [
        L(type="user", timestamp="2026-01-01T00:00:10Z", agentId="y", message={"content": "sub task"}),
        asst("sm1", "2026-01-01T00:00:11Z", [{"type": "text", "text": "done"}],
             {"input_tokens": 2, "output_tokens": 2}),
    ]
    (d / SID / "subagents" / "workflows" / "wf_x" / "agent-y.jsonl").write_text("\n".join(sub))
    (d / "journal.jsonl").write_text("{}")


def test_parse(tmp_path, monkeypatch):
    build(tmp_path)
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    a = ClaudeCodeAdapter()
    files = a.discover()
    assert len(files) == 2  # journal.jsonl skipped, nested subagent found
    main = next(f for f in files if "subagents" not in f.path.parts)
    b = a.parse(main)
    assert len(b.warnings) == 1 and "1 unparseable" in b.warnings[0]
    users = [t for t in b.turns if t.role == "user"]
    assert [t.text for t in users] == ["do the thing", None, "next"]
    assert users[1].is_interrupt and users[1].status == "interrupted"
    asts = [t for t in b.turns if t.role == "assistant"]
    assert len(asts) == 4  # m1 deduped; m2, m3, synthetic m4
    m1 = asts[0]
    assert (m1.tokens_in, m1.tokens_out, m1.tokens_cache_read, m1.tokens_cache_write) == (10, 50, 5, 7)
    assert m1.text == "hello" and m1.latency_ms == 3000  # last line ts - user ts
    assert asts[1].latency_ms == 4321  # turn_duration wins on last turn of the prompt
    assert asts[2].latency_ms == 5000
    syn = asts[3]
    assert syn.status == "error" and syn.model is None and syn.tokens_in is None
    assert [c.name for c in b.tool_calls] == ["Edit", "Bash"]
    edit, bash = b.tool_calls
    assert edit.is_edit and edit.status == "ok" and edit.duration_ms == 1000
    assert bash.status == "denied" and not bash.is_edit
    (ce,) = b.code_edits
    assert (ce.file, ce.lines_added, ce.lines_removed, ce.state) == ("/work/proj/a.py", 3, 2, "applied")
    (s,) = b.sessions
    assert s.session_id == "claude_code:s1" and s.title == "Fix thing" and s.project_path == "/work/proj"
    assert s.model == "claude-x" and s.mode == "cli" and not s.is_subagent
    assert s.started_at.isoformat() == "2026-01-01T00:00:00+00:00"


def test_edit_fallback_and_denied_edit(tmp_path, monkeypatch):
    d = tmp_path / "projects" / "p"
    d.mkdir(parents=True)
    lines = [
        L(type="user", timestamp="2026-01-01T00:00:00Z", message={"content": "go"}),
        asst("a", "2026-01-01T00:00:01Z", [
            {"type": "tool_use", "id": "e1", "name": "Edit",
             "input": {"file_path": "/f", "old_string": "a\nb", "new_string": "c"}},
            {"type": "tool_use", "id": "e2", "name": "Write",
             "input": {"file_path": "/g", "content": "1\n2\n3"}}], {"output_tokens": 1}),
        tr("e1", "2026-01-01T00:00:02Z"),
        tr("e2", "2026-01-01T00:00:02Z", "The user doesn't want to take this action", True),
    ]
    (d / "x.jsonl").write_text("\n".join(lines))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    b = ClaudeCodeAdapter().parse(ClaudeCodeAdapter().discover()[0])
    got = [(e.file, e.lines_added, e.lines_removed, e.state) for e in b.code_edits]
    assert got == [("/f", 1, 2, "applied"), ("/g", 3, 0, "rejected")]


def test_subagent(tmp_path, monkeypatch):
    build(tmp_path)
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    a = ClaudeCodeAdapter()
    sub = next(f for f in a.discover() if "subagents" in f.path.parts)
    (s,) = a.parse(sub).sessions
    assert s.session_id == "claude_code:s1:y" and s.is_subagent and s.parent_session_id == "claude_code:s1"


def test_health(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "nope"))
    assert ClaudeCodeAdapter().health().status == "missing"
    assert ClaudeCodeAdapter().discover() == []
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    build(tmp_path)
    with open(tmp_path / "projects" / "-work-proj" / f"{SID}.jsonl", "a") as fh:
        fh.write((L(type="attachment") + "\n") * 20)
    h = ClaudeCodeAdapter().health()
    assert h.status == "ok" and h.sessions_found == 2 and h.versions_seen == ["2.1.300"]
    (tmp_path / "projects" / "bad.jsonl").write_text("x\ny\nz\n")
    assert ClaudeCodeAdapter().health().status == "degraded"
