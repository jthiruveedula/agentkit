# ATLAS theme — build plan (2026-11-15)

Target: Prompt Analytics dashboard (`packages/prompt-analytics/dashboard`). Branch: `feat/atlas-theme`.

## Context

v28.0 is live with the current **Classic** design and MUST stay the default. ATLAS ships as an
opt-in theme via a header theme switcher (`data-theme` attribute on the app root). All data and
logic are shared — presentation only. No metric definitions or data computation change.

## ATLAS design language (owner-approved; concept images are not in the repo)

- Ivory map-paper background `#f6efdd` with a subtle inline-SVG contour-line texture; ink `#2b2118`
  text; hairline sepia rules instead of card shadows.
- Accents: brick red `#a83a26`, deep teal `#1f6f6b`, ochre `#b9822e`, ink blue `#2e4a7a`. Display
  numerals in a serif stack (`Georgia, 'Times New Roman', serif`) — no webfont downloads.
- Header as a cartouche with a compass-rose SVG mark; sidebar as an "ATLAS INDEX" with serif group
  heads (keep the real nav labels and structure).
- Overview widget strip = "Top story — field readings": compass-dial struggle gauge, route-line
  sparkline with survey dots, elevation-tint heatmap, serif cost figure, dot-survey Why grid, matte
  shaded-relief terrain (restyle the existing echarts-gl terrain, same chunk) with summit marker
  "Peak Wed 12:00".
- Key numbers = map-legend table: oversized serif figures, hairline dividers, footnote lines.
- Verdicts and priorities as CSS rubber-stamp badges (SWEET SPOT, BEST FIT, HIGH/MED/LOW).
- Do next = expedition itinerary: dotted trail with numbered waypoint markers.
- Mind map: survey-network styling — triangulation markers, top topic as a flagged summit with red
  struggle rings, inspector as field notes.
- What works: field-notebook plates. Model fit: ruled ledger. Tools: field-guide catalog rows.
  Exposure: hazard register. Sessions: log-book table with APPLIED/STRUGGLED stamps. Funnel:
  terraced steps. Friction: hazard list with stamps. Time: relief sheet + choropleth strip.
- Motion = "drawn, not glown": route lines draw in, dots survey in sequence, terrain rises — existing
  motion system + CSS only, no GSAP/three.js; everything freezes under `prefers-reduced-motion`;
  numbers readable immediately.

## Rules

- Demo data only; every number from the existing data layer — never invent figures (concept images
  contain invented labels; keep their look, not their numbers).
- Fable subagent design pass (tokens + per-section treatments) before building; Fable visual
  re-review after; fix its flags.
- Gates: bundle ≤ 507,904 B gzip (report the number); contrast AA on the paper background (darken
  brick red for small text); `tsc` clean; vitest + package and root pytest green; no workflow
  changes; no new package manifests.
- Token discipline: lean prompts, no repo-wide scans.

## Scope update (owner-approved 2026-11-15): analytics audit folded into this build

Same PR series, same gates. Plug-ins ship **only where the existing export data honestly supports
them**. Audit of export schema 1.3 (`src/data/contract.ts`, demo `sample.json`): per-session `date`,
`project`, `intent`, `cluster` (topic), `model`, `prompts`, `tokens` (total only), `cost_usd`,
`reached_stage`, `applied`, `loops`, `friction`, `ttr_min`, `struggle_p`; plus `calendar`,
`hour_week`, `anomalies` (cost/prompts z-scores), `exposure`, `what_works` (with `holdout`).

| # | Item | Verdict | How |
|---|---|---|---|
| 1 | Cost forecast & burn | **Build** | Month-end projection = month-to-date priced spend + daily run-rate (trailing 14 active-calendar days) × days left in the export's last month; labelled "projection". Topic anomaly flag: a topic (cluster) whose last-4-weeks weekly cost slope breaks from its prior trend. |
| 2 | Change-impact watch (prompt/template versions) | **Not supported** | No version/template field in the export. Needs an exporter field (e.g. `sessions[].prompt_version`). Not faked. |
| 3 | Latency p50/p95 per model/tool | **Partial** | No response-latency field. Show `ttr_min` p50/p95 (minutes to the last applied edit) per model and per tool next to cost, labelled "time to applied edit", never "latency". |
| 4 | Token composition + cache-hit rate | **Not supported** | Only total `tokens` per session. Needs input/output/cache fields from the exporter. |
| 5 | Eval quality scores | **Not supported** | No eval score field (`galaxy.q` / `quality` are prompt-quality heuristics, not evals). |
| 6 | Cohort breakdown (team/user) | **Not supported** | No team/user field. |
| 7 | Watchtower alerts feed | **Build** | Threshold breaches from existing data: struggle rate over 10% (same struggle definition as the brief), open secret findings (`exposure.items`), cost spikes (`anomalies` metric `cost`). Each alert drills to its sessions where ids exist. |
| 8 | Universal drill-down | **Build** | Every headline number opens the sessions behind it via the existing filter/list store. |

Unplug / demote:

- Consolidate heatmap + terrain + daypart under **Time** with a view toggle (one rhythm dataset,
  one home). The Overview strip drops its heatmap and terrain widgets; ATLAS styles them in Time
  (relief sheet + choropleth strip).
- Replace the "Tokens" key-number headline with **cost per successful outcome** = priced spend ÷
  sessions that reached the `outcome` funnel stage. Existing metric definitions are unchanged; this
  is a new tile from existing fields. Token totals stay available in the Tokens-and-spend mix card.
- The owner's message was cut off after "c…" — any further demote items are pending confirmation.

Model/token discipline: theme plus analytics in one or two sessions total, this one first. Fable only
for the design pass and the visual re-review; workhorse models for implementation; no extra sessions
for subtasks that fit here. A second session, if truly needed, is limited to one and justified in
the PR.

## Deliverable

A PR with before/after screenshots of every section in ATLAS and refreshed site stills showing the
theme switcher; Classic untouched as default. Do not merge — report the PR number and gate results.
