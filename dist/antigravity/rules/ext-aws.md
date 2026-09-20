---
description: Route AWS tasks to the pinned aws-samples/sample-agent-skills and zxkane/aws-skills collections. Use when the user asks for AWS-specific help (Lambda, S3, IAM, CDK, etc.) and wants vendor- or community-authored skill guidance.
trigger: model_decision
---

# External: aws

Two pinned AWS sources in `external/skills.lock.json`, both collections:

| Source | Repo | License | Layout |
|---|---|---|---|
| `aws-sample-skills` | aws-samples/sample-agent-skills | MIT-0 | flat: `office-excel/`, `pdf-to-markdown/`, etc. at root |
| `aws-skills` | zxkane/aws-skills | MIT | under `plugins/` (Claude Code plugin layout) |

1. Sync whichever (or both) the task needs:
   ```
   ./scripts/sync-external.sh aws-sample-skills aws-skills
   ```
2. Find the matching skill:
   ```
   ls external/aws-sample-skills/ external/aws-skills/plugins/
   grep -rl "<keyword>" external/aws-sample-skills external/aws-skills/plugins
   ```
3. Read and follow the matching skill's own docs. Prefer
   `aws-sample-skills` (official AWS samples, MIT-0 — no attribution
   required) when both cover the same ground.

## Token economy

- Filter server-side: `aws ... --query` with `--output text|table` so the CLI returns fields, not full JSON documents.
- Confirm the task is really AWS — route through `data-eng-router` before syncing or loading the vendor collection.
- `grep` the pinned collections for the right skill before reading any full SKILL.md.
- General read/search/output patterns live in the `token-saver` skill — don't duplicate them here.
