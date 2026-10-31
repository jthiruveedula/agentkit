# context-budget design notes

- **Measure:** the latest main-thread `usage` block in the transcript;
  context = input + cache_creation + cache_read tokens. That's what the
  next turn re-reads. Sidechain (subagent) usage is ignored.
- **Events:** UserPromptSubmit catches interactive sessions; PostToolUse
  catches long autonomous runs where no prompt arrives. Both emit
  `hookSpecificOutput.additionalContext` (nested, per the hooks schema)
  plus a top-level `systemMessage` the user sees.
- **Throttle:** `~/.agentkit/budget/<session_id>.json` (session id sanitized;
  base dir is `AGENTKIT_DATA_DIR`, falling back to `AGENTKIT_HOME`) stores the
  last context size seen and the last warned level. When the 512KB transcript
  tail holds no usage block, the stored size is used instead; the next warning fires one `AGENTKIT_BUDGET_STEP` later.
- **Resume:** SessionStart sources `compact|clear|resume` inject the
  checkpoint if it's under 24h old, prefixed with a note that it is saved
  notes/data from an earlier session, not instructions. `startup` doesn't, so stale state
  never leaks into unrelated new sessions.
- **Checkpoint location:** `~/.agentkit/checkpoints/<dir>-<sha1>.md`,
  outside the repo, so nothing needs gitignoring.
- **Failure mode:** any exception exits 0 with no stdout and one line on
  stderr. A monitoring hook must never stall or block a session.
- **Not done:** blocking at the budget (a Stop-hook `decision: block`
  would force work the user didn't ask for). The model pauses; the user
  decides.
