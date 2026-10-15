---
description: Prompt analytics and friction report over past Claude Code sessions — intent mix, underspecified prompts, correction/redo rate, interrupts, tool errors, permission denials, file re-reads, and prompts/commands repeated across sessions — ending in ranked, evidence-backed suggestions to work faster. Use when the user asks how to be more productive with agents, wants prompt analytics, a session retro, or "what am I doing wrong / what should I automate".
applyTo: **
---

# Session Insights

`token-saver/scripts/session_audit.py` measures what sessions *cost*.
This skill measures *why*: what the user typed, where the agent was
corrected or interrupted, which tools failed, and what keeps being done
by hand. Deterministic script first, model judgment second.

## Procedure

1. **Run the report** (local only, reads transcripts, sends nothing):
   ```
   python3 _session-insights/scripts/insights.py --last 50
   python3 _session-insights/scripts/insights.py --project myrepo --json
   ```
   Thresholds need about 5+ prompts to fire; widen `--last` if the
   report says "none".

2. **Read the suggestions top-down.** Each one names its evidence (a
   rate, a count, an example prompt) and an action pointing at an
   existing skill or harness feature. Don't add suggestions the data
   doesn't show.

3. **Feed friction into memory-sync** so repeated mistakes become
   durable corrections instead of a one-off note:
   ```
   python3 _session-insights/scripts/insights.py --incidents > incidents.txt
   python3 ../memory-sync/scripts/rank_patterns.py incidents.txt
   ```

4. **Act on the automation candidates.** A prompt opener repeated in
   3+ sessions becomes a slash command or a `skill-forge` skill. A
   command reused in 3+ sessions goes on the permission allowlist
   (read-only) or into a make target (multi-step).

5. **Report briefly**: 3-5 suggestions with the metric behind each,
   then the one change to make first. Quote prompts only as short
   truncated examples — transcripts can hold sensitive text.

## Signals

| Signal | How it is detected | Typical fix |
|---|---|---|
| Vague prompt | < 8 words, no file/symbol/error/URL named | Name the target and done-condition; `prompt-enhancer` |
| No done-condition | no "should / must / done when / passes" | Acceptance line; `spec-writer` |
| Correction | follow-up opens with no / wrong / actually / still / undo | `memory-sync`; plan before edit |
| Interrupt | `[Request interrupted by user]` | Plan mode for risky work |
| Denial | tool result says the user declined | `/fewer-permission-prompts`, deny rules |
| Tool error | `is_error` tool results, by tool | Memory correction; SessionStart hook |
| Re-read | same file `Read` 3+ times in a session | `token-saver`; facts into CLAUDE.md |
| Repeat opener | first 6 words shared by 3+ sessions | Slash command / skill |
| Repeat command | Bash command head in 3+ sessions | Allowlist or script |

Heuristics, not NLP: treat a suggestion as a lead to confirm, not a verdict.
Further automation ideas and their status: `_session-insights/reference/opportunities.md`.

## Token economy

- Run the script; never read raw transcripts into context.
- Use `--json` only when post-processing; the text report is shorter.
- General read/search/output patterns live in the `token-saver` skill.
