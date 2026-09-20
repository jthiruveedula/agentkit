# Contributing

1. New skill: `python3 skills/skill-forge/scripts/scaffold.py <name> "<description. Use when X.>"`.
   Existing skill: edit `skills/<name>/SKILL.md` directly. Never hand-edit
   anything under `dist/` — it's generated and CI rejects drift.
2. Keep `SKILL.md` under 500 lines; push depth into `reference/`, `recipes/`,
   or `scripts/`, loaded on demand. Deterministic logic goes in a script,
   not prose (see `skills/prompt-enhancer/scripts/classify.py` for the
   pattern).
3. `make build && make test` before opening a PR. `make test` runs
   `validate.py` (frontmatter schema, unique names, description length,
   broken links, secret scan), the `build.py --check` drift gate, the
   prompt-enhancer golden intent cases, and the pytest suite.
4. Commit messages: [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
5. No secrets, no absolute machine-specific paths, no new runtime dependency
   for something a few lines of stdlib already does.

## Branching & lifecycle

GitHub Flow: short-lived branches off `main`, one PR per change,
squash-merge back into `main`. No long-lived feature branches.

### Branch naming

`<type>/<scope>-<description>` — all lowercase, hyphens between words:

| Prefix | Use for | Example |
|---|---|---|
| `feature/` (or `feat/`) | new skills, tooling, site work | `feature/memory-substrate` |
| `fix/` | bug fixes | `fix/copilot-asset-paths` |
| `hotfix/` | urgent `main`-branch fixes | `hotfix/install-ps1-admin-check` |
| `chore/` | maintenance, dependencies, CI | `chore/bump-ruff-0-17` |
| `docs/` | docs-only changes | `docs/readme-refresh` |
| `release/` | manual release branches (rare — release-please owns this) | `release/0.2.0` |

CI lints the head branch name on every PR (`branch name` check). Bot
branches are exempt: `release-please--*` and `dependabot/*`.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`, `refactor:`, …) —
CI lints every PR commit (`commitlint` check). `feat:` and `fix:` drive
release-please version bumps; the rest don't cut a release on their own.

### Lifecycle

1. Branch from `main` using the naming standard above.
2. Open a PR — the [template checklist](.github/pull_request_template.md)
   applies: linked issue, tests, `make` targets, docs.
3. Automated checks must pass: the `test` OS × Python matrix, `lint`
   (ruff, shellcheck, PowerShell syntax, lychee link check),
   `validate.py`, the `build.py --check` drift gate, pytest + coverage,
   prompt-enhancer golden cases, smoke installs, CodeQL, gitleaks,
   `npm audit`, `packaging` (real npm tarball + Python wheel),
   `commitlint`, `branch name`.
4. Review, then squash-merge into `main`.
5. release-please opens a release PR (version bump + CHANGELOG); merging
   it tags the release.
6. `publish.yml` publishes `@jthiruveedula/agentkit` to GitHub Packages
   on the release; `site/` deploys to GitHub Pages on push to `main`.

`main` is branch-protected (applied via `gh api`): 1 approving review,
dismiss stale reviews on new pushes, no force-pushes, no direct pushes.
Only the single `CI success` aggregator check is required — it fans in
every check listed above, so adding a new job means extending its
`needs` list, not touching repo settings.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please).
Write [Conventional Commits](https://www.conventionalcommits.org/) on `main`
(`feat:`, `fix:`, `docs:`, `test:`, `chore:`, … — e.g. `feat: add Azure routing`)
and release-please opens a release PR that bumps the version and updates the
changelog. Merging it tags the release and publishes to GitHub Packages.
`feat:` and `fix:` drive the version bump; `chore:`, `docs:`, `test:`, and
`refactor:` do not cut a release on their own.
