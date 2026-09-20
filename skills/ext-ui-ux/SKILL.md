---
name: ext-ui-ux
description: Route UI/UX design requests to the pinned nextlevelbuilder/ui-ux-pro-max-skill skill. Use when the user wants UI/UX design work and specifically asks for the external ui-ux-pro-max toolkit rather than this repo's own design approach.
version: 0.1.0
allowed-tools: Bash, Read
---

# External: ui-ux-pro-max

Routes to `nextlevelbuilder/ui-ux-pro-max-skill` (MIT), pinned in
`external/skills.lock.json`.

1. If `external/ui-ux-pro-max/` doesn't exist yet:
   ```
   ./scripts/sync-external.sh ui-ux-pro-max
   ```
2. It ships its own CLI and asset pipeline (`cli/`, `scripts/`) plus a
   `skill.json` manifest at its root — read `external/ui-ux-pro-max/skill.json`
   and `external/ui-ux-pro-max/.claude/` first to see how it expects to be
   invoked, then follow its own instructions.
3. For greenfield pages/redesigns with no explicit ask for this specific
   toolkit, prefer this repo's own `hallmark`-routed design work instead —
   this skill exists for when the user names ui-ux-pro-max by name.
