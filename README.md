# agentkit

Your permanent, plug-and-play agent foundation. One command restores your
full skills/agents/commands environment on any new machine — global scope,
works identically across Claude Code, GitHub Copilot, Cursor, and
Antigravity.

MIT licensed. No telemetry, no external calls beyond what you explicitly
run (`sync-external.sh`, `gh`).

## Quickstart

Pick whichever channel already exists on the target machine — none require
a build step, all delegate to the same `install.sh`.

```sh
# POSIX (macOS/Linux) — clone once, symlink everywhere
git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit
cd ~/agentkit && ./install.sh

# Windows
git clone https://github.com/jthiruveedula/agentkit.git $HOME\agentkit
cd $HOME\agentkit; .\install.ps1

# Node available, no local clone yet
npx github:jthiruveedula/agentkit

# uv available, no local clone yet
uvx --from git+https://github.com/jthiruveedula/agentkit agentkit

# make (local dev / repeated use)
make install
```

Re-running install is always safe: already-linked files are skipped, and
any file it didn't create is backed up (`<file>.bak.<timestamp>`) rather
than overwritten. `git pull` in the clone updates everything downstream
instantly, since Claude Code/Cursor/Antigravity read through the symlinks.

## Install matrix

| Target tool | Linked into | Flag |
|---|---|---|
| Claude Code | `~/.claude/{skills,agents}`, `~/.claude/CLAUDE.md` | `--tools=claude` |
| GitHub Copilot | VS Code user prompts dir, `copilot-instructions.md` | `--tools=copilot` |
| Cursor | `~/.cursor/rules/`, `~/AGENTS.md` | `--tools=cursor` |
| Antigravity | `~/.antigravity/{rules,workflows}` | `--tools=antigravity` |

Combine with commas: `./install.sh --tools=claude,cursor`. Add `--copy` on
a machine without symlink privileges (e.g. Windows without Developer Mode).
`./install.sh uninstall` removes everything it created and restores any
backups.

## Upgrading

```sh
./install.sh version    # installed vs. latest released tag
./install.sh upgrade    # git pull + re-link, reusing your last --tools
```
`upgrade` also prunes any symlink whose source skill was removed upstream —
no manual cleanup after a release drops something. Both have `install.ps1`
equivalents: `.\install.ps1 -Version`, `.\install.ps1 -Upgrade`.

## Landing page

A small interactive install page lives in [`site/`](site/) — a 3D orbit
diagram (Three.js) of the four tools around the shared config, the install
steps, and the skill catalog, all generated the same way as this README.
Deployed via GitHub Pages on push to `main` (`.github/workflows/pages.yml`,
gated on the build job). Real tool marks (Claude Code, GitHub Copilot,
Cursor via Simple Icons MIT; Antigravity's own site mark) are stitched into
one `site/assets/logo-sprite.svg` — no unmodified library art, no stock
placeholders.

## Skill catalog

See the generated [`AGENTS.md`](AGENTS.md) for the live table — it's
rebuilt from `skills/*/SKILL.md` on every `make build`, never hand-edited.

| Skill | What it does |
|---|---|
| `prompt-enhancer` | Classifies prompt intent (9 categories) and rewrites it using that intent's pattern. Flagship skill — see below. |
| `skill-forge` | Scaffolds a new compliant skill (SKILL.md + reference/scripts/tests) from a one-line description. |
| `daily-standup` | Summarizes commits/PRs/issues since last standup into a 3-line update. |
| `pr-review` | Reviews a PR for correctness bugs and scope creep. |
| `debug-loop` | Hypothesize-test-narrow loop to root-cause a failing test or crash. |
| `spec-writer` | Turns a rough idea into a short spec: problem, scope, non-goals, acceptance criteria. |
| `meeting-to-actions` | Extracts action items with owners/dates from meeting notes. |

Five subagents (`agents/`) with narrow charters and explicit handoff
contracts: `researcher`, `implementer`, `reviewer`, `test-writer`,
`doc-writer`.

### prompt-enhancer

Classifies a raw prompt into one of: code-gen, debug, refactor, research,
data-sql, architecture, writing, ops-cli, or ambiguous — using a
deterministic scorer (`skills/prompt-enhancer/scripts/classify.py`), not a
prose guess. States intent + confidence, asks at most 2 clarifying
questions only when confidence is low, lists any assumptions it made, and
outputs the rewrite in its own copyable block. See
`skills/prompt-enhancer/reference/routing-table.md` for the per-intent
rewrite pattern and `reference/examples.md` for 6 worked before/afters.

## Architecture: author once, generate four

Every skill is authored exactly once as `skills/<name>/SKILL.md`
(frontmatter: `name`, `description`, `version`, optional `allowed-tools`/
`model`). `scripts/build.py` reads that single source of truth and emits
the four tool-specific adapters into `dist/`:

```
skills/prompt-enhancer/SKILL.md  ──build.py──┬─▶ dist/claude/skills/prompt-enhancer/SKILL.md
                                              ├─▶ dist/copilot/instructions/prompt-enhancer.instructions.md
                                              ├─▶ dist/cursor/rules/prompt-enhancer.mdc
                                              └─▶ dist/antigravity/rules/prompt-enhancer.md
```

`AGENTS.md` at the repo root is generated the same way — the shared
cross-tool contract, with Cursor's `AGENTS.md` and each tool's own doc
symlinked to it rather than copied. `dist/` is committed so install never
needs Python on the target machine; CI's `build.py --check` fails the
build if `dist/` ever drifts from its source (i.e. someone hand-edited a
generated file).

Never hand-edit anything under `dist/` — edit the `SKILL.md`/`agents/*.md`
source and run `make build`.

## Plugin marketplace

```
/plugin marketplace add jthiruveedula/agentkit
```
reads `.claude-plugin/marketplace.json` and installs the `agentkit` plugin
directly into Claude Code.

## External skills

`external/skills.lock.json` pins outside skill sources by commit SHA and
license (diagrams, UI/UX, codebase reads, cloud provider skills, system
design references — see the file for the full list and attribution). They
are **not** vendored into this repo's git history; `scripts/sync-external.sh`
fetches them on demand into the gitignored `external/<name>/`. One source
(`awesome-system-design-resources`) is GPL-3.0 and kept reference-only —
read for guidance, never copied verbatim into a skill body.

```sh
./scripts/sync-external.sh              # fetch all pinned sources
./scripts/sync-external.sh diagram-design codegraph   # fetch specific ones
```

## Build → test → contribute

```sh
make build      # regenerate dist/ + AGENTS.md from skills/ and agents/
make validate   # frontmatter schema, unique names, description length, links, secrets
make test       # validate + drift check + golden intent tests + pytest
make smoke      # full install/uninstall cycle in a throwaway $HOME
make ci         # everything CI runs
```

New skill: `python3 skills/skill-forge/scripts/scaffold.py <name> "<description. Use when X.>"`,
fill in the body (keep `SKILL.md` under 500 lines, push depth into
`reference/`/`scripts/`/`tests/`), then `make build && make test`.

See [`MIGRATION.md`](MIGRATION.md) for restoring this environment on a
fresh machine step by step.
