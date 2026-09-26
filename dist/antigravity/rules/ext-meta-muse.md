---
description: Wire Meta Muse image generation (generate, edit, iterate) into the coding agent through the pinned muse-image-mcp server and the Meta Model API. Use when the user asks for Meta Muse, Muse image generation, or wants AI-generated images/assets (hero art, textures, mockups) from Meta's model inside Claude Code, Cursor, or Claude Desktop.
trigger: model_decision
---

# External: Meta Muse

[Meta Muse](https://ai.meta.com/muse/) is Meta's personal AI agent.
Developers reach its image model through the Meta Model API
(`https://api.meta.ai/v1`, keys from <https://dev.meta.ai>). The only
agent integration that checks out is the community MCP server
[`kevintsai1202/muse-image-mcp`](https://github.com/kevintsai1202/muse-image-mcp)
(MIT, not affiliated with Meta), pinned here at npm `0.1.3` / commit
`efdff86a22a15be864c67c16acbf399c2e865dea`. Its source was reviewed at that pin: it talks
only to `api.meta.ai`, writes images to a local folder, runs no shell.

1. Check for existing `mcp__muse-image__*` tools. If present, use them.
2. If absent and the user wants it, they need a Meta Model API key. Have
   them put it in their shell environment as `MODEL_API_KEY`. Never ask
   them to paste it into chat, and never write it into a config file.
3. Register the server at user scope, pinned:
   ```
   claude mcp add muse-image --scope user -e 'MODEL_API_KEY=${MODEL_API_KEY}' -- npx -y muse-image-mcp@0.1.3
   ```
   Single quotes store the literal `${MODEL_API_KEY}`, which gets expanded
   when the server starts, so the key itself never lands in the config file. Cursor/Claude Desktop: same `command`/`args` in their
   MCP JSON with `"env": {"MODEL_API_KEY": "${MODEL_API_KEY}"}`.
4. Run `mcp-security-review` on the resulting config before first use.
   Expected: no findings for this server.
5. Tools: `generate_image`, `edit_image`, `iterate_image`. They return
   file paths, not base64. Put output in the project's asset folder and
   compress it (WebP/AVIF) before shipping. For frontend/3D use, hand the
   asset to `frontend-motion-3d`.
6. Bumping the pin: read the diff between the pinned commit and the new
   tag (network calls, `child_process`, file writes) before changing the
   version here.

Scope: images only. Muse's other abilities (browsing, purchases, app
Connectors) live in the Meta AI app and have no public API that has
been verified. Community connector catalog, reference only:
<https://github.com/Anil-matcha/awesome-muse-connectors>.

## Token economy

- Tools return file paths. Don't Read generated images back into context
  unless the user asks you to judge one.
- Iterate on one image with `iterate_image` rather than regenerating from
  a longer prompt.
- General read/search/output patterns live in the `token-saver` skill.
