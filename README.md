# agentkit

[![CI](https://github.com/jthiruveedula/agentkit/actions/workflows/ci.yml/badge.svg)](https://github.com/jthiruveedula/agentkit/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/badge/CodeQL-enabled-8250df?logo=github)](https://github.com/jthiruveedula/agentkit/blob/main/.github/workflows/ci.yml)
[![release-please](https://img.shields.io/badge/release--please-automated-e57b00)](https://github.com/jthiruveedula/agentkit/releases)
[![Release](https://img.shields.io/github/v/release/jthiruveedula/agentkit)](https://github.com/jthiruveedula/agentkit/releases)
[![GitHub Packages](https://img.shields.io/badge/packages-github-24292f?logo=github)](https://github.com/jthiruveedula/agentkit#install-matrix)
[![Pages](https://github.com/jthiruveedula/agentkit/actions/workflows/pages.yml/badge.svg)](https://jthiruveedula.github.io/agentkit/)
[![License: MIT](https://img.shields.io/github/license/jthiruveedula/agentkit)](https://github.com/jthiruveedula/agentkit/blob/main/LICENSE)

**Your permanent, plug-and-play agent foundation.** Author each skill once —
`scripts/build.py` generates the Claude Code, GitHub Copilot, Cursor, and
Antigravity adapters — then one command restores your full
skills/agents/commands environment on any new machine. Deterministic
scripts do the repeatable work; the model does the judging.

MIT licensed. No telemetry, no external calls beyond what you explicitly
run (`sync-external.sh`, `gh`, `npm`).

## Quickstart

```sh
# macOS / Linux — clone once, symlink everywhere
git clone https://github.com/jthiruveedula/agentkit.git ~/agentkit
cd ~/agentkit && ./install.sh

# Windows
git clone https://github.com/jthiruveedula/agentkit.git $HOME\agentkit
cd $HOME\agentkit; .\install.ps1

# No clone: run straight from the repo (Node on PATH)
npx github:jthiruveedula/agentkit

# No clone: published package (one-time registry login, see below)
npm install -g @jthiruveedula/agentkit
agentkit

# No clone: Python console script
uvx --from git+https://github.com/jthiruveedula/agentkit agentkit
pipx install git+https://github.com/jthiruveedula/agentkit && agentkit
```

Add `--with-external` (`-WithExternal` on Windows) to also fetch every
pinned [external skill source](#external-skills) — one line sets up native
*and* external skills on a brand-new machine:

```sh
./install.sh --with-external
```

Re-running install is always safe: already-linked files are skipped, and
any file it didn't create is backed up (`<file>.bak.<timestamp>`) rather
than overwritten. `git pull` in the clone updates everything downstream
instantly, since Claude Code/Cursor/Antigravity read through the symlinks.

## Install matrix

| Method | Command | Needs on PATH |
|---|---|---|
| Clone + `install.sh` (macOS/Linux) | `git clone … && cd agentkit && ./install.sh` | git, sh |
| Clone + `install.ps1` (Windows) | `git clone …; .\install.ps1` | PowerShell |
| npx, straight from GitHub | `npx github:jthiruveedula/agentkit` | Node |
| GitHub Packages | `npm install -g @jthiruveedula/agentkit` | Node + one-time login |
| uvx | `uvx --from git+https://github.com/jthiruveedula/agentkit agentkit` | uv |
| pipx | `pipx install git+https://github.com/jthiruveedula/agentkit` | pipx |

One-time setup for the GitHub Packages path (a classic PAT with
`read:packages` is enough):

```sh
npm config set @jthiruveedula:registry https://npm.pkg.github.com
npm login --registry=https://npm.pkg.github.com --scope=@jthiruveedula
npm install -g @jthiruveedula/agentkit
agentkit --tools=claude,cursor   # same flags as install.sh
```

Every method converges on the same `install.sh` / `install.ps1` logic —
per-tool targets below:

| Target tool | Linked into | Flag |
|---|---|---|
| Claude Code | `~/.claude/{skills,agents}`, `~/.claude/CLAUDE.md` | `--tools=claude` |
| GitHub Copilot | VS Code user prompts dir, `copilot-instructions.md` | `--tools=copilot` |
| Cursor | `~/.cursor/rules/`, `~/AGENTS.md` | `--tools=cursor` |
| Antigravity | `~/.antigravity/{rules,workflows}` | `--tools=antigravity` |

Combine with commas: `./install.sh --tools=claude,cursor`. Add `--copy` on
a machine without symlink privileges (e.g. Windows without Developer Mode).
`./install.sh uninstall` removes everything it created and restores any
backups. `./install.sh version` / `./install.sh upgrade` (and
`.\install.ps1 -Version` / `-Upgrade`) compare against the latest release
and re-link after `git pull`, pruning symlinks whose source skill was
removed upstream.

## How it works: author once, run on four

Every skill is authored exactly once as `skills/<name>/SKILL.md`
(frontmatter: `name`, `description`, `version`, optional `allowed-tools` /
`model`). `scripts/build.py` reads that single source of truth and emits
the four tool-specific adapters into `dist/`, resolving each skill's
`scripts/` and `reference/` assets to real paths in every tool's layout:

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

Never hand-edit anything under `dist/` — edit the `SKILL.md` / `agents/*.md`
source and run `make build`.

## Skill catalog

28 skills. The live table is the generated [`AGENTS.md`](AGENTS.md) —
rebuilt from `skills/*/SKILL.md` on every `make build`, never hand-edited.

**Prompt & dev loop**

| Skill | What it does |
|---|---|
| `prompt-enhancer` | Flagship: classifies a rough prompt's intent (9 categories) with a deterministic scorer and rewrites it using that intent's pattern. |
| `skill-forge` | Scaffolds a new compliant skill — `SKILL.md` + `reference/`/`scripts/`/`tests/` — from a one-line description. |
| `debug-loop` | Hypothesize-test-narrow loop on a failing test or reproducible crash until root cause is found. |
| `pr-review` | Reviews a PR for correctness bugs and scope creep, posting inline findings. |
| `spec-writer` | Turns a rough idea into a short spec: problem, scope, non-goals, acceptance criteria. |
| `daily-standup` | Commits/PRs/issues since last standup → a 3-line did/doing/blocked update. |
| `meeting-to-actions` | Meeting notes or transcript → action items with owners and dates. |

**Data engineering**

| Skill | What it does |
|---|---|
| `data-architect` | Multi-cloud/open-source data platform decisions (storage/compute/orchestration/streaming), recorded as ADRs. |
| `data-eng-router` | Auto-detects GCP/AWS/Azure/Databricks from task vocabulary and routes to that platform's vendor skill. |
| `pipeline-scaffold` | Scaffolds a dbt model, Airflow DAG, Dagster asset, or PySpark job with medallion naming + test stub. |
| `data-quality-standards` | Schema/freshness/volume/idempotency/PII checks for a pipeline before it ships. |
| `memory-sync` | Mines recent sessions for recurring agent mistakes, ranks the repeats, writes durable fixes. |
| `doc-standards` | Applies a consistent professional house style to Word/Excel/PDF/PowerPoint output. |

**External routers** — 10 thin skills wiring in the pinned [external
sources](#external-skills) on demand: `ext-diagrams`, `ext-ui-ux`,
`ext-codegraph`, `ext-cli-ops`, `ext-gcp`, `ext-databricks`, `ext-aws`,
`ext-azure`, `ext-systems-design`, `ext-gap-discovery`. Each syncs its
source(s) via `scripts/sync-external.sh` on first use and defers to that
source's own `SKILL.md` — your AI tools reach for a real vendor-authored
GCP/AWS/Azure skill the same way they reach for `prompt-enhancer`.

### Subagents

Eight subagents (`agents/`) with narrow charters and explicit handoff
contracts: `researcher`, `implementer`, `reviewer`, `test-writer`,
`doc-writer`, `data-platform-architect`, `pipeline-engineer`,
`data-quality-engineer`. They ship for Claude Code and Antigravity;
Copilot and Cursor have no agent equivalent — a known gap, documented in
[`AGENTS.md`](AGENTS.md).

## Deterministic where it matters

Judgment calls go to the model; repeatable decisions live in scripts with
golden tests, so behavior is identical on all four tools:

- `skills/prompt-enhancer/scripts/classify.py` — intent classification,
  `--selftest` golden cases run in CI
- `skills/data-eng-router/scripts/classify.py` — cloud/platform detection
- `skills/memory-sync/scripts/rank_patterns.py` — ranks recurring session patterns
- `skills/data-architect/scripts/adr.py` — ADR scaffolding
- `skills/pipeline-scaffold/scripts/scaffold_pipeline.py` — pipeline scaffolding
- `skills/skill-forge/scripts/scaffold.py` — new-skill scaffolding

## Landing page

The interactive install page is live at
**[jthiruveedula.github.io/agentkit](https://jthiruveedula.github.io/agentkit/)**
— 3D orbit hero, per-OS install tabs, and a searchable skill catalog
generated from the real `skills/*/SKILL.md` frontmatter
(`site/scripts/build-catalog.py` → `site/assets/skills.json`). The page
itself is hand-built; only the catalog data and the tool-mark sprite
(`site/assets/logo-sprite.svg`, via `site/scripts/build-logo-sprite.py`)
are generated. Deploys via GitHub Pages on push to `main`
(`.github/workflows/pages.yml`).

## Plugin marketplace

```
/plugin marketplace add jthiruveedula/agentkit
```

reads [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
and installs the `agentkit` plugin directly into Claude Code.

## External skills

[`external/skills.lock.json`](external/skills.lock.json) pins 13 outside
skill sources by commit SHA and license (diagrams, UI/UX, codebase reads,
cloud provider skills, system design references, gap discovery — see the
file for the full list and attribution; the lock file is schema-validated
in CI). They are **not** vendored into this repo's git history;
`scripts/sync-external.sh` fetches them on demand into the gitignored
`external/<name>/`, verifying each tarball's SHA-256 before extraction.
One source (`systems-design-resources`) is GPL-3.0 and kept reference-only
— read for guidance, never copied verbatim into a skill body.

```sh
./scripts/sync-external.sh                             # fetch all pinned sources
./scripts/sync-external.sh diagram-design codegraph    # fetch specific ones
./install.sh --with-external                           # install + fetch all, one command
```

### CLI token savings

`ext-cli-ops` wires [jfrog/boost](https://boost.jfrog.com) into your
coding agent — it compresses noisy shell output (test/build/lint/log
dumps) so a session spends tokens on signal, not scrollback, while
keeping errors and diffs intact. **Not on by default** — it's preview
software: installing it accepts JFrog's Online Preview Agreement and
sends them command metadata (timing, exit codes, token savings — never
raw output or file contents).

```sh
./install.sh --tools=claude --with-boost   # installs boost, wires it into claude
# or ask the ext-cli-ops skill to do it, which discloses the same terms first
```

Once wired: `DISABLE_BOOST=1 <command>` gets exact unfiltered output on
any one command; `boost init --claude --uninstall` rolls it back.

## Security

- **CodeQL** (Python + JavaScript) on every push and PR
- **gitleaks** secret scan over full history, plus `validate.py`
  secret-scans every skill source, script, and reference file
- **`npm audit`** (high+) on every PR; Dependabot for GitHub Actions,
  npm, and pip
- All actions pinned to commit SHAs; workflows run with least-privilege
  permissions

## Pipeline

Every PR runs the full matrix (3 OS × 4 Python versions), lint (ruff,
shellcheck, PowerShell syntax, link check), secret scanning, CodeQL,
`npm audit`, and packed-artifact tests (real npm tarball + Python wheel).
[CONTRIBUTING.md](CONTRIBUTING.md#branching--lifecycle) documents the
lifecycle: branch → PR → checks → squash-merge → release-please cuts the
release → `publish.yml` ships `@jthiruveedula/agentkit` to GitHub
Packages. A nightly run catches external drift (lock pins, downloads).

## Build → test → contribute

```sh
make build      # regenerate dist/ + AGENTS.md from skills/ and agents/
make validate   # frontmatter schema, unique names, description length, links, secrets
make test       # validate + drift check + golden intent tests + pytest
make smoke      # full install/uninstall cycle in a throwaway $HOME
make ci         # everything CI runs
make lint       # ruff + shellcheck
```

New skill: `python3 skills/skill-forge/scripts/scaffold.py <name> "<description. Use when X.>"`,
fill in the body (keep `SKILL.md` under 500 lines, push depth into
`reference/`/`scripts/`/`tests/`), then `make build && make test`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branching standard,
commit conventions, and the full PR-to-release lifecycle, and
[`MIGRATION.md`](MIGRATION.md) for restoring this environment on a fresh
machine step by step.
