# Metrics

Units: every `skills/*/SKILL.md` and `agents/*.md`. Tokens = chars/4 (SKILL.md only; whole file for agents). Unit scores clamp to 0..100; repo score = plain mean of unit scores. Targets: PEI 85, OVS 90, CRI 90, MNSS 92, SRS 95, APS 90.

## PEI (prompt efficiency) - base 80
- Tokens over target (skill 1200, agent 400): -40 x over/target, max -40. `pei.tokens`
- Description >300 chars: -(len-300)/10, max -15. `pei.description`
- No "Use when/for/to" in description: -20. `pei.trigger`
- Filler words (very, really, simply, just, basically, actually, essentially, obviously, please, comprehensive, robust) >2% of words: up to -10. `pei.filler`
- +10 if tokens <= target or skill has reference/*.md; +10 for skill with >=3 numbered steps (agent: +10 if tokens <= target).

## OVS (orchestration)
- Agent: Charter 25, Handoff (in/from) 20, Handoff (out/to) 20, tools scoped and not `*` 20, next agent in backticks after "Handoff contract" 15.
- Skill: Procedure heading 50, "Use when" 25, router skills (`ext-*`, `data-eng-router`) <=600 tokens 25.

## CRI (context hygiene) - base 70
- +5 per distinct term (offset, limit, range, grep, rg, summar*, targeted, head, tail, checkpoint, diff), max +30.
- -15 per whole-file instruction ("read the entire/whole/all", "whole file", "read every"), unless a negation (don't, never, avoid, not, instead of) appears in the 60 chars before it. `cri.whole_file`
- -20 for skill >1.5x token target with no reference/. `cri.no_reference`

## SRS (robustness)
- Skill: tests 30 = `tests/test*`, or a repo `tests/test_*.py` that loads `skills/<name>/scripts`, or >=3 scenarios in `evals/evals.json` (`[{query, files, expected_behavior[]}]`, Anthropic's eval format; not shipped to dist/). Validation 30 = `scripts/`, or a body line with a check word (validate/verify/lint/check/test) followed by repeat/until/re-run/again (validate-fix-repeat loop). Scripts are optional for prompt-only skills per Anthropic's skill-authoring guidance. Agent: tools scoped 30, references a skill/agent in backticks 30.
- Security budget 40, minus 20/10/5 per high/med/low `sec.*` finding (one per heuristic per unit, floor 0). Replaces the old safety-word count (noisy).
- `sec.shell` (high): scripts/*.py call with `shell=True`, `os.system`, `os.popen` (strings/comments ignored).
- `sec.env` (med): `env={...}` dict literal on a line without `os.environ` (replaces the whole environment).
- `sec.destructive` (high): recursive force delete, `git reset --hard`, `DROP TABLE/DATABASE/SCHEMA`, `git push --force/-f` in the SKILL/agent body with no confirm/approve/ask/dry-run/never wording within 3 lines.
- `sec.untrusted` (med): body mentions fetch/curl/wget/scrape/crawl/download/WebFetch/WebSearch (or tools list web tools) but never says untrusted / as data / not instructions / prompt injection.
- `sec.unpinned` (med): `npx pkg` without `@version`; `pip install pkg` without `==` (not `-r`).
- `sec.curl_sh` (high): `curl|wget ... | sh/bash`.
- Scanned: SKILL.md/agent body plus `scripts/*.py|*.sh` of each skill. Findings carry the file `path`.

## Pins (repo-level, category "Stale third-party pin", `pin.stale`)
Reads `external/skills.lock.json`; optional `external/updates.json` (`{sources:[{name,behind_by,archived,license_changed}]}` or a bare list). Findings: behind_by>0 (low, med at >=50), archived (high), license_changed (high), `checked` date older than 90 days (low). Missing files are skipped silently. Not scored.

## Safety of the scorer
Files are resolved and must stay under `--root` (symlink escapes skipped), 512 KB read cap, `errors="replace"`; skips are reported as `audit.skipped`. Only subprocess: `git rev-parse` (argv list, 3s timeout). `--out` is written atomically; compact JSON when `--compact` or the output is a `.json` under `site/`.

## MNSS (site, repo-level) - 20 each
reduced-motion handled; aria-* in site/index.html; hard-coded "N skills" matches skills dir; site/audit/index.html exists; README links the site.

## APS
Harmonic mean of PEI, OVS, CRI, MNSS, SRS (0 if any is 0): `5 / sum(1/x)`. One weak axis drags it down.

## Findings and graph
One finding per failed heuristic, all built by one helper: `{id, unit, kind, category, heuristic, severity, path, message, detail}`. Categories: Token Surface Bloat (pei.tokens/description), High Instruction Drift (pei.trigger/filler), Orchestration Bottleneck (ovs.*), Context Leak (cri.*), Guardrail Gap (srs.*, sec.*, audit.skipped), Stale third-party pin (pin.stale), Static Presentation (mnss.*).
Graph edges: orchestrator `Agent(...)` -> `delegates`; agent mentions skill in backticks -> `applies`; agent mentions another agent in backticks after "Handoff contract" -> `hands-off`.

## Output shape
`{schema, current: {scores, targets, counts, tokens, units[], findings[], graph{nodes[{id,kind}],edges[{source,target,type}]}}, baseline: <earlier current>|null}`
