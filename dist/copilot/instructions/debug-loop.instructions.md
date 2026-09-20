---
description: Run a tight hypothesize-test-narrow loop on a failing test or reproducible bug until root cause is found, logging each attempt. Use when the user has a failing test, stack trace, or reproducible crash and wants it root-caused, not just patched.
applyTo: **
---

# Debug Loop

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
