---
description: Bootstrap the pinned jfrog/boost CLI for token/CLI operations tooling. Use when the user asks about jfrog Boost specifically, or wants token-usage/CLI-ops tooling this repo doesn't already provide.
trigger: model_decision
---

# External: boost (token / CLI ops)

`jfrog/boost` is a real CLI tool (own `install.sh`/`install.ps1`), not a
SKILL.md — pinned in `external/skills.lock.json`. License: NOASSERTION
(no explicit license file) — read `external/boost/BETA_AGREEMENT.md` and
confirm the user is fine with its terms before installing.

1. If unavailable and the user wants it:
   ```
   ./scripts/sync-external.sh boost
   cat external/boost/AGENT-INSTALL.md   # read before running its installer
   ```
2. Follow `AGENT-INSTALL.md`'s own instructions from there — don't assume
   the same flags as agentkit's own `install.sh`, it's an unrelated tool.
