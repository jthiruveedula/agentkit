---
description: Search the pinned VoltAgent/awesome-agent-skills index to find an existing skill before building a new one from scratch. Use when the user wants a capability this repo doesn't have yet and asks to check what already exists before authoring it.
trigger: model_decision
---

# External: gap discovery

Routes to `VoltAgent/awesome-agent-skills` (MIT) — a curated index of
skill repos, not a skill itself. Pinned in `external/skills.lock.json`.

1. If `external/awesome-agent-skills/` doesn't exist yet:
   ```
   ./scripts/sync-external.sh awesome-agent-skills
   ```
2. Search its README/index for something matching the gap:
   ```
   grep -i "<keyword>" external/awesome-agent-skills/README.md
   ```
3. If a listed repo fits, verify it still exists (`gh api repos/<owner>/<repo>`)
   before recommending it, then either wire it in the same way as the
   other `ext-*` skills here, or hand the URL to the user.
4. If nothing fits, that's the signal to actually build one — see
   `skill-forge`.
