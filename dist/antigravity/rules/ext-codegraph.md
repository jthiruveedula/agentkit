---
description: Bootstrap the pinned colbymchenry/codegraph CLI for fast codebase reads (symbol search, call paths, blast radius) instead of raw grep. Use when the user asks to understand, navigate, or answer questions about a codebase and CodeGraph isn't already installed/available.
trigger: model_decision
---

# External: codegraph

`colbymchenry/codegraph` (MIT) is a real CLI/MCP tool, not a SKILL.md —
pinned in `external/skills.lock.json`.

1. Check whether it's already available: `command -v codegraph` or an
   `mcp__codegraph__*` tool in your toolset. If so, use it directly — see
   any global CodeGraph routing rule already in play before reaching here.
2. If unavailable and the user wants it:
   ```
   ./scripts/sync-external.sh codegraph
   external/codegraph/install.sh   # or install.ps1 on Windows
   ```
3. Once installed, index a project with `codegraph init` (the user's call,
   not run automatically), then query with `codegraph explore "<question>"`.
4. Without CodeGraph, fall back to Read/Grep/Glob as normal — this skill
   only exists to make bootstrapping it a one-liner, not a hard dependency.
