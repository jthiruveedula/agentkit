---
name: context-budget
description: Pause long Claude Code sessions at a token budget: write a checkpoint, ask for /compact or /clear, auto-reinject on resume. Use when the user wants session token monitoring, a context budget, or pause/resume on long runs.
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/budget_hook.py *), Bash(python3 scripts/budget_hook.py *), Bash(python3 ../context-compressor/scripts/checkpoint.py lint *), Read, Write
version: 0.1.0
---

# Context Budget

Every turn re-reads the whole context, so cost grows with session length. This skill turns that into a pause/resume loop.

## Procedure

1. **Install the hooks once** (idempotent; keeps one `.bak` of settings and replaces the file atomically):
   `python3 scripts/install_hooks.py` — adds `budget_hook.py check` on
   UserPromptSubmit and PostToolUse, and `budget_hook.py resume` on
   SessionStart for `compact|clear|resume`. `--uninstall` removes them.

2. **Set the budget** (optional): `AGENTKIT_BUDGET_TOKENS` (default
   200000) and `AGENTKIT_BUDGET_STEP` (default 50000, re-warn interval) in
   the `env` block of settings (an invalid value warns on stderr and uses
   the default). Pick a budget below `autoCompactWindow` so your checkpoint
   beats the generic auto-compaction summary. State and checkpoints live in
   `AGENTKIT_DATA_DIR` (default `~/.agentkit`; `AGENTKIT_HOME` is still read
   as a fallback, but `install.sh` uses that name for the repo clone).

3. **When the pause notice arrives**, finish the current step — don't
   abandon a half-applied edit — then write the checkpoint to the path the
   notice names, using the `context-compressor` template (Goal, Decisions
   with reasons, State, Open threads / Next action; under 60 lines). Lint
   it with `../context-compressor/scripts/checkpoint.py lint <path>` (relative to this SKILL.md).

4. **Ask the user to** `/compact` (same task continues) or `/clear` (next
   task). On the next session start of either kind the checkpoint is
   injected back as context, so work resumes without re-deriving state.

5. **Check manually** any time: `python3 scripts/budget_hook.py status
   <transcript.jsonl>` prints the current context tokens;
   `python3 scripts/budget_hook.py path` prints this directory's
   checkpoint path.

## Reference

- `reference/design.md` — hook events, state file, failure-mode rules.
