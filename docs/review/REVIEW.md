# agentkit — Deep Review (2026-10-30)

Scope: everything under source control except generated `dist/`. Baseline at `065b4f1`: `make test` green (41 skills validate, `dist/` matches source, 174 tests pass in ~7s).

## Method

1. Four parallel auditors (security, agents/skills, code/perf, UI/UX) produced 50+ raw findings.
2. Each finding went to an independent skeptic told to **refute** it by reading the cited lines or reproducing in a scratch copy. Result: 18 confirmed, 25 real but overstated (severity cut), 1 refuted.
3. A completeness critic swept files the auditors skipped and found 10 more; the strongest were spot-checked by hand.

Severity is calibrated to what this repo is: a dev-tool kit installed on developer machines, plus CI and a static site. **Critical** = exploitable now with serious impact. **High** = real security/correctness risk or user-facing break. **Medium** = meaningful gap. **Low** = hygiene. WCAG 2.2 AA failures are rated Medium because AA is the stated bar.

## Headline

**No Critical or High issues survived verification.** The security posture is better than typical for this class of repo:

- CI actions are pinned by SHA, with least-privilege permissions, CodeQL, gitleaks, zizmor and dependency-review.
- The site has a strict CSP and no `innerHTML`.
- The SQLite memory store uses parameterized SQL, quoted FTS and 0600 file permissions.
- The boost installer is verified by sha256.

The real weaknesses:

- **Distribution drift.** The plugin listing is missing 6 skills, and versions are out of sync.
- **Over-broad skill permissions.** Most skills pre-approve all of Bash.
- **Evals that never run.**
- **Token cost on non-Claude tools.** Copilot instructions apply to every file.
- **A security scanner with a bypass.**
- **A batch of WCAG AA failures on the site.**

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 11 |
| Low | 29 |
| Refuted | 1 |

---

## Medium

### M1. Plugin listing missing 6 skills; versions out of sync
- **Evidence:**
  - [.claude-plugin/marketplace.json](../../.claude-plugin/marketplace.json) lists 35 of the 41 skills. Missing: `agentkit-audit`, `ext-hallmark`, `ext-rea`, `ext-security-audit`, `ext-seo`, `session-insights`.
  - Versions: [package.json](../../package.json) `0.16.0`, [pyproject.toml:3](../../pyproject.toml:3) `0.1.0`, marketplace `0.1.0`.
  - [.github/release-please-config.json](../../.github/release-please-config.json) is `release-type: node` with no `extra-files`.
- **Impact:** users installing via `/plugin` silently miss 6 skills, including the security-audit and SEO routers. The pip/uvx and plugin versions never move.
- **Fix:**
  - Generate the marketplace skill/agent lists in `scripts/build.py`, so `--check` catches drift.
  - Add release-please `extra-files` for `pyproject.toml` (toml, `$.project.version`) and `marketplace.json` (json, `$.plugins[0].version`).
  - Add a version-parity test.

### M2. Bare `Bash` in `allowed-tools` pre-approves every shell command
- **Evidence:** line 5 of about 30 SKILL.md files, e.g.
  - [skills/token-saver/SKILL.md:5](../../skills/token-saver/SKILL.md:5), [skills/memory/SKILL.md:5](../../skills/memory/SKILL.md:5), [skills/prompt-enhancer/SKILL.md:5](../../skills/prompt-enhancer/SKILL.md:5), [skills/context-compressor/SKILL.md:5](../../skills/context-compressor/SKILL.md:5), [skills/data-eng-router/SKILL.md:5](../../skills/data-eng-router/SKILL.md:5)
  - every `ext-*` router.
  - `pr-review` is the only scoped one, but [skills/pr-review/SKILL.md:5](../../skills/pr-review/SKILL.md:5) `Bash(gh pr review:*)` also permits `--approve` / `--request-changes`, which its body forbids.
