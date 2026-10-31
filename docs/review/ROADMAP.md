# agentkit — Upgrade Roadmap (2026-10-30)

Companion to [REVIEW.md](REVIEW.md). IDs (M#, L#) refer to findings there.

## Assumptions

- **Branches and PRs.** One feature branch and one squash PR per theme, using Conventional Commits. Nothing goes straight to `main`.
- **No breaking changes.** Public surface stays as it is: CLI flags, install paths, skill names and frontmatter keys. Renamed env vars keep the old name as a fallback.
- **Tests and metrics.**
  - Every behaviour change gets the smallest failing-first test.
  - `make test` and `make lint` run after each PR.
  - Before/after metrics are recorded in the CHANGELOG entry.
- **Where the review files live.** REVIEW.md and ROADMAP.md move to `docs/review/` in the first PR, so the root stays tidy after #73.

Effort: **S** < 1h, **M** = a few hours, **L** = a day or more. Risk = the chance it breaks something for users.

---

## Phase A — Quick wins (no approval beyond this roadmap)

| # | Item | Fixes | Effort | Risk | Gain |
|---|---|---|---|---|---|
| A1 | `build.py --check` reports stray `dist/` files; test | M5 | S | Low | Closes the CI drift hole |
| A2 | `mcp_scan`: exact-host localhost; accept `==` pins; scan `url`/`headers` for secrets; finding on malformed JSON; lookalike-host test | M3 | S | Low | Security tool stops returning false negatives |
| A3 | Generate marketplace skill/agent lists in `build.py` (checked by `--check`); release-please `extra-files` for pyproject and marketplace; version-parity test | M1 | M | Low | Plugin users get all 41 skills; versions stay in sync |
| A4 | Site a11y: contrast tokens, Esc dismiss, pausable `.pulse`, drop 58 dead tab stops, add hidden score table, `role=status` filter count, error states for failed fetches | M7 M8 M9 M11 + site Lows | M | Low | Meets WCAG 2.2 AA on both pages |
| A5 | Lint and runtime debt: `ruff --fix` + format, delete the "temporary" excludes; `from __future__ import annotations`; coverage `source`/`omit` config with the threshold reset to the measured value | L22 L23 L24 | S | Low | Honest gates; the 3.8 claim becomes true |
| A6 | Installer and hook hardening: uninstall root check; atomic `settings.json` writes; `shlex.quote`; `session_id` sanitize; `curl --proto =https`; scaffold YAML quoting; stderr breadcrumb on hook errors | L2 L4 L7 L9 L12 L25 | M | Low | Removes every `rm -rf` and injection footgun found |
| A7 | CI: ref guard on `publish.yml`/`pages.yml`; dispatch with the release tag; job-level permissions; `timeout-minutes` everywhere; dependabot `commit-message.prefix` | L1 L11 + critic | S | Low | Releases ship exactly the tagged code; dependabot PRs pass commitlint |
| A8 | Skill/agent prose: data-not-instructions lines; "max 3 attempts" loop caps; `skills:` preload on agents; reviewer/researcher hand-off wording; cross-pointers; "resolve scripts relative to SKILL.md" | L8 L13 L14 L17 L18 L20 L21 | M | Low | Fewer runaway loops and less prompt-injection surface |

## Phase B — Structural upgrades

| # | Item | Fixes | Effort | Risk | Gain |
|---|---|---|---|---|---|
| B1 | Scope `allowed-tools` per skill to the exact commands it runs; drop `gh pr review` pre-approval; `validate.py` rule against bare `Bash` (allow-list with reason) | M2 | M | Med: some skills will prompt for permission more often | Largest agent-security win in the repo |
| B2 | Copilot emitter: optional `globs:` frontmatter that drives `applyTo`; default to on-demand, not `**` | M4 | M | Med: changes Copilot behaviour, so it needs a doc note | Cuts Copilot context by about 41 skill bodies per request |
| B3 | `validate.py check_agents()` (name, tools, model, referenced skills exist, read-only claims); orchestrator roster parity test | L15 L16 | S | Low | Agents get the same rigour as skills |
| B4 | Perf: small `nudge_patterns.py` module (no exec of `insights.py`); `estimate.py` streams and estimates large files; `map.py` single `os.walk` plus output cap; budget hook caches last usage | L26–L29 | M | Low | nudge hook from about 120ms to under 20ms per prompt (target, to be measured); bounded memory |
| B5 | Privacy: `redact()` reused in `insights.py` draft/snapshot paths, 0700/0600 permissions; `AGENTKIT_DATA_DIR` with `AGENTKIT_HOME` fallback; checkpoint injection wrapped in an untrusted-notes marker | L5 L6 | M | Low | No raw prompts on disk; env var meaning is unambiguous |
| B6 | Site perf and SEO: self-host 2 woff2 files plus preload; CSP to `'self'`; canonical, og and twitter meta, robots.txt, sitemap; no-JS catalog baked by `build-catalog.py` | M10 + site Lows | M | Low | "Zero telemetry" becomes true; LCP no longer waits on a 3rd-party fetch |
| B7 | Audit honesty: rename eval criterion to "evals defined", weighted below real tests | M6 (short-term) | S | Low: APS numbers shift, so the change is called out | Score stops overstating rigour |

## Phase C — Strategic bets (each needs your explicit yes)

| # | Bet | Effort | Risk | Gain | Why it needs approval |
|---|---|---|---|---|---|
| C1 | **Nightly eval runner.** Run each skill's `evals.json` against Claude with an LLM-judge, store pass rates in `audit.json`, fail on regression | L | Med | First real behaviour tests; catches routing regressions | Costs API spend; needs an `ANTHROPIC_API_KEY` repo secret |
| C2 | **Site direction.** (a) evolve the current field-manual site (A4 + B6 plus a type and spacing scale), or (b) adopt the `Agentkit_site_redesign.zip` dark "launch" design, fixing its AA failures (`#5d636d` dim token at 3.33:1) and keeping the CSP and zero-JS-dependency rules | (a) M / (b) L | (b) Med | (b) bigger visual reset | Brand and identity call |
| C3 | **Python floor to 3.10** to match CI (drop the 3.8/3.9 claim) | S | Med: pip users on old Pythons | Removes untested compat promises | Changes public support policy |

---

## Proposed PR order

1. **A1 + A3**: build/distribution integrity. Ships first because later PRs regenerate `dist/`.
2. **A2**: `mcp_scan`.
3. **A5**: lint and coverage. This may surface new failures, which get fixed in the same PR.
4. **A6 + A7**: installer, hooks and CI hardening.
5. **A8 + B3**: skill and agent prose plus validation.
6. **B1, then B2**: one PR each, since they change behaviour.
7. **B4 + B5**: perf and privacy, with before/after benchmarks.
8. **A4 + B6 (+ C2)**: site work, verified with Lighthouse and keyboard checks in ego-browser.
9. **B7**, then the CHANGELOG with metrics and a final remaining-risks summary.

Independent PRs run as parallel subagent workflows (each in its own worktree) and merge one at a time. Every PR waits for green CI before merging. Nothing is admin-merged unless you say so.
