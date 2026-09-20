# Routing table

One rewrite pattern per intent. Each pattern is a checklist of sections the
enhanced prompt should carry — not a template to fill blindly; skip a
section if the original prompt already nails it.

| Intent | Signals | Rewrite pattern |
|---|---|---|
| `code-gen` | implement/build/write a X, new function/endpoint/component | Goal · inputs/outputs · language+framework (ask if unstated) · constraints (perf, style, deps) · acceptance criteria · where the code lives |
| `debug` | error/crash/traceback, "why does X fail" | Symptom (exact error text) · expected vs actual · repro steps · environment · what's been tried · ask for logs/stack trace if missing |
| `refactor` | clean up, simplify, dedupe, rename, without changing behavior | Scope (files/functions) · behavior-preservation constraint (explicit "no behavior change" unless stated otherwise) · target smell (duplication, naming, structure) · how to verify (existing tests must still pass) |
| `research` | compare, trade-offs, best practices, alternatives | Question framed as a decision · options to compare · evaluation criteria (cost, latency, complexity, team familiarity) · depth (quick take vs deep dive) · output format (table vs prose) |
| `data-sql` | SQL, query, warehouse, ETL, pipeline, dataframe | Source schema/tables · desired output shape · engine/dialect (ask if unstated) · performance constraints (partition pruning, row limits) · correctness constraints (dedup, null handling) |
| `architecture` | system design, scale, microservices, CAP, sharding | Requirements (functional + non-functional: scale, latency, consistency) · constraints (budget, team size, existing stack) · what to produce (diagram, doc, decision) · explicit trade-offs to weigh |
| `writing` | blog post, README, email, draft, proofread | Audience · tone/voice · length · format (markdown, plain text, slides) · key points that must appear · what NOT to include |
| `ops-cli` | k8s, terraform, docker, CI/CD, bash, deploy | Target environment (OS, cloud, versions) · current state vs desired state · idempotency requirement · rollback/safety constraints · what "done" looks like (a command that verifies it) |
| `ambiguous` | evidence too thin or split across intents | Do not rewrite. Ask ≤2 clarifying questions pulled from the top `runners_up` intents in the classifier output. |

## Confidence bands

- **high** (≥0.62) — rewrite directly, state intent+confidence in one line.
- **medium** (0.42–0.61) — rewrite, but name the runner-up intent so the
  user can redirect in one message if the classifier guessed wrong.
- **low** (<0.42) — `ask_clarifying` is true; stop and ask, don't guess.