- **Impact:** while a skill is active, any shell command, including one steered by prompt-injected content, runs without a permission prompt. This is the largest agent-security lever in the repo.
- **Fix:**
  - Scope each skill to the commands it actually runs, e.g. `Bash(python3 scripts/estimate.py:*)`.
  - Drop `gh pr review` from pre-approval.
  - Add a `validate.py` rule that flags bare `Bash` unless allow-listed with a reason.

### M3. `mcp-security-review` scanner: lookalike hosts pass as localhost
- **Evidence:** [skills/mcp-security-review/scripts/mcp_scan.py:182](../../skills/mcp-security-review/scripts/mcp_scan.py:182) `is_localhost = any(h in url for h in ("localhost", "127.0.0.1", "::1"))`, a substring match.
- **Impact:** `http://localhost.attacker.example/mcp` is classed as local, so the plain-http remote finding is suppressed. A security tool returning a false negative is worse than no tool.
- **Related gaps (critic-found, partly verified):**
  - `pkg==1.2.3` pins are flagged as unpinned.
  - Secrets in `url` and `headers` are not scanned.
  - Malformed JSON gives a traceback instead of a finding.
- **Fix:** compare `urlparse(url).hostname` exactly against `{localhost, 127.0.0.1, ::1}` or a `.localhost` suffix, and add a lookalike-host test. Fix the related gaps in the same PR.

### M4. Copilot emitter makes every skill apply to every file
- **Evidence:** [scripts/build.py:59](../../scripts/build.py:59) `fm = {"description": ..., "applyTo": "**"}`.
- **Impact:** all 41 skill bodies attach to every Copilot request. That is the opposite of the token-economy goal the repo sells, and it grows linearly with the catalog. Cursor (`alwaysApply: False`) and Antigravity (model-decision) are fine.
- **Fix:** emit `applyTo` from an optional `globs:` frontmatter field, and default to a short index instruction plus on-demand bodies. At minimum, document the cost.

### M5. `build.py --check` doesn't catch stray files in `dist/`
- **Evidence:** [scripts/build.py:192-204](../../scripts/build.py:192) returns `changed` before the prune block runs. Reproduced: adding `dist/claude/skills/STRAY.md` still gives "dist/ matches source", exit 0.
- **Impact:** CI's drift gate has a hole. A deleted or renamed skill can still ship to every install from a stale `dist/`.
- **Fix:** in check mode, also report files that are on disk but not in the expected set. The prune block already computes that set.

### M6. Skill evals never run, yet count as "tests" in the audit score
- **Evidence:**
  - [tests/test_evals.py](../../tests/test_evals.py) checks JSON shape only, and nothing in the Makefile or CI runs the evals against a model.
  - [skills/agentkit-audit/scripts/audit.py:536-541](../../skills/agentkit-audit/scripts/audit.py:536) gives the 30-point `srs.tests` credit for at least 3 eval scenarios.
  - 15 skills have no evals; all 79 existing scenarios have `files: []`.
- **Impact:** nothing detects routing or behaviour regressions, and the APS "tests" sub-score overstates rigour. (A verifier rated this Low because the credit is only 30 points of the SRS sub-score. It is kept Medium as the biggest *quality* gap.)
- **Fix:** short term, rename the criterion to "evals defined" and weight it below real tests. Strategic: a nightly eval runner (see ROADMAP S1).

### M7. Light-theme contrast fails AA on the audit page
- **Evidence:**
  - [site/audit/index.html:46](../../site/audit/index.html:46): `.chip b` uses `--reg #1D4ED8` on the 7% ink tint, giving 4.22:1 at 13px.
  - [site/audit/index.html:99](../../site/audit/index.html:99): the pressed `.fchip span` at `opacity:.7` gives about 3.1:1 in light and about 3.8:1 in dark.
- **Fix:** use a darker `--reg` for text (about `#1A44C2`) or `--ink`, and set `.fchip span` to `opacity:1`.

