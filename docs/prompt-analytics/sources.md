# Session sources

Verified on-disk formats for each adapter. "Verified" means inspected
read-only on a real machine (macOS, 2026-10-31); "documented" means from
upstream docs or community exporters only. No session content was copied
into this file; only structure and counts.

Every adapter feature-detects: missing keys, tables or columns are
tolerated, and an unrecognised layout makes `health()` report `degraded`
or `unsupported` instead of raising.

## Claude Code (verified, v2.1.222 to 2.1.309)

**Paths**

| OS | Path |
|---|---|
| macOS / Linux | `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` |
| Windows | `%USERPROFILE%\.claude\projects\...` (documented) |
| Any | `CLAUDE_CONFIG_DIR` replaces `~/.claude` and must be checked first |

The slug is lossy (`/` becomes `-`), so the real working directory comes
from each line's `cwd` field. Subagent transcripts live under
`<sessionId>/subagents/agent-*.jsonl` and, in newer versions,
`<sessionId>/subagents/workflows/wf_*/agent-*.jsonl`. Discovery must glob
recursively: subagent files were 510 of 541 files on the test machine.

**Record types** (top-level `type`)

| type | Use |
|---|---|
| `user` | Prompt (`message.content` str or blocks), `tool_result` blocks (`tool_use_id`, `is_error`), `toolUseResult` (Edit: `structuredPatch`, `userModified`; Bash: `interrupted`), `toolDenialKind`, `permissionDecision`, `isCompactSummary`, `isMeta` |
| `assistant` | `message{id, model, content[], stop_reason, usage}`, `tool_use` blocks `{id, name, input}`, `isSidechain`, `agentId`, `thinkingDurationMs` |
| `system` | `turn_duration` (`durationMs`), `compact_boundary`, `stop_hook_summary` |
| `cost-state` | `totalCostUSD`, lines added/removed (cross-check only, sparse) |
| `ai-title` / `custom-title` | Session title |
| `pr-link` | `prNumber`, `prUrl` (outcome signal) |
| `attachment`, `api-*`, `queue-operation`, `file-history-*` | Ignored |

Envelope on every turn line: `uuid`, `parentUuid`, `timestamp` (ISO-8601
Z), `sessionId`, `cwd`, `gitBranch`, `version`, `entrypoint`.

**Tokens and cost**
- One API message is split over several lines (one per content block).
  Group by `message.id` and take the **last** usage seen, since streaming
  chunks differ in 861 of 5,649 repeated ids. First-seen undercounts
  output tokens. The legacy `session-insights` parser has this bug.
- Tokens: `input_tokens`, `output_tokens`, `cache_read_input_tokens`,
  `cache_creation_input_tokens`, with 5m/1h split under `cache_creation`.
- Cost is estimated from a price table keyed by `message.model`. Skip
  `model == "<synthetic>"` (error stubs).
- Dedupe globally on `(sessionId, message.id)`: resumed and forked
  sessions replay messages, and sidechain lines can also appear in the
  parent file.

**Edits and friction**
- Edits: `tool_use` named `Edit`, `Write`, `MultiEdit`, `NotebookEdit`.
  Applied = matching `tool_result` with falsy `is_error`, or
  `toolUseResult.structuredPatch` present. Rejected = `is_error` with
  content starting `The user doesn't want to take this action`, or
  `toolDenialKind` set.
- Interrupt: user text starting `[Request interrupted by user`.
- Latency: `system/turn_duration.durationMs` when present, else the
  assistant timestamp minus the preceding user timestamp.

**Caveats**: 22 distinct versions on one machine. Fields such as `speed`,
`iterations`, `effort` and `sessionKind` appear late, and `session_id`
snake_case sits alongside `sessionId`. Always use `.get()`.

## opencode (verified, v1.18.7, SQLite era)

**Paths**

| OS | Path |
|---|---|
| macOS / Linux | `$XDG_DATA_HOME/opencode/opencode.db`, default `~/.local/share/opencode/opencode.db` |
| Windows | `%USERPROFILE%\.local\share\opencode\opencode.db` (documented) |
| Any | `OPENCODE_DB` overrides the path; glob `opencode*.db` for dev/beta channels |

The legacy JSON-files era (`storage/session/`, `storage/message/`,
`storage/part/`) is detected and reported as unsupported in v1.

**Tables read**: `session`, `message`, `part`, `project`. The newer
`event` and `session_*` tables are ignored.
- `session`: `id`, `project_id`, `parent_id` (subagent when set),
  `directory`, `title`, `time_created`/`time_updated` (ms epoch), `model`
  (JSON `{id, providerID}`), `cost`, `tokens_input`, `tokens_output`,
  `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`,
  `summary_additions`, `summary_deletions`, `summary_files`.
