---
description: Route Azure tasks to the pinned microsoft/azure-skills and MicrosoftDocs/Agent-Skills collections. Use when the user asks for Azure-specific help (App Service, Functions, AKS, Entra ID, etc.) and wants Microsoft-authored skill guidance.
applyTo: **
---

# External: azure

Two pinned Azure sources in `external/skills.lock.json`, both collections
nesting skills under `skills/`:

| Source | Repo | License |
|---|---|---|
| `azure-skills` | microsoft/azure-skills | MIT |
| `agent-skills-ms` | MicrosoftDocs/Agent-Skills | CC-BY-4.0 (attribution required if content is reused, not just read) |

1. Sync whichever (or both) the task needs:
   ```
   ./scripts/sync-external.sh azure-skills agent-skills-ms
   ```
2. Find the matching skill:
   ```
   ls external/azure-skills/skills/ external/agent-skills-ms/skills/
   grep -rl "<keyword>" external/azure-skills/skills external/agent-skills-ms/skills
   ```
3. Read and follow the matching `SKILL.md`. If content from
   `agent-skills-ms` (CC-BY-4.0) is copied rather than just read for
   guidance, keep the attribution the license requires.

## Token economy

- Project fields: `az ... --query` JMESPath with `-o tsv|table`; never ingest full JSON payloads.
- Scope every list call (`--resource-group`, `--subscription`) — unscoped `az list` is the classic token blowup.
- `grep` the pinned collections for the matching skill before reading full SKILL.md files.
- General read/search/output patterns live in the `token-saver` skill — don't duplicate them here.
