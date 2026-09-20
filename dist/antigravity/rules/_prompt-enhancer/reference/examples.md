# Before / after examples

Six worked pairs, one per major intent family. Each shows the classifier
call, its output, and the resulting rewrite.

---

## 1. code-gen

**Raw:** "write me a function to batch rename files"

```
$ python3 scripts/classify.py "write me a function to batch rename files"
{"intent": "code-gen", "confidence": 0.83, "band": "high", ...}
```

**Enhanced:**
```
Write a CLI function that batch-renames files in a directory by regex
pattern substitution.

- Input: source directory, a regex pattern, a replacement template
- Output: renames matching files in place, prints a before/after table,
  supports --dry-run
- Language: Python 3, stdlib only (argparse, re, pathlib)
- Acceptance: running with --dry-run makes no filesystem changes; a
  real run renames every match and leaves non-matches untouched
```
Assumptions: Python 3, stdlib-only, CLI (not a library function) — the
original prompt didn't specify, ask if any of these are wrong.

---

## 2. debug

**Raw:** "why does my login endpoint 500 on refresh"

```
{"intent": "debug", "confidence": 0.81, "band": "high", ...}
```

**Enhanced:**
```
Debug: the /login refresh endpoint returns HTTP 500.

- Expected: 200 with a refreshed token
- Actual: 500, [paste exact error/stack trace]
- Repro: [steps that trigger it — logged-in state? expired token? concurrent
  request?]
- Environment: [framework/version, auth library]
- Already tried: [list, if any]

Please share the stack trace and the relevant handler code so the failing
line can be pinned down before proposing a fix.
```
Assumptions: none baked in — this intent needs the missing repro details
from the user, so the rewrite asks for them explicitly instead of guessing.

---

## 3. refactor

**Raw:** "clean up this auth module, it's a mess"

```
{"intent": "refactor", "confidence": 0.71, "band": "high", ...}
```

**Enhanced:**
```
Refactor the auth module for readability without changing behavior.

- Scope: [file/module path]
- Target smells: [duplication / long functions / unclear naming — name
  which ones you're seeing]
- Constraint: no behavior change — existing tests must still pass
  unmodified
- Verify: run the test suite before and after, diff the results
```
Assumption: "clean up" = readability/structure refactor, not a behavior or
API change — flagged since the original prompt didn't say either way.

---

## 4. research

**Raw:** "postgres vs mongo for this, what should I use"

```
{"intent": "research", "confidence": 0.74, "band": "high", ...}
```

**Enhanced:**
```
Compare PostgreSQL vs MongoDB for [describe the workload: read/write
ratio, data shape, scale].

Evaluate on: schema flexibility needs, query complexity, consistency
requirements, operational familiarity, hosting cost.

Output: a short recommendation with the top 2-3 deciding factors, not an
exhaustive feature comparison.
```
Assumptions: workload details are missing — the rewrite leaves them as an
explicit fill-in rather than inventing a workload.

---

## 5. data-sql

**Raw:** "query to dedupe rows in this table by user_id, keep latest"

```
{"intent": "data-sql", "confidence": 0.68, "band": "high", ...}
```

**Enhanced:**
```
Write a SQL query that deduplicates rows in [table] by user_id, keeping
only the most recent row per user_id.

- Dialect: [ask if unstated — Postgres/BigQuery/Snowflake syntax differs
  for the window function used]
- "Most recent" defined by: [which column — updated_at? created_at?]
- Output: either a SELECT that returns the deduped rows, or a
  DELETE/MERGE that removes the duplicates in place — specify which
```
Assumptions: none — dialect and the recency column are left as explicit
questions since getting either wrong silently produces the wrong rows.

---

## 6. ops-cli

**Raw:** "set up a github actions pipeline to build and deploy on push to main"

```
{"intent": "ops-cli", "confidence": 0.79, "band": "high", ...}
```

**Enhanced:**
```
Create a GitHub Actions workflow that builds and deploys on push to main.

- Build: [language/build tool — npm build? docker build?]
- Deploy target: [where — Pages, a container registry, a cloud provider]
- Gating: deploy job must depend on the build/test job succeeding
  (needs: [build]), never run independently of build status
- Rollback: [what happens on a failed deploy]

Acceptance: a failing build blocks deploy; a passing build deploys
automatically with no manual step.
```
Assumption: deploy gated on build success is treated as a hard requirement
even though the raw prompt didn't say it — flag this as a default, not a
silent addition, since it's a common gap worth calling out.