### M8. Audit graph: infinite animation with no pause; focusable `role=img` nodes with 5px targets
- **Evidence:**
  - [site/audit/audit.js:167-168](../../site/audit/audit.js:167): 53 nodes are `tabindex=0 role=img`, and skill nodes have `r=5`.
  - The tooltip is not linked by `aria-describedby`, and the edges have no text equivalent.
  - The "Pause previews" button only targets `.glyph i`, so the `.pulse` animation can't be paused (WCAG 2.2.2). It is already off under `prefers-reduced-motion`.
- **Fix:**
  - Add `body.paused .pulse{animation-play-state:paused}`.
  - Set `aria-describedby="tip"`.
  - Add a transparent `r=12` hit circle.
  - Add a visually hidden edge list.

### M9. Hover readout can't be dismissed with Esc (WCAG 1.4.13)
- **Evidence:** [site/app.js:222-232](../../site/app.js:222) has no `keydown` handler, and `#readout` is shown on hover and focus.
- **Fix:** `addEventListener('keydown', e => e.key === 'Escape' && hide())`.

### M10. Google Fonts load contradicts "ZERO TELEMETRY" and blocks render
- **Evidence:**
  - [site/index.html:14-16](../../site/index.html:14) loads a third-party render-blocking stylesheet, while the footer at [site/index.html:176](../../site/index.html:176) promises zero telemetry.
  - [site/site.css:34](../../site/site.css:34) `#tb b{font-weight:700}` uses a weight that isn't loaded, so it is synthesized.
- **Impact:** every visitor's IP and user-agent go to Google, and LCP waits on a cross-origin CSS round trip.
- **Fix:** self-host two woff2 files, preload the display face, tighten the CSP to `'self'`, and use weight 500.

### M11. 58 non-interactive tab stops on the audit page
- **Evidence:** [site/audit/audit.js:86](../../site/audit/audit.js:86) (5 KPI cards) and [site/audit/audit.js:200](../../site/audit/audit.js:200) (53 unit cards) set `tabIndex=0` with no action, and `aria-label` replaces their content. The per-unit scores are tabular data but aren't in a `<table>`.
- **Fix:** drop the tabindex and add a visually hidden `<table>` of unit scores.

---

## Low

