"""Claude Code adapter: ``<config>/projects/**/*.jsonl`` transcripts.

Format notes live in docs/prompt-analytics/sources.md. Every key is read with
``.get`` because 20+ client versions coexist on one machine.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from ..schema import CodeEdit, ParsedBatch, Session, ToolCall, Turn
from .base import Health, SourceFile, home, stat_file

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
INTERRUPT = "[Request interrupted by user"
DENIED = "The user doesn't want to take this action"
NOISE = (
    "<command-name>",
    "<command-message>",
    "<command-args>",
    "<local-command-stdout>",
    "<local-command-stderr>",
    "<local-command-caveat>",
    "<system-reminder>",
    "<task-notification",
    "Caveat:",
)


def _root() -> Path:
    cfg = os.environ.get("CLAUDE_CONFIG_DIR")
    return (Path(cfg) if cfg else home() / ".claude") / "projects"


def _ts(v) -> datetime | None:
    if not isinstance(v, str):
        return None
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _ms(a: datetime | None, b: datetime | None) -> int | None:
    return max(0, int((b - a).total_seconds() * 1000)) if a and b else None


def _lines(s) -> int:
    return len(s.splitlines()) if isinstance(s, str) and s else 0


def _text_of(content) -> tuple[str, bool]:
    """(joined text blocks, has_tool_result)."""
    if isinstance(content, str):
        return content, False
    parts, has_tr = [], False
    for b in content if isinstance(content, list) else []:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text" and isinstance(b.get("text"), str):
            parts.append(b["text"])
        elif b.get("type") == "tool_result":
            has_tr = True
    return "\n".join(parts), has_tr


def _result_text(content) -> str:
    if isinstance(content, str):
        return content
    return "\n".join(
        b["text"] for b in content if isinstance(b, dict) and isinstance(b.get("text"), str)
    ) if isinstance(content, list) else ""


def _patch_counts(sp) -> tuple[int, int] | None:
    if not isinstance(sp, list) or not sp:
        return None
    a = r = 0
    for h in sp:
        for ln in (h.get("lines") if isinstance(h, dict) else None) or []:
            if isinstance(ln, str):
                a += ln.startswith("+")
                r += ln.startswith("-")
    return a, r


def _input_counts(name: str, inp: dict) -> tuple[int, int]:
    if name == "Write":
        return _lines(inp.get("content")), 0
    if name == "NotebookEdit":
        return _lines(inp.get("new_source")), 0
    edits = inp.get("edits") if name == "MultiEdit" and isinstance(inp.get("edits"), list) else [inp]
    a = r = 0
    for e in edits:
        if isinstance(e, dict):
            a += _lines(e.get("new_string"))
            r += _lines(e.get("old_string"))
    return a, r


def _read(path: Path) -> tuple[list[dict], int]:
    recs, bad = [], 0
    with open(path, encoding="utf-8", errors="replace") as fh:
        for ln in fh:
            if not ln.strip():
                continue
            try:
                d = json.loads(ln)
            except ValueError:
                bad += 1
                continue
            if isinstance(d, dict):
                recs.append(d)
            else:
                bad += 1
    return recs, bad


class ClaudeCodeAdapter:
    name = "claude_code"

    def _files(self) -> list[Path]:
        root = _root()
        if not root.is_dir():
            return []
        return sorted(p for p in root.glob("**/*.jsonl") if p.name != "journal.jsonl")

    def discover(self) -> list[SourceFile]:
        out = []
        for p in self._files():
            try:
                out.append(stat_file(self.name, p))
            except OSError:
                continue
        return out

    def health(self) -> Health:
        if not _root().is_dir():
            return Health(self.name, "missing", messages=[f"{_root()} not found"])
        files = self._files()
        versions: set[str] = set()
        total = bad_total = 0
        for p in files:
            try:
                recs, bad = _read(p)
            except OSError:
                continue
            total += len(recs) + bad
            bad_total += bad
            versions.update(v for v in (r.get("version") for r in recs) if isinstance(v, str))
        msgs: list[str] = []
        status = "ok"
        if total and bad_total / total > 0.05:
            status = "degraded"
            msgs.append(f"{bad_total}/{total} lines unparseable")
        return Health(self.name, status, len(files), msgs, sorted(versions))

    def parse(self, f: SourceFile) -> ParsedBatch:
        batch = ParsedBatch()
        recs, bad = _read(f.path)
        if bad:
            batch.warnings.append(f"{f.path.name}: {bad} unparseable line(s)")
        if not recs:
            return batch

        parts = f.path.parts
        is_sub = "subagents" in parts
        sid = next((r.get("sessionId") or r.get("session_id") for r in recs
                    if r.get("sessionId") or r.get("session_id")), None)
        if is_sub and not sid:
            sid = parts[parts.index("subagents") - 1]
        sid = sid or f.path.stem
        if is_sub:
            agent = next((r.get("agentId") for r in recs if r.get("agentId")), None) or f.path.stem
            session_id, parent = f"claude_code:{sid}:{agent}", f"claude_code:{sid}"
        else:
            session_id, parent = f"claude_code:{sid}", None

        # Pass 1: last usage per message.id, and tool results by tool_use_id.
        last_msg: dict[str, dict] = {}
        results: dict[str, dict] = {}
        texts_by_id: dict[str, list[str]] = {}
        for r in recs:
            m = r.get("message") if isinstance(r.get("message"), dict) else {}
            if r.get("type") == "assistant" and m.get("id"):
                last_msg[m["id"]] = {"msg": m, "line": r}
                tx = _text_of(m.get("content"))[0]
                if tx:
                    texts_by_id.setdefault(m["id"], []).append(tx)
            elif r.get("type") == "user" and isinstance(m.get("content"), list):
                for b in m["content"]:
                    if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("tool_use_id"):
                        results[b["tool_use_id"]] = {
                            "ts": _ts(r.get("timestamp")),
                            "is_error": bool(b.get("is_error")),
                            "text": _result_text(b.get("content")),
                            "denial": r.get("toolDenialKind"),
                            "tur": r.get("toolUseResult"),
                        }

        # Pass 2: emit in file order.
        idx = 0
        seen_msgs: set[str] = set()
        cur_user: Turn | None = None
        cur_assist: list[Turn] = []  # assistant turns since last user prompt
        models: Counter[str] = Counter()
        stamps: list[datetime] = []
        title = custom = project = mode = None

        for r in recs:
            t = r.get("type")
            ts = _ts(r.get("timestamp"))
            if ts:
                stamps.append(ts)
            project = project or r.get("cwd")
            mode = mode or r.get("entrypoint")
            if t == "ai-title":
                title = r.get("aiTitle") or r.get("title") or title
            elif t == "custom-title":
                custom = r.get("customTitle") or r.get("title") or custom
            elif t == "system" and r.get("subtype") == "turn_duration":
                if cur_assist and isinstance(r.get("durationMs"), (int, float)):
                    cur_assist[-1].latency_ms = int(r["durationMs"])
            elif t == "user":
                m = r.get("message") if isinstance(r.get("message"), dict) else {}
                if r.get("isMeta") or r.get("isCompactSummary"):
                    continue
                text = _text_of(m.get("content"))[0]
                text = text.strip()
                if not text or text.startswith(NOISE):
                    continue
                intr = text.startswith(INTERRUPT)
                cur_user = Turn(
                    turn_id=f"{session_id}:u:{r.get('uuid') or idx}",
                    session_id=session_id, idx=idx, role="user", ts=ts,
                    text=None if intr else text,
                    status="interrupted" if intr else "ok", is_interrupt=intr,
                )
                idx += 1
                cur_assist = []
                batch.turns.append(cur_user)
            elif t == "assistant":
                m = r.get("message") if isinstance(r.get("message"), dict) else {}
                mid = m.get("id")
                if mid and mid in seen_msgs:
                    # extra content-block line: still harvest tool_use below
                    turn_id = f"{session_id}:a:{mid}"
                else:
                    turn_id = f"{session_id}:a:{mid or r.get('uuid') or idx}"
                    src = last_msg.get(mid, {"msg": m}) if mid else {"msg": m}
                    fm = src["msg"]
                    synthetic = fm.get("model") == "<synthetic>"
                    u = fm.get("usage") if isinstance(fm.get("usage"), dict) and not synthetic else None
                    texts = texts_by_id.get(mid, []) if mid else [_text_of(m.get("content"))[0]]
                    status = "error" if (synthetic or r.get("isApiErrorMessage")) else "ok"
                    turn = Turn(
                        turn_id=turn_id, session_id=session_id, idx=idx, role="assistant", ts=ts,
                        text="\n".join(x for x in texts if x) or None,
                        model=None if synthetic else fm.get("model"),
                        tokens_in=(u or {}).get("input_tokens"),
                        tokens_out=(u or {}).get("output_tokens"),
                        tokens_cache_read=(u or {}).get("cache_read_input_tokens"),
                        tokens_cache_write=(u or {}).get("cache_creation_input_tokens"),
                        status=status,
                    )
                    if cur_user and not cur_assist:
                        last_ts = _ts(src.get("line", r).get("timestamp")) or ts
                        turn.latency_ms = _ms(cur_user.ts, last_ts)
                    if turn.model:
                        models[turn.model] += 1
                    idx += 1
                    if mid:
                        seen_msgs.add(mid)
                    cur_assist.append(turn)
                    batch.turns.append(turn)
                content = m.get("content")
                for b in content if isinstance(content, list) else []:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        self._tool(batch, session_id, turn_id, b, ts, results)

        batch.sessions.append(Session(
            session_id=session_id, source=self.name, source_key=f.key,
            project_path=project, title=custom or title,
            started_at=min(stamps) if stamps else None, ended_at=max(stamps) if stamps else None,
            is_subagent=is_sub, parent_session_id=parent,
            mode=mode, model=models.most_common(1)[0][0] if models else None,
        ))
        return batch

    @staticmethod
    def _tool(batch, session_id, turn_id, b, ts, results) -> None:
        name = b.get("name") or "unknown"
        cid = b.get("id") or f"{turn_id}:{len(batch.tool_calls)}"
        res = results.get(b.get("id"))
        if res is None:
            status = "pending"
        elif res["denial"] or res["text"].startswith(DENIED):
            status = "denied"
        elif res["is_error"]:
            status = "error"
        else:
            status = "ok"
        is_edit = name in EDIT_TOOLS
        batch.tool_calls.append(ToolCall(
            call_id=f"{session_id}:{cid}", session_id=session_id, turn_id=turn_id, name=name,
            ts=ts, duration_ms=_ms(ts, res["ts"]) if res else None,
            status=status, is_edit=is_edit,
        ))
        if not is_edit:
            return
        inp = b.get("input") if isinstance(b.get("input"), dict) else {}
        tur = res["tur"] if res and isinstance(res["tur"], dict) else {}
        counts = _patch_counts(tur.get("structuredPatch")) or _input_counts(name, inp)
        batch.code_edits.append(CodeEdit(
            edit_id=f"{session_id}:{cid}", session_id=session_id, turn_id=turn_id,
            file=inp.get("file_path") or inp.get("notebook_path"),
            lines_added=counts[0], lines_removed=counts[1],
            state={"ok": "applied", "denied": "rejected"}.get(status, "unknown"), ts=ts,
        ))
