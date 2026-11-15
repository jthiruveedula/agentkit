# Creative setup wiring — 2026-11-15

Checked from disk (`ls`, `claude mcp get`) on 2026-11-15, while re-rendering the release video.

| Item | Expected location | Status | Evidence |
|---|---|---|---|
| LottieFiles `motion-design` skill | repo `.claude/skills/motion-design` | **Not found** | repo has no `.claude/skills/` directory (main checkout or worktree); `git ls-files .claude` is empty |
| Remotion `remotion-dev` skills | repo `.claude/skills/remotion-*` | **Not found** | same: no repo `.claude/skills/` |
| LottieFiles `motion-design` skill | global `~/.claude/skills/motion-design/SKILL.md` | Found (global, not repo) | installed 2026-11-15 08:25 |
| Remotion skills (`remotion-best-practices` + 12 `remotion-*`) | global `~/.claude/skills/remotion-*` | Found (global, not repo) | `remotion-best-practices` frontmatter `version: 4.0.543` |
| Motion AI Kit skill | global `~/.claude/skills/motion/SKILL.md` | **Found** | subdirs `best-practices`, `css-spring`, `performance-audit`, `transition-preview`, `codex` |
| Motion MCP for Claude Code | user scope `~/.claude.json` `mcpServers.motion` | **Found** | `claude mcp get motion`: user config, http `https://mcp.motion.dev`, Connected |
| Motion+ MCP | user scope `mcpServers.motion-plus` | Found, needs auth | http `https://mcp.motion.dev/plus`; requires `/mcp` OAuth before use |

To make the motion-design and Remotion skills repo-scoped, copy or symlink them into `.claude/skills/` and commit; today they only work on this machine.