### Security / supply chain
| ID | Finding | Evidence | Fix |
|---|---|---|---|
| L1 | `publish.yml` and `pages.yml` can be dispatched from any ref; `release.yml` dispatches them with `--ref main` instead of the release tag | [.github/workflows/publish.yml:11](../../.github/workflows/publish.yml:11), [.github/workflows/release.yml:56-58](../../.github/workflows/release.yml:56) | Job guard `if: github.ref == 'refs/heads/main' \|\| startsWith(github.ref,'refs/tags/v')`; dispatch with the tag |
| L2 | `install.sh uninstall` runs `rm -rf` on every manifest path without checking it lies under an install root (reproduced with a scratch manifest). `prune_stale` is already confined | [install.sh:313-331](../../install.sh:313) | Skip paths outside the known install bases |
| L3 | `install.ps1` ignores `CLAUDE_HOME`; `-like "$Dist*"` treats path characters as wildcards; `Remove-Item -Recurse` on links | [install.ps1:122](../../install.ps1:122), [install.ps1:234](../../install.ps1:234), [install.ps1:95](../../install.ps1:95) | Use `$env:CLAUDE_HOME`, `StartsWith`, and `$item.Delete()` for links |
| L4 | `settings.json` written in place (not atomic); inconsistent `.bak` policy; hook command built with `"%s"`, not `shlex.quote` | [skills/context-budget/scripts/install_hooks.py:25](../../skills/context-budget/scripts/install_hooks.py:25), [install_hooks.py:87-91](../../skills/context-budget/scripts/install_hooks.py:87), [skills/session-insights/scripts/nudge_hook.py:93](../../skills/session-insights/scripts/nudge_hook.py:93), [nudge_hook.py:119-123](../../skills/session-insights/scripts/nudge_hook.py:119) | Write tmp then `os.replace`; one backup policy; `shlex.quote` |
| L5 | `--draft-commands` and the snapshot example persist raw prompt text unredacted (the `--incidents` path *is* redacted downstream) | [skills/session-insights/scripts/insights.py:458](../../skills/session-insights/scripts/insights.py:458) plus the draft-commands writer | Reuse `redact()` from `rank_patterns.py`; dirs 0700, files 0600 |
| L6 | `AGENTKIT_HOME` means "repo clone" in install.sh but "data dir" in budget_hook and insights; resumed checkpoint is injected with no data-not-instructions marker | [skills/context-budget/scripts/budget_hook.py:36-39](../../skills/context-budget/scripts/budget_hook.py:36), [budget_hook.py:133](../../skills/context-budget/scripts/budget_hook.py:133), [install.sh:30](../../install.sh:30) | New `AGENTKIT_DATA_DIR`; prefix the injection with an untrusted-notes marker |
| L7 | `session_id` used in a file path unsanitized (source is the harness UUID, so low exploitability) | [skills/context-budget/scripts/budget_hook.py:75-76](../../skills/context-budget/scripts/budget_hook.py:75) | `re.sub(r"[^\w-]", "_", sid)` |
| L8 | Skills ingesting pasted or third-party text lack a data-not-instructions line: meeting-to-actions, daily-standup, debug-loop (session-insights optional) | the SKILL.md files | Add one line each |
| L9 | `curl` without `--proto '=https'` (single caller is sha256-verified, so hygiene only) | [install.sh:69](../../install.sh:69), [scripts/sync-external.sh:59](../../scripts/sync-external.sh:59) | Add `--proto '=https' --proto-redir '=https'` |
| L10 | Non-atomic `rm -rf` then `mv` replace of external checkouts; optional sha256 never populated (the commit SHA is the real pin) | [scripts/sync-external.sh:75-94](../../scripts/sync-external.sh:75) | Rename-swap; document that the commit SHA is the integrity pin |
| L11 | Release workflow permissions at workflow level (single job, so hygiene only) | [.github/workflows/release.yml:14-19](../../.github/workflows/release.yml:14) | Move to job level; top-level `contents: read` |
| L12 | `skill-forge` writes the user-supplied description raw into YAML frontmatter; a newline or `---` breaks parsing | [skills/skill-forge/scripts/scaffold.py:73-82](../../skills/skill-forge/scripts/scaffold.py:73) | Collapse newlines; quote via shared `dump()` |

