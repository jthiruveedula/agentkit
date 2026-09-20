# Migration: restoring your agent environment on a new machine

Follow this end to end the first time you set up a new machine or user
account. Every step is idempotent — safe to re-run if interrupted.

## 1. Prerequisites

- `git`
- One of: POSIX shell (macOS/Linux), PowerShell (Windows), Node.js, or uv —
  pick whichever this machine already has, no need to install a new one
  just for this.
- Optional: `gh` CLI if you'll use `pr-review`/`daily-standup`.

## 2. Clone

```sh
git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit
```

Anywhere is fine; `~/agentkit` is just the convention `install.sh`
defaults its examples to. Set `AGENTKIT_HOME` if you keep it elsewhere.

## 3. Install

```sh
cd ~/agentkit
./install.sh                      # all four tools, symlinked
# or scope it:
./install.sh --tools=claude,cursor
# or, no symlink privilege (e.g. Windows without Developer Mode):
./install.sh --copy
```

This symlinks `dist/<tool>/...` into:

| Tool | Target |
|---|---|
| Claude Code | `~/.claude/skills/*`, `~/.claude/agents/*.md`, `~/.claude/CLAUDE.md` |
| Copilot | VS Code user prompts dir + `copilot-instructions.md` |
| Cursor | `~/.cursor/rules/*.mdc`, `~/AGENTS.md` |
| Antigravity | `~/.antigravity/rules/*.md`, `~/.antigravity/workflows/*.md` |

Any pre-existing file at those paths that this installer didn't create is
backed up to `<file>.bak.<timestamp>`, never overwritten silently.

## 4. Verify

```sh
ls -l ~/.claude/skills/prompt-enhancer   # should be a symlink into ~/agentkit/dist/claude/skills/
cat ~/.claude/CLAUDE.md | head -5        # should be the generated AGENTS.md contract
```

Open Claude Code / Cursor / your Copilot-enabled editor and confirm the
skills appear (e.g. `/prompt-enhancer` or asking to "enhance this prompt").

## 5. (Optional) External skill sources

If you use the pinned external skills (diagrams, UI/UX, cloud provider
skills), fetch them:

```sh
./scripts/sync-external.sh
```

## 6. Keeping it updated

```sh
cd ~/agentkit && git pull
```

That's it — every tool reads through the symlinks, so a `git pull` updates
Claude Code, Copilot, Cursor, and Antigravity simultaneously with no
re-install step. If you used `--copy` instead of symlinks (Windows without
Developer Mode), re-run `./install.ps1 -Copy` after each pull to refresh
the copies.

Or let the installer do the pull too:

```sh
./install.sh version    # shows installed vs. latest released tag
./install.sh upgrade    # git pull + re-link with your last-used --tools,
                         # prunes any symlink for a skill removed upstream
```

## 7. Removing it

```sh
./install.sh uninstall      # or: .\install.ps1 -Uninstall
```

Removes every file this installer created and restores any `.bak.*` files
it displaced during install.

## Troubleshooting

- **"dist/ not found"** — you cloned a shallow/partial checkout or ran the
  script from outside the repo. `cd` into the full clone.
- **Windows symlink errors** — enable Developer Mode (Settings → Update &
  Security → For developers) or run PowerShell as Administrator, or just
  pass `-Copy` and re-run after each `git pull`.
- **A tool doesn't pick up the skill** — restart that tool; most read their
  config directory once at startup.
