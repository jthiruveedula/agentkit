---
description: Turn a rough feature idea or bug report into a short written spec — problem, scope, non-goals, acceptance criteria — before code is written. Use when the user asks for a spec, design doc, or "write this up before we build it".
applyTo: **
---

# Spec Writer

Produce, in this order, nothing more:

1. **Problem** — one paragraph, who's affected and what's broken/missing.
2. **Scope** — what this change covers.
3. **Non-goals** — what it explicitly does not cover (prevents scope creep
   later; this section is not optional).
4. **Acceptance criteria** — a checklist, each item testable/observable.
5. **Open questions** — anything the spec can't resolve without the user.
6. **Tasks** — the spec → plan → tasks breakdown (Spec Kit/Kiro pattern):
   split the acceptance criteria into tasks the `implementer`/`orchestrate`
   agents can pick up directly. Each task: `id`, `owner` (roster:
   researcher, implementer, test-writer, verifier, reviewer, doc-writer,
   data-platform-architect, pipeline-engineer, data-quality-engineer,
   ml-engineer), `objective`, `acceptance check` (how to tell it's done),
   `deps`. See `_spec-writer/reference/spec-template.md`. For a multi-agent run, emit
   this section as `.agentkit/plan.json` and validate it with
   `skills/orchestrate/scripts/plan_check.py` before delegating.

Keep it to what fits on one screen unless the feature genuinely needs more.
A spec that needs scrolling to find the acceptance criteria has failed its
own job. Skip the Tasks section for a one-agent, one-file change — it earns
its keep only once the spec hands off to more than one owner.

## Token economy

- A short spec before code prevents the most expensive token burn of
  all: rework. Write the spec first, never after.
- Keep the spec to this file's five sections — problem, scope,
  non-goals, acceptance criteria, open questions. Nothing more.
- General read/search/output patterns live in the `token-saver` skill —
  don't duplicate them here.
