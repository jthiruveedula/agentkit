---
description: Turn a rough feature idea or bug report into a short written spec — problem, scope, non-goals, acceptance criteria — before code is written. Use when the user asks for a spec, design doc, or "write this up before we build it".
trigger: model_decision
---

# Spec Writer

Produce, in this order, nothing more:

1. **Problem** — one paragraph, who's affected and what's broken/missing.
2. **Scope** — what this change covers.
3. **Non-goals** — what it explicitly does not cover (prevents scope creep
   later; this section is not optional).
4. **Acceptance criteria** — a checklist, each item testable/observable.
5. **Open questions** — anything the spec can't resolve without the user.

Keep it to what fits on one screen unless the feature genuinely needs more.
A spec that needs scrolling to find the acceptance criteria has failed its
own job.
