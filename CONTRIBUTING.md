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
