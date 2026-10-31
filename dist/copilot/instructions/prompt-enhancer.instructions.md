---
description: Classifies a raw prompt's intent and rewrites it with that intent's pattern. Use when the user pastes a rough or underspecified prompt and asks to enhance, improve, tighten, or spec it up.
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

`_prompt-enhancer/reference/routing-table.md` (one pattern per intent; load only the matched one), `_prompt-enhancer/reference/examples.md` (worked pairs; skip unless needed), `_prompt-enhancer/scripts/classify.py --selftest` (golden cases in `_prompt-enhancer/tests/golden.json`; add a case before tuning a weight).
