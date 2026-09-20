---
description: Classify a raw prompt's intent (code-gen, debug, refactor, research, data-sql, architecture, writing, ops-cli, ambiguous) and rewrite it using that intent's pattern. Use when the user pastes a rough or underspecified prompt and asks to enhance, improve, tighten, or spec it up before running it.
trigger: model_decision
---

# Prompt Enhancer

Turn a rough prompt into a spec-grade one, without silently changing what the
user wants.

## Procedure

1. **Classify.** Run the deterministic classifier — never eyeball the intent
   yourself, the classifier is what the golden tests pin down:

   ```
   python3 _prompt-enhancer/scripts/classify.py "<the raw prompt, verbatim>"
   ```

   It returns `{intent, confidence, band, ask_clarifying, evidence,
   runners_up, note}`. `band` is `high` / `medium` / `low`.

2. **Low confidence (`ask_clarifying: true`)** — ask **at most 2** targeted
   questions that would flip the classification (see `runners_up` for the
   next-most-likely intents), then stop and wait. Do not guess and rewrite.

3. **Medium/high confidence** — state the intent and confidence out loud in
   one line, e.g. `Intent: debug (0.81 confidence)`, then rewrite using that
   intent's pattern from `_prompt-enhancer/reference/routing-table.md`.

4. **List assumptions.** Anything the rewrite fills in that the original
   prompt left implicit (language, framework, scope) goes in a short bullet
   list under the rewrite — never silently baked into the prompt text.

5. **Output the enhanced prompt in its own copyable code block.** Never merge
   it with your commentary; the user copies the block, not your prose.

6. **Never change the user's actual goal.** The rewrite adds structure
   (context, constraints, acceptance criteria, output format) — it does not
   swap in a different task, scope, or tech stack than what was asked.

## Reference

- `_prompt-enhancer/reference/routing-table.md` — one rewrite pattern per intent.
- `_prompt-enhancer/reference/examples.md` — 6 worked before/after pairs, one per major
  intent family.
- `_prompt-enhancer/scripts/classify.py` — the classifier. `--selftest` runs the golden
  cases in `_prompt-enhancer/tests/golden.json`.
- `_prompt-enhancer/tests/golden.json` — golden intent-classification fixtures; add a case
  here before hand-tuning a classifier weight.


## Token economy

- Classify intent first (cheap) — then load ONLY the matched intent's pattern from `_prompt-enhancer/reference/routing-table.md`, never all nine.
- Skip `_prompt-enhancer/reference/examples.md` unless the rewrite needs a worked pair; the pattern alone usually suffices.
- Ask at most 2 questions on low confidence — guessing and rewriting twice costs more than asking.
- General read/search/output patterns live in the `token-saver` skill — don't duplicate them here.
