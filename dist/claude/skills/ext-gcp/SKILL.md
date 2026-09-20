---
name: ext-gcp
description: Route Google Cloud Platform tasks to the pinned google/skills collection. Use when the user asks for GCP-specific help (Vertex AI, BigQuery, Cloud Run, IAM, etc.) and wants vendor-authored skill guidance rather than general knowledge.
allowed-tools: Bash, Read, Grep
version: 0.1.0
---

# External: gcp (google/skills)

Routes to `google/skills` (Apache-2.0), a collection — not a single skill.
Pinned in `external/skills.lock.json`.

1. If `external/gcp-skills/` doesn't exist yet:
   ```
   ./scripts/sync-external.sh gcp-skills
   ```
2. It nests many skills under `skills/` — find the one matching the task:
   ```
   ls external/gcp-skills/skills/
   grep -rl "<keyword>" external/gcp-skills/skills/*/SKILL.md
   ```
3. Read and follow the matching `SKILL.md`. If none fits, say so rather
   than forcing an unrelated one.