- `message.data` JSON: `role`, `time{created, completed}`, `modelID`,
  `providerID`, `cost`, `tokens{input, output, reasoning, cache{read, write}}`,
  `finish`, `error`.
- `part.data` JSON, typed by `type`:
  - `text`
  - `reasoning`
  - `tool`: `tool`, `callID`, `state{status, input, metadata, time{start, end}, error}`
  - `patch`: `hash`, `files[]`
  - `step-start`
  - `step-finish`: `tokens`, `cost`
  - `file`
  - `compaction`

**Tokens and cost**: opencode records USD cost directly. Sum
message-level `cost`/`tokens` and never also add `step-finish` parts,
which would double count. Cost is 0 for subscription providers.

**Edits**: tool parts named `edit`/`write`/`patch`. Path comes from
`state.input.filePath`; line counts come from `state.metadata.filediff`
(`additions`, `deletions`), else from counting `newString`/`oldString`
lines. Status `completed` means applied, `error` means failed.

**Caveats**: about 500 MB and WAL-active, so open with
`file:...?mode=ro`. Never read `auth.json`, `mcp-auth.json`, or the
`credential`/`account` tables. 38 migrations so far, so feature-detect
with `pragma table_info`.

## GitHub Copilot Chat in VS Code (verified, session `version: 3`)

**Paths** (`<U>` is the VS Code `User` dir)

| OS | `<U>` |
|---|---|
| macOS | `~/Library/Application Support/Code/User` |
| Windows | `%APPDATA%\Code\User` (documented) |
| Linux | `~/.config/Code/User` (documented) |

`Code - Insiders` and `VSCodium` are sibling variants with the same layout.

| Path under `<U>` | Content |
|---|---|
| `workspaceStorage/<hash>/chatSessions/<sessionId>.jsonl` | Sessions per workspace |
| `workspaceStorage/<hash>/workspace.json` | `{folder: "file:///..."}`, maps the hash to a project |
| `globalStorage/emptyWindowChatSessions/<sessionId>.jsonl` | Sessions opened with no folder |
| `workspaceStorage/<hash>/chatEditingSessions/<sessionId>/state.json` | Per-file edit outcomes |
| `globalStorage/state.vscdb`, `ItemTable` key `chat.ChatSessionStore.index` | Title, `timing.lastRequestEnded`, `isExternal` |

**Format**: JSONL mutation log. The file must be replayed in order;
reading only the first line gives a stale state.

| Line `kind` | Meaning |
|---|---|
| `0` | Initial state, `v` holds the full session |
| `1` | Set the value at path `k` |
| `2` | Push items to the array at `k`; if `i` is given, truncate to index `i` first |
| `3` | Delete the value at `k` |

Source: `objectMutationLog.ts` in `microsoft/vscode`. Older builds wrote a
single `.json` snapshot per session; that is supported as a fallback.

**Mapping** (per `requests[i]`)

| Unified field | Copilot source |
|---|---|
| Prompt | `message.text` |
| Response | `response[]` parts with no `kind` |
| Timestamp | `timestamp` (epoch ms) |
| Model | `result.metadata.resolvedModel`, else `modelId` |
| Latency | `result.timings.totalElapsed`, else `elapsedMs` |
| Time to first token | `result.timings.firstProgress` |
| Tokens | `result.metadata.promptTokens` / `outputTokens`, else request-level `promptTokens` / `completionTokens`. 13% of requests have neither, so those are estimated at chars/4 and flagged |
| Status | `modelState.value`: 0 pending, 1 complete, 2 cancelled, 3 failed, 4 needs input |
| Error | `result.errorDetails.code` |
| Tool calls | `response[]` with `kind == "toolInvocationSerialized"` (`toolId`, `toolCallId`, `isComplete`, `isConfirmed`) |
| Code edits | `response[]` with `kind == "textEditGroup"` (`uri`, `edits`) |
| Edit outcome per request | `editedFileEvents[].eventKind`: 1 keep, 2 undo, 3 user-modified |
| Edit outcome per file | `chatEditingSessions/<sid>/state.json` `recentSnapshot.entries[].state`: 0 pending, 1 accepted, 2 rejected |
| Mode (ask / agent / edit) | `modeInfo`. Not `agent.id`, which is always `editsAgent` |

**Gaps**: no cache tokens and no cost (estimated from a price table). Skip
the bulky `toolCallResults` and `renderedUserMessage` while parsing. The
largest file seen was 7.5 MB, so stream it.

## Cursor (documented only; not installed on the test machine)

Built from community reverse-engineering, because Cursor publishes no
spec:
- https://github.com/S2thend/cursor-history
- txcript `docs/formats/cursor-desktop.md`
- the memorph and skiagram Cursor adapters
- forum threads on `state.vscdb` growth

Everything here is fixture-tested only. Fields marked † are unconfirmed
and parsed as optional.

**Paths**