### Agents & skills
| ID | Finding | Evidence | Fix |
|---|---|---|---|
| L13 | 11 of 12 agents name a skill in prose but don't preload it (`skills:` exists only on orchestrator); data-platform-architect cites a repo-relative `adr.py` path | [agents/orchestrator.md:6](../../agents/orchestrator.md:6), [agents/data-platform-architect.md:10-11](../../agents/data-platform-architect.md:10) | Add `skills: [...]` frontmatter |
| L14 | Uncapped "re-run until it passes" loops in about 14 skills, apparently added to satisfy the audit regex | e.g. [skills/genai-engineering/SKILL.md:45](../../skills/genai-engineering/SKILL.md:45), [skills/data-architect/SKILL.md:55](../../skills/data-architect/SKILL.md:55), [skills/meeting-to-actions/SKILL.md:19](../../skills/meeting-to-actions/SKILL.md:19) | Append "max 3 attempts, then report" |
| L15 | Agent definitions never validated (name/tools/model/referenced skills); read-only claims enforced only for `reviewer` | [scripts/validate.py](../../scripts/validate.py) | Add `check_agents()` |
| L16 | Orchestrator roster duplicated in 4 places with no drift test (all match today) | [agents/orchestrator.md:4](../../agents/orchestrator.md:4), [skills/orchestrate/scripts/plan_check.py:15-27](../../skills/orchestrate/scripts/plan_check.py:15), [skills/orchestrate/reference/roster.md](../../skills/orchestrate/reference/roster.md), [skills/orchestrate/SKILL.md:56-59](../../skills/orchestrate/SKILL.md:56) | One parity test |
| L17 | `reviewer` (Read, Grep) told to follow `pr-review` checks with no Bash and no stated diff hand-off; `pr-review` depends on unshipped `scope-creep-detector`/`cavecrew-reviewer`; description says "inline" but it posts PR-level comments | [agents/reviewer.md:4](../../agents/reviewer.md:4), [agents/reviewer.md:12](../../agents/reviewer.md:12), [skills/pr-review/SKILL.md:3](../../skills/pr-review/SKILL.md:3), [skills/pr-review/SKILL.md:18-22](../../skills/pr-review/SKILL.md:18) | State that the caller passes the diff; list prerequisites; fix wording |
| L18 | `researcher` told to follow smart-navigator, whose map step needs Bash it lacks | [agents/researcher.md:16](../../agents/researcher.md:16) | Reword to Glob/Grep mapping (keep it read-only) |
| L19 | `frontend-motion-3d` routes to skills that are neither shipped nor pinned (gsap-*, motion-dev, scroll-world, 3dviz-pro-max, hyperframes); SEO baseline restated in 3+ places | [skills/frontend-motion-3d/SKILL.md:16-25](../../skills/frontend-motion-3d/SKILL.md:16) | Mark as "if installed"; single SEO source in ext-seo |
| L20 | Missing cross-pointers: smart-navigator vs ext-codegraph; memory-sync never uses `insights.py --incidents` | [skills/smart-navigator/SKILL.md:14](../../skills/smart-navigator/SKILL.md:14), [skills/memory-sync/SKILL.md:16-25](../../skills/memory-sync/SKILL.md:16) | One line each |
| L21 | Script paths relative to the repo root don't resolve once installed (repo-wide convention issue) | [skills/debug-loop/SKILL.md:15](../../skills/debug-loop/SKILL.md:15), [skills/mcp-security-review/SKILL.md:26](../../skills/mcp-security-review/SKILL.md:26) | "Resolve scripts relative to this SKILL.md" |

### Code quality / performance / scalability
| ID | Finding | Evidence | Fix |
|---|---|---|---|
| L22 | `requires-python >=3.8` is false: PEP 585 generics in function signatures break import on 3.8; CI tests 3.10+ only | [skills/context-compressor/scripts/checkpoint.py:59](../../skills/context-compressor/scripts/checkpoint.py:59), [checkpoint.py:111](../../skills/context-compressor/scripts/checkpoint.py:111), [pyproject.toml:5](../../pyproject.toml:5) | `from __future__ import annotations` (or bump to 3.9) |
| L23 | Ruff "temporary" excludes (20 files, since 2026-09-20) hide 5 real errors: F401 ×4, E741 ×1 | [pyproject.toml:24-52](../../pyproject.toml:24) | `ruff check --fix && ruff format`; delete the excludes |
| L24 | Coverage gate passes at about 84% only because bare `--cov` counts test files and ignores never-imported modules; real script coverage is about 76% (cli.py and site/scripts at 0%, memory.py at 49%) | [.github/workflows/ci.yml:63](../../.github/workflows/ci.yml:63) | `[tool.coverage.run] source=[...]`, `omit=["*/tests/*"]`; reset the threshold to the measured value |
| L25 | Hooks swallow all errors silently: `AGENTKIT_BUDGET_TOKENS=abc` disables the budget with no signal (deliberate never-break contract, but no breadcrumb) | [skills/context-budget/scripts/budget_hook.py:156-158](../../skills/context-budget/scripts/budget_hook.py:156), [skills/session-insights/scripts/nudge_hook.py:77-79](../../skills/session-insights/scripts/nudge_hook.py:77) | One stderr or log line in `except` |
| L26 | Budget hook reads a 512KB tail only, so it misses a check when tool output exceeds that (self-heals next turn) | [skills/context-budget/scripts/budget_hook.py:30](../../skills/context-budget/scripts/budget_hook.py:30), [budget_hook.py:51-72](../../skills/context-budget/scripts/budget_hook.py:51) | Cache last-known usage in the state file |
| L27 | `nudge_hook` execs the 901-line `insights.py` per qualifying prompt (about 120ms) | [skills/session-insights/scripts/nudge_hook.py:39-52](../../skills/session-insights/scripts/nudge_hook.py:39) | Small importable module for the 3 regexes |
| L28 | `estimate.py` reads whole files into memory: a token-saving tool can blow up memory on huge logs; `session_audit.py` crashes on `null` usage fields (unverified) | [skills/token-saver/scripts/estimate.py:44-46](../../skills/token-saver/scripts/estimate.py:44), [skills/token-saver/scripts/session_audit.py:35-44](../../skills/token-saver/scripts/session_audit.py:35) | Stat size, then stream or estimate; `int(x or 0)` |
| L29 | `map.py` output uncapped, with a recursive walk per node (quadratic on deep trees) and a thin IGNORE set (unverified, critic-found) | [skills/smart-navigator/scripts/map.py:252-279](../../skills/smart-navigator/scripts/map.py:252) | One `os.walk` pass; cap with "... N more" |

