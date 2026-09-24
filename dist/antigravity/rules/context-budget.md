---
description: Monitors the live Claude Code session's context size through hooks and pauses before it gets expensive — at a token budget the agent writes a checkpoint and asks for /compact or /clear, and the checkpoint is re-injected automatically on resume. Use when the user wants session token monitoring, automatic pause/resume, a context budget, or long autonomous runs that shouldn't silently balloon.
trigger: model_decision
---

# Context Budget

Every turn re-reads the whole context, so cost grows with session length,
not with the size of the latest question. In practice a few long sessions
hold nearly all cache-read tokens (`token-saver/scripts/session_audit.py`
shows your own numbers). This skill makes the length visible and turns it
into a pause/resume loop instead of a silent balloon.

## Procedure

1. **Install the hooks once** (idempotent, backs up settings first):
   `python3 _context-budget/scripts/install_hooks.py` — adds `budget_hook.py check` on
   UserPromptSubmit and PostToolUse, and `budget_hook.py resume` on
   SessionStart for `compact|clear|resume`. `--uninstall` removes them.

2. **Set the budget** (optional): `AGENTKIT_BUDGET_TOKENS` (default
   200000) and `AGENTKIT_BUDGET_STEP` (default 50000, re-warn interval) in
   the `env` block of settings. Pick a budget below `autoCompactWindow` so
   your checkpoint beats the generic auto-compaction summary.

3. **When the pause notice arrives**, finish the current step — don't
   abandon a half-applied edit — then write the checkpoint to the path the
   notice names, using the `context-compressor` template (Goal, Decisions
   with reasons, State, Open threads / Next action; under 60 lines). Lint
   it with `context-compressor/scripts/checkpoint.py lint <path>`.

4. **Ask the user to** `/compact` (same task continues) or `/clear` (next
   task). On the next session start of either kind the checkpoint is
   injected back as context, so work resumes without re-deriving state.

5. **Check manually** any time: `python3 _context-budget/scripts/budget_hook.py status
   <transcript.jsonl>` prints the current context tokens;
   `python3 _context-budget/scripts/budget_hook.py path` prints this directory's
   checkpoint path.

## Reference

- `_context-budget/reference/design.md` — why these hook events, the state file, and the
  failure-mode rules (never block, never crash the session).

## Token economy

- The hook reads only the last 512KB of the transcript and stays silent
  below budget, so its own cost is near zero.
- It warns once per step past the budget, not on every tool call.
- General read/search/output patterns live in the `token-saver` skill.
