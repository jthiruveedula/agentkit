---
description: Run a tight hypothesize-test-narrow loop on a failing test or reproducible bug until root cause is found, logging each attempt. Use when the user has a failing test, stack trace, or reproducible crash and wants it root-caused, not just patched.
trigger: model_decision
---

# Debug Loop

0. Check the substrate first. Before hypothesizing, search the `memory`
   skill for known corrections matching the failure — someone (possibly
   you, last month) may have already root-caused this exact mistake:
   `python3 skills/memory/scripts/memory.py search "<error / tool / area>" --kind correction`
   (from the repo root; from `skills/debug-loop/` use
   `../memory/scripts/memory.py`). If a correction matches, apply it
   and skip the loop.
1. Reproduce first. Get an exact failing command and its exact output
   before touching any code — no fix without a repro.
2. Loop, capped at 6 iterations before stopping to ask the user for more
   context:
   - State one falsifiable hypothesis for the cause
   - Make the smallest change/instrumentation that tests it (a print, an
     assert, reading one function — not a speculative fix)
   - Run the repro, record pass/fail
   - If it fails, the hypothesis is ruled out — state why, move to the next
3. Once root cause is found: grep every caller of the broken function
   (siblings often share the bug) before writing the fix, per the root-cause
   rule — one guard in the shared function beats N guards in callers.
4. Fix, then re-run the original repro plus the existing test suite. Report
   root cause in one sentence, not a beat-by-beat retelling of the loop.