### Site UI/UX (beyond the Mediums)
- **Failed fetches.**
  - [site/app.js:163-168](../../site/app.js:163): a `skills.json` failure sets `ro.dataset.e`, which also kills the plate-03 agent tooltips.
  - [site/app.js:195](../../site/app.js:195): `audit.json` failure is swallowed with `.catch(()=>{})`, leaving dashes on screen.
  - Fix: use separate error state and write "n/a" into the fields.
- **No-JS fallback.** Without JS the catalog is empty ([site/index.html:78](../../site/index.html:78)). Fix: bake the static `<li>` list into the page at build time (`build-catalog.py` already exists).
- **Missing meta.** No canonical, og:*, twitter:*, robots.txt or sitemap on either page.
- **Filter not announced.** The gallery filter change isn't announced ([site/audit/audit.js:209-216](../../site/audit/audit.js:209)). Fix: add a `role=status` count.
- **Unverified layout and perf risks (need a real browser):**
  - The `.stamp0` install line may overflow at 320px.
  - The fixed `#tb` may cover content at 640–899px.
  - The per-frame `--p` recalculation across 41 tiles needs profiling.
- **Design system.**
  - Tokens cover colour and font family only. There are about 20 ad-hoc font sizes and about 94 raw-px spacing values.
  - The hierarchy rests on the display face alone.

## Refuted
- **S1. `external-updates.yml` runs upstream code with a write token.** False. No fetched content is executed, the token is scoped per step, and checkout uses `persist-credentials:false`.

## Verified as fine
- **CI:** SHA-pinned actions, least-privilege `permissions`, no `pull_request_target`, no `${{ github.event.* }}` in `run:`, and Pages deploy has `needs: build`.
- **Site:** CSP `default-src 'none'`, no DOM-sink HTML, `rel=noopener` everywhere, reduced-motion handled on both pages, and total weight about 100KB.
- **Installers:** wrappers use argv spawn with no shell, and the boost installer is sha256-pinned with explicit opt-in. `sync-external` validates lock fields and fetches by SHA only. `check-external-updates.py` uses timeouts, retries, a no-redirect opener and a size cap.
- **memory.py:** WAL, parameterized SQL, quoted FTS (injection tried, none found), and 0600/0700 permissions.
- **No dangerous Python:** no `shell=True`, `eval`, `exec`, `pickle` or `yaml.load` in skill scripts.
- **Timings:** build `--check` 0.24s and validate 0.08s at 41 skills, both linear in the number of skills. The budget hook takes 38ms on a 67MB transcript.

## Not verified
- Browser-only UI claims (overflow, overlay, scroll-frame cost). These need a Lighthouse or real-device pass.
- Whether Claude Code lets a subagent use `Agent(...)` (affects `orchestrator` when it isn't the main thread).
- Critic findings L28 (`session_audit` null crash) and L29 (`map.py` complexity) were not reproduced.
- The `Agentkit_site_redesign.zip` handoff. It proposes a full dark "launch" identity with a lime accent. Its dimmest text token (`#5d636d` on `#06070a`) is 3.33:1 and fails AA. It is not adopted here, pending your call.