| OS | User dir |
|---|---|
| macOS | `~/Library/Application Support/Cursor/User` |
| Windows | `%APPDATA%\Cursor\User` |
| Linux | `~/.config/Cursor/User` |
| Any | `CURSOR_DATA_PATH` overrides the user dir |

Bodies live in `globalStorage/state.vscdb`.
`workspaceStorage/<hash>/workspace.json` maps a workspace to its folder.
The Cursor CLI's `~/.cursor/` store uses a separate schema and is out of
scope for v1.

**Current era (Cursor 3.x, 2025 to 2026)**
- Table `composerHeaders`, one row per session: `composerId`,
  `workspaceId`, `createdAt`, `lastUpdatedAt`, `isArchived`,
  `isSubagent`, and `value` JSON (`name`, `unifiedMode`,
  `workspaceIdentifier.uri.fsPath`).
- `cursorDiskKV` key `composerData:<cid>` (`_v` 17): `createdAt` (int ms),
  `modelConfig.modelName`, `isAgentic`, `status`, and
  `fullConversationHeadersOnly[{bubbleId}]`. The headers array is the only
  source of message order.
- `cursorDiskKV` key `bubbleId:<cid>:<bid>` (`_v` 3): `type` (1 user,
  2 assistant), `createdAt` (RFC3339 string), `text`,
  `modelInfo.modelName`, `tokenCount{inputTokens, outputTokens}`, and
  `toolFormerData{name, toolCallId, status, params (JSON string)}`.
  `tokenCount` is usually all zeros, so tokens are estimated and flagged.
- †`codeBlockData{<uri>: {status}}` (accepted or rejected) and
  †`timingInfo`.
- Fallbacks: no `composerHeaders` table means scan `composerData:%` keys.
  The older workspace `ItemTable` keys `composer.composerData` and
  †`workbench.panel.aichat.view.aichat.chatdata` (legacy chat tabs) are
  read when present.

**Caveats**
- Global DBs can reach 30 to 96 GB. Never copy them whole: query key
  ranges and use `CAST(value AS TEXT)`.
- Open read-only. Use `mode=ro`, or `immutable=1` only when Cursor is not
  running, since `immutable=1` ignores the WAL.
- Subagent bubbles are duplicated, so dedupe by `bubbleId`.
- `modelName` is often `"default"`.
- An unknown `_v` raises a warning in `health()`.

## Google Antigravity (verified on macOS; metadata tier only)

**Paths**
- `~/Library/Application Support/Antigravity/` is only the Electron shell
  (caches, onboarding flags).
- Real state lives in `~/Library/Application Support/Antigravity IDE/User/`:
  - `globalStorage/state.vscdb`
  - `workspaceStorage/<hash>/{state.vscdb, workspace.json}`
- Glob both `Antigravity` and `Antigravity IDE`.
- Windows `%APPDATA%\Antigravity IDE\User` and Linux
  `~/.config/Antigravity IDE/User` are inferred.
- Some builds also write `~/.gemini/antigravity/`, with
  `conversations/<uuid>.pb` (opaque protobuf) and `brain/<uuid>/*.md`
  (plan and walkthrough artifacts). This was not present on the test
  machine.

**What is parsed (tier 2, offline)**
- `ItemTable` key `antigravityUnifiedStateSync.trajectorySummaries` is the
  conversation index.
- Its value is base64 of a repeated protobuf
  `{1: uuid, 2: {1: base64(inner)}}`. The inner protobuf fields were
  inferred from 2 samples, so these are best effort:

| Field | Meaning |
|---|---|
| f1 | title |
| f2 | step count |
| f3 | last-modified timestamp `{secs, nanos}` |
| f4 | uuid |
| f5 | status |
| f7 | created timestamp |
| f9 / f17 | workspace URIs |
| f10 | last user input timestamp |

- Decoding uses a stdlib raw varint parser; no `.proto` is needed.
- When present, `.gemini/antigravity/conversations/*.pb` mtime and size are
  used as fallbacks, and `brain/<uuid>/` gives an artifact count.

**Not recoverable offline**: turn text, tool calls, diffs, per-turn
timestamps, tokens and model. These live in the opaque `.pb` files or
behind the IDE's undocumented local language-server RPC
(`exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`,
CSRF token from the process args). The RPC tier is out of scope for v1:
it is fragile, needs the IDE running, and is unofficial. Antigravity
sessions therefore count toward footprint and cadence, while turn-level
metrics show "n/a".

**Safety**: the global DB also holds `antigravityUnifiedStateSync.oauthToken`
and profile keys. The adapter reads a strict **key whitelist** and nothing
else, and opens the DB with `mode=ro`.

**Sources**
- https://github.com/Enbrow/google-antigravity-export
- https://github.com/neo1027144-creator/antigravity-history
- https://docs.rs/devboy-core/0.27.0/devboy_core/agents/antigravity/
