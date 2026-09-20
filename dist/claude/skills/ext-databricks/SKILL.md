---
name: ext-databricks
description: Route Databricks tasks to the pinned databricks/databricks-agent-skills collection. Use when the user asks for Databricks-specific help (notebooks, jobs, Unity Catalog, Delta Lake, etc.) and wants vendor-authored skill guidance.
allowed-tools: Bash, Read, Grep
version: 0.1.0
---

# External: databricks

Routes to `databricks/databricks-agent-skills` (license: NOASSERTION — no
explicit license file, treat as all-rights-reserved unless the user
confirms otherwise), a collection. Pinned in `external/skills.lock.json`.

1. If `external/databricks-agent-skills/` doesn't exist yet:
   ```
   ./scripts/sync-external.sh databricks-agent-skills
   ```
2. It nests many skills under `skills/` — find the one matching the task:
   ```
   ls external/databricks-agent-skills/skills/
   grep -rl "<keyword>" external/databricks-agent-skills/skills/*/SKILL.md
   ```
3. Read and follow the matching `SKILL.md`.

## Token economy

- Read notebook cells / job definitions via targeted workspace-get paths, never whole workspace exports.
- Prefer Unity Catalog system tables for metadata instead of listing objects.
- `grep` the pinned collection for the matching skill before reading any full SKILL.md.
- General read/search/output patterns live in the `token-saver` skill — don't duplicate them here.
