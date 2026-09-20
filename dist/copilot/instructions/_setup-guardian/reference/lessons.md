# Lessons Registry

Repeat-mistake classes for this repo. Each lesson pairs a root-cause
write-up with a `doctor.py` check that would have caught the recurrence.
The registry is the memory; the doctor is the enforcement.

## LESSON-001 — ci-aggregator compares whole needs objects

- **Date:** 2026-09-20
- **Symptom:** The CI "success" gate job reported wrong results — jobs
  that had failed were not counted as failures.
- **Root cause:** The aggregator compared whole `needs` entries to
  `"success"` / `"skipped"` (e.g. `v not in ("success", "skipped")`).
  But `needs.*` entries are objects `{result, outputs}`, not bare
  strings, so the comparison never matched a failing job.
- **Rule:** Always read job outcomes via `v.get("result")`; never
  compare the whole `needs` entry.
- **Guarded by:** `ci_aggregator` — fails when a bare comparison like
  `v == "success"` or `v not in ("success", ...)` appears without
  `.get("result")`.

Correct pattern:

```python
failed = {k: v.get("result") for k, v in needs.items()
          if v.get("result") not in ("success", "skipped")}
```

## LESSON-002 — typo'd action SHA pin broke the packaging job

- **Date:** 2026-09-20
- **Symptom:** The packaging job failed at "Set up job" —
  `actions/setup-node` resolved to a commit that does not exist.
- **Root cause:** The pinned SHA was mistyped:
  `249970729cb0ef3589644e2896644e5dc5ba9c38` (note `…6644e5…`) instead
  of the real `249970729cb0ef3589644e2896645e5dc5ba9c38`
  (`…6645e5…`). A 40-char hex string that is simply the wrong commit.
- **Rule:** Verify every new SHA pin resolves before push:
  `git ls-remote https://github.com/<owner>/<repo>` must list the
  pinned commit. Add any caught bad SHAs to `KNOWN_BAD_SHAS` in
  `doctor.py` so the typo can never return.
- **Guarded by:** `pinned_shas` — fails on known-bad SHAs and on
  malformed (truncated/typo-shaped) SHAs; warns on unpinned tags.

## LESSON-003 — bare subprocess env= drops Windows inherited vars

- **Date:** 2026-09-20
- **Symptom:** A test failed on Windows with a
  `y_HashRandomization_Init` error — the child Python process could not
  even start.
- **Root cause:** The subprocess call passed a bare `env={...}` dict
  literal, replacing the entire environment and dropping inherited
  Windows variables like `SystemRoot` that the Python runtime needs at
  startup.
- **Rule:** Always build child environments from the parent's:
  `env = dict(os.environ, MY_VAR="x")`. Never pass a bare dict.
- **Guarded by:** `subprocess_env` — fails on `env={...}` literals
  without `os.environ`; warns on other `env=` usage without it.

## LESSON-004 — hand-written skill count drifted

- **Date:** 2026-09-20
- **Symptom:** The README said "23 skills" while the catalog had 24 —
  a new skill was added without updating the count.
- **Root cause:** The count was hard-coded prose instead of a
  generated artifact. Any manual number rots the moment someone forgets
  to update it.
- **Rule:** Never hand-write skill counts. The README count line,
  `site/assets/skills.json`, and the AGENTS.md catalog table are all
  regenerated from `skills/` (`make build` or `doctor.py --fix`).
- **Guarded by:** `skill_count` — fails when README, skills.json, or
  the AGENTS.md table disagree with the number of `skills/*/SKILL.md`
  directories.

## How to add a lesson

1. Pick the next ID (`LESSON-005`, …) and copy the field template
   above: ID, date, symptom, root cause, rule, guarded-by.
2. Add or extend a `doctor.py` check that would have caught this
   exact recurrence — a lesson without a check is just a hope.
3. If the mistake has a fingerprint (a bad SHA, a bad pattern), record
   it in `doctor.py` (`KNOWN_BAD_SHAS`, a regex, etc.) so the check is
   data-driven, not a one-off.
4. Reference the lesson ID in the check's failure remediation, so the
   report teaches as well as flags.
