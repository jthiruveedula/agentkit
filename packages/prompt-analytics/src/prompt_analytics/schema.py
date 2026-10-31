"""Unified records every adapter emits, and the DuckDB DDL that stores them.

Ids are namespaced ``<source>:<native id>``. Timestamps are timezone-aware
UTC datetimes. Text fields hold RAW text when an adapter emits them;
``scan`` redacts (or drops, per ``store_text``) before anything is written.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from datetime import datetime

SOURCES = ("claude_code", "copilot", "cursor", "opencode", "antigravity")
EDIT_STATES = ("applied", "accepted", "rejected", "pending", "unknown")
TURN_STATUS = ("ok", "error", "cancelled", "interrupted")
CALL_STATUS = ("ok", "error", "denied", "pending")


@dataclass
class Session:
    session_id: str
    source: str
    source_key: str
    project_path: str | None = None  # absolute path; store hashes it into project_id
    title: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    is_subagent: bool = False
    parent_session_id: str | None = None
    mode: str | None = None  # ask / agent / edit / chat when the source says
    model: str | None = None  # most-used model in the session
    # Session-level totals reported by the source; None means "sum the turns".
    tokens_in: int | None = None
    tokens_out: int | None = None
    tokens_cache_read: int | None = None
    tokens_cache_write: int | None = None
    cost_usd: float | None = None  # None means estimate from pricing
    tokens_estimated: bool = False


@dataclass
class Turn:
    turn_id: str
    session_id: str
    idx: int
    role: str  # "user" | "assistant"
    ts: datetime | None = None
    text: str | None = None
    model: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    tokens_cache_read: int | None = None
    tokens_cache_write: int | None = None
    cost_usd: float | None = None
    latency_ms: int | None = None
    status: str = "ok"
    is_interrupt: bool = False


@dataclass
class ToolCall:
    call_id: str
    session_id: str
    turn_id: str | None
    name: str
    ts: datetime | None = None
    duration_ms: int | None = None
    status: str = "ok"
    is_edit: bool = False


@dataclass
class CodeEdit:
    edit_id: str
    session_id: str
    turn_id: str | None
    file: str | None  # absolute or repo-relative; store makes it repo-relative + redacts
    lines_added: int | None = None
    lines_removed: int | None = None
    state: str = "unknown"
    ts: datetime | None = None


@dataclass
class ParsedBatch:
    sessions: list[Session] = field(default_factory=list)
    turns: list[Turn] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)
    code_edits: list[CodeEdit] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def extend(self, other: "ParsedBatch") -> None:
        for f in fields(self):
            getattr(self, f.name).extend(getattr(other, f.name))


DDL = """
CREATE TABLE IF NOT EXISTS projects (
  project_id VARCHAR PRIMARY KEY, name VARCHAR, root VARCHAR, repo BOOLEAN
);
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR PRIMARY KEY, source VARCHAR, source_key VARCHAR, project_id VARCHAR,
  title VARCHAR, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, is_subagent BOOLEAN,
  parent_session_id VARCHAR, mode VARCHAR, model VARCHAR,
  n_user_turns INTEGER, n_assistant_turns INTEGER,
  tokens_in BIGINT, tokens_out BIGINT, tokens_cache_read BIGINT, tokens_cache_write BIGINT,
  cost_usd DOUBLE, cost_is_estimate BOOLEAN, tokens_estimated BOOLEAN
);
CREATE TABLE IF NOT EXISTS turns (
  turn_id VARCHAR PRIMARY KEY, session_id VARCHAR, idx INTEGER, role VARCHAR, ts TIMESTAMPTZ,
  text VARCHAR, text_len INTEGER, model VARCHAR,
  tokens_in BIGINT, tokens_out BIGINT, tokens_cache_read BIGINT, tokens_cache_write BIGINT,
  cost_usd DOUBLE, latency_ms BIGINT, status VARCHAR, is_interrupt BOOLEAN
);
CREATE TABLE IF NOT EXISTS tool_calls (
  call_id VARCHAR PRIMARY KEY, session_id VARCHAR, turn_id VARCHAR, name VARCHAR,
  ts TIMESTAMPTZ, duration_ms BIGINT, status VARCHAR, is_edit BOOLEAN
);
CREATE TABLE IF NOT EXISTS code_edits (
  edit_id VARCHAR PRIMARY KEY, session_id VARCHAR, turn_id VARCHAR, file VARCHAR,
  lines_added INTEGER, lines_removed INTEGER, state VARCHAR, ts TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS outcomes (
  outcome_id VARCHAR PRIMARY KEY, project_id VARCHAR, session_id VARCHAR, ts TIMESTAMPTZ,
  kind VARCHAR, files_changed INTEGER, insertions INTEGER, deletions INTEGER
);
-- Exposure scan: counts only, the matched values are never stored.
CREATE TABLE IF NOT EXISTS exposures (
  session_id VARCHAR, turn_id VARCHAR, ts TIMESTAMPTZ, kind VARCHAR, category VARCHAR,
  n INTEGER, preview VARCHAR, PRIMARY KEY (turn_id, kind)
);
-- User review of a flagged prompt from the dashboard (reviewed | false_positive).
CREATE TABLE IF NOT EXISTS exposure_reviews (
  turn_id VARCHAR PRIMARY KEY, status VARCHAR, reviewed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS watermarks (
  source VARCHAR, source_key VARCHAR, size BIGINT, mtime_ns BIGINT, content_hmac VARCHAR,
  parsed_at TIMESTAMPTZ, rules_version VARCHAR, PRIMARY KEY (source, source_key)
);
CREATE TABLE IF NOT EXISTS source_health (
  source VARCHAR PRIMARY KEY, status VARCHAR, sessions_found INTEGER, warnings VARCHAR,
  checked_at TIMESTAMPTZ, versions_seen VARCHAR
);
"""
