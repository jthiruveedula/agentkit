# Session analytics & automation opportunities

What the kit already covers, what this skill adds, and what's next, ranked
by value against effort. All of it stays local and stdlib-only.

## Already covered

| Area | Where |
|---|---|
| Token spend per session | `token-saver/scripts/session_audit.py` |
| Live context cap, pause/resume | `context-budget` hooks |
| Mistake clustering → durable fixes | `memory-sync` + `memory` |
| Prompt rewriting by intent | `prompt-enhancer/scripts/classify.py` |

## Added by session-insights (v0.1)

- **Prompt analytics**: intent mix, length, vague rate, done-condition rate.
- **Friction**: corrections, interrupts, denials, tool error rate by tool.
- **Waste**: file re-reads per session.
- **Automation candidates**: repeated prompt openers and shell commands.
- **memory-sync feed**: `--incidents` gives memory-sync something to mine
  automatically. Before this, its step 1 asked the user to describe friction.

## Next opportunities (ranked)

| # | Opportunity | Value | Effort | Approach |
|---|---|---|---|---|
| 1 | **Weekly insights routine** | High | S | Cron / scheduled trigger runs `insights.py --json` and keeps the last N reports in `~/.agentkit/insights/`, then diffs week over week ("correction rate 22% → 12%"). |
| 2 | **Live prompt-quality nudge** | High | S | UserPromptSubmit hook: when a prompt is vague *and* the intent is code-gen/debug, inject a one-line hint ("name the file and done-condition"). Advisory only, never blocks. Reuses `ANCHOR_RE` + `classify.py`. |
| 3 | **Auto-draft slash commands** | High | M | For each repeated opener, collect the 3 fullest prompts and draft `.claude/commands/<name>.md` with `$ARGUMENTS`, for the user to approve. |
| 4 | **Outcome tagging** | Med | M | Classify each session's end state (commit pushed, tests green, abandoned, cleared mid-task) from the final tool calls. That lets you correlate prompt traits with success instead of with volume. |
| 5 | **Tool-error → setup fix** | Med | S | Map recurring errors (`ModuleNotFoundError`, `command not found`, missing env) to a suggested SessionStart hook or setup-script line. |
| 6 | **Cost per intent** | Med | S | Join `session_audit` tokens with the intent mix to show which kinds of work are expensive, and where to route to a cheaper model or a subagent. |
| 7 | **Subagent ROI** | Med | M | From `isSidechain` records: tokens spent per subagent and whether its output was used. This tests the orchestrate skill's claim that fan-out costs 3-15× the tokens. |
| 8 | **HTML dashboard** | Low | M | Render `--json` into a static page (trend lines, top suggestions). Wait until 1 and 4 exist, so there are trends worth plotting. |
| 9 | **Cross-tool parity** | Low | L | Copilot/Cursor transcript adapters behind the same `parse_session` shape. |

## Guardrails

- Never upload transcripts. Output truncates prompt text; `--json` holds
  only truncated examples.
- Heuristic thresholds: tune them on your own history before acting on
  borderline numbers.
- Suggestions point at existing skills. Prefer adding a signal to
  `insights.py` over adding new prose.
