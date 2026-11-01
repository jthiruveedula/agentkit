# Prompt Analytics polish iterations

## Iteration 1 — 2026-11-01

Scores: Data-viz 6.8 · Product design 6.2 · Power analyst 6.8 · A11y/mobile/perf 6.3

Built:

- 3D canvas constellation mind map, moved to the end of the page under the "Explore" nav group. It has gated wheel, pinch and button zoom, plus fly-to.
- Industry-style trend chart: monotone area, ghost line for the prior period, rolling-median band for All, crosshair tooltip, spike markers, and a brush that sets from/to.
- Branded sticky header that shrinks on scroll, with filter chips.

Adopted for iteration 2:

- A.1 Sections render in their end state by default. The reveal animation runs only behind `html.fx` plus `data-in`, and the gap between sections uses one token.
- A.2 The header fits in two rows. The SCOPE/TIME captions and the duplicate "All sessions" text are gone, and the TOOL label no longer clips.
- A.3 The nav has one active treatment, and only on `aria-current`. Scroll-spy sets exactly one, and the sub-section anchors resolve.
- A.4 The trend chart is honest: the partial last bucket is marked, the peak is labelled, unpriced sessions are footnoted rather than counted as $0, low-base deltas are neutral, and the brush only commits on a deliberate drag.
- A.5 The 3D map gets label collision handling, a camera fitted to the visible nodes, fill-based expand cues, hotspot labels, an accessible canvas role, and cached sprites.
- A.6 Mobile: KPI text wraps at 320, dim list rows stay AA, bottom-bar items are 44px or taller, and coarse pointers get 40px targets.
- A.7 The sessions table can sort by tokens and loops, and defaults to cost-desc under a brush range.

Rejected:

- "Flat treemap as default map view": the user explicitly asked for 3D. Worst-node hotspot labels were added instead.
- "Single 48px header always": kept a 2-row expanded state for the brand presence the user requested; it compacts on scroll.
- "Cost-by-intent card in Overview": deferred to iteration 3 unit economics (cost per applied change).

## Iteration 2 — 2026-11-01

Scores: Data-viz 7.4 · Product design 6.6 · Power analyst 7.1 · A11y/mobile/perf 7.4.

Adopted from the iteration 2 review:

- Playbook: Benjamini–Hochberg at q = 0.10 across every test run before cards are picked.
- Playbook: card titles lead with scope ("SQL migrations: state constraints").
- Playbook: Do-more copies only a prompt that has the feature; Do-less has no copy slot.
- Playbook: one fixed-width CI strip scale shared by every card, with a visible zero tick.
- Playbook: "What moves success" folded into an "All N tests" disclosure.
- Loop Breaker: change intents (feature, bugfix, refactor) with 2+ prompts only.
- Loop Breaker: the headline is a stopping rule computed from the curve.
- Loop Breaker: no-data labels on the baseline in muted italic, plus a "not causal" note.
- Loop Breaker: bins shared with the histogram (one `MAX_LOOPS`); histograms use one hue and label their tallest bar.
- Trend: about 10% headroom, monotone curves, no area fill under a band, an opacity fade instead of scaleY, and the peak label sits on its dot.
- Cost never understates silently: "≥ $X" on the trend total, "$X priced · N unpriced" on the KPI.
- Map: proportional node size with a "size = sessions, relative within level" key, and a friction ring key.
- Map: top-3 hotspots labelled "$cost · friction%" with no clipping or label overlap; their branches start open.
- Map: a hotspot chip filters to its project, scrolls to Sessions and still flies to the node.
- Map: fit and centre on load and on every expand or focus change.
- Map: a keyboard-accessible "?" popover replaces the key-help paragraph; the canvas uses `touch-action: pan-y`.
- Map: per-frame arrays are reused, and text widths are cached.
- Nav: mobile More takes `aria-current` when the active section is under it.
- Nav: the More menu closes on Esc, an outside click or a scroll, and focuses its first item; `aria-controls` is set only while it is open.
- Nav: `goto()` locks the spy to the clicked section until `scrollend` (or 900 ms); the spy also runs on mount and on resize.

Rejected:

- "Drop smoothing entirely": kept Fritsch–Carlson monotone interpolation, which cannot overshoot, plus headroom.
- "Golden hours slip to iteration 4": kept in iteration 3 per the PM plan, because it is small.

### Theme decision

Moved from Refract to Ledger. The Refract theme had translucent cards, backdrop blur everywhere and a caustic canvas. Ledger has a flat paper background, white cards with a 1px line and a 10px radius, a hairline shadow, and one blue accent.

Why:

- A quiet surface puts the numbers first.
- Removing the caustic canvas removes its noise, and blur is now limited to the sticky header and the bottom bar.
- Text and marks have higher contrast.
- The page ships fewer bytes and runs one less animation loop.

Categorical series no longer use red or amber, so red only ever means "bad".

Before: `polish/iter-2/` (header-1440.png, trend-1440.png, playbook-1440.png, map-1440.png, full-1440.png).
After: `polish/iter-3/` (same names, plus router-1440.png, golden-1440.png, loopbreaker-1440.png, kpi-1440.png).

Series 4 was darkened from L 0.66 to 0.64, the smallest change that clears 3:1 against white.

Built:

- Reveal: sections render visible by default. `initFx()` runs before the first render, already-visible sections are revealed synchronously, and the animation runs only on `.fx .sec[data-in]`. One `--gap-sec` token sets the section spacing.
- Header:
  - Row 1 holds the brand, the period segmented control, a Filters disclosure and an "N of M sessions" link.
  - Row 2 holds the removable filter chips and Clear all.
  - Captions and the "All sessions" crumb are removed, and filter labels are plain.
- Nav: one active style (soft fill plus a 3px left bar) applies only on `[aria-current]`; hover only underlines. The bottom bar has short labels and 48px items. The `s-trend`, `s-attention`, `s-playbook` and `s-loopbreak` anchors map to their sections.
- Trend:
  - The partial final bucket gets a hollow dot, a dashed tail and "Partial week" in the tooltip, and is left out of spikes and the end label.
  - The peak is labelled directly, and an "N sessions unpriced" footnote appears when cost is missing.
  - Sessions and prompts show a neutral delta, or "low base" when the prior n is under 5.
  - Week buckets read "Week of Mar 3", and ranges use en dashes.
  - With no comparison the chart is titled "<Metric> per <day|week>".
  - The Daily/Weekly toggle is quieter.
  - The brush commits only on a drag of 6px or more, or on Shift+arrows then Enter. A "Drag to zoom" hint appears on hover.
- 3D map:
  - A label pass shows tools, the focused or hovered branch, ancestors and hotspots, and drops labels that collide.
  - The camera fits the visible bounds, and the equator ring is centred on them.
  - A collapsed node is a solid sphere and an expanded node is a rimmed, tinted disc.
  - The top 3 cost × friction hotspots get dashed rings and labels, plus chips that reveal and fly to them.
  - The canvas has `role="group"` with `aria-roledescription="3D map"` and a visible 12px key-help hint. Sphere sprites are cached per colour.
- Mobile and a11y: KPI sub-text wraps; dim list rows use muted text at 0.7 opacity or more; coarse pointers get 40px targets, and map rows are 44px.
- Sessions table: tokens and loops columns and sort keys; the default sort is cost-desc while a brush range is active.
- Prompt Playbook (top of Works):
  - Up to 5 "Do more" and 5 "Do less" cards, built only from effects whose CI excludes 0.
  - Each card shows the effect in pts, a CI whisker, n, the cluster scope and one imperative line. Counter-intuitive effects get a "correlation, not cause" note.
  - A copy button copies the redacted exemplar (160 characters or fewer). Clicking a card drills into its cluster.
  - Empty states cover "no tests ran" and "under 30 sessions in view".
- Loop Breaker (Friction): applied rate by loop count (0–4 and 5+), with n per bucket and a Wilson CI. Buckets with n under 10 show "not enough data". The break-even label is computed, never hard-coded, and an sr-only table backs the chart.
- Tests: `src/__tests__/polish.test.ts` covers the playbook, loop curve and break-even, partial bucket, peak, unpriced count, week labels, anchors, the new sort keys and hotspots.

## Iteration 3 — 2026-11-01

Scores: Data-viz 7.6 · Product design 7.0 · Power analyst 7.3 · A11y/mobile/perf 7.7

Adopted from the iteration 3 review (all built in 4a):

- Golden hours and Router name a winner only when the Wilson lower bound clears the baseline or the runner-up.
- The Loop Breaker picks its peak by Wilson lower bound and drops the peak label when the gain is not significant.
- KPI denominators reconcile ("146 priced of 201 applied", "of 787 sessions with prompts", an "unpriced, partial" tag).
- "Do less" pills and hotspot rings leave the red-green pair; a 0 to max ramp key sits under the heatmaps.
- Trend x-axis ticks are short dates, with "Weekly" in the axis caption and "Week of" only in tooltips.
- Header: 28px wordmark, 2px brand gradient rule, one-time logo draw-in, engine pill on the subtitle line, sticky compact header checked.
- Map: angular layout per level, label halos, fly-to fits the node and its children (cap 180%), off-path links at .15, hotspot chips with a gap, `role="application"`.
- Mobile bar: active top accent, "Risk" label, bottom padding equal to the bar, "More, current: X" label, filter-count badge.

Rejected: full TTR per router cell, because the sentence was dropped to keep cells legible.

Built:

- Ledger theme:
  - New tokens in `styles.css`.
  - A darker `--warn-ink` for warning text.
  - Nine categorical series with no red or amber.
  - A 12/13/15/20/28 type scale with no uppercase mono labels.
  - Sessions and Cost per applied change are the primary KPI cards.
  - Sparklines colour only their latest bar.
  - `Caustic.tsx` and the pointer tilt are deleted.
  - `scripts/contrast.mjs` covers `warn-ink`, the series tokens and the accent on `accent-soft`.
- Cost per applied change is a primary Overview KPI that drills to Tools. It is priced sessions only, shows "$X priced · N unpriced, excluded", and reads "–" when nothing priced applied, never $0. It reuses `compare.costPerApplied`, which now also returns the cost.
- Tool router (Tools) replaces the tool × intent matrix:
  - Each cell shows the applied rate and mean loops, with the TTR in the title and table.
  - Cells with n < 15 are hatched and read "not enough data".
  - The best tool per intent is named in text, and only when it strictly beats a second qualifying tool.
  - Clicking a cell drills to that source and intent, and an sr-only table backs the matrix.
  - The logic is the pure `lib/econ.ts` `router()`.
- Golden hours (Time):
  - A Prompts | Success toggle on the hour-of-week heatmap shows the applied rate per hour.
  - Hours with n < 5 are hatched.
  - The best 3 hours are picked by Wilson lower bound and are outlined and named.
  - The toggle is hidden when an export has no `hour_week[].applied`, so the basic tier and schema 1.0 still render.
- Exporter: `hour_week[]` gains `sessions` and `applied` (schema 1.1). The pytest suite, the golden fixture and the mock samples are regenerated.
- Playbook, Loop Breaker, trend, map and nav fixes, as listed under the iteration 2 review above.
- Tests:
  - `econ.test.ts` covers BH, p-values, scope titles, snippets, the router (including the tie rule), golden hours, proportional radius, headroom and no overshoot.
  - `dashboard.test.tsx` covers the basic tier without the field, the golden toggle, router hatching and drill, the CPA "–" case, and the More menu.
  - `nav.test.ts` covers the spy lock.


### Iteration 3b — Activity calendar 360° orbit (user request)

- The 3D mode can now be orbited freely. It is still CSS 3D (no new dependency and no WebGL). A drag turns the yaw through the full 360° and moves the pitch (`rotateX`), which is clamped to 10–80° so the floor never flips. Zoom runs from 0.5× to 3× and stays anchored on the cursor or pinch midpoint. It responds to ⌘/Ctrl + wheel and trackpad pinch, or to any wheel once the chart has been clicked into. Otherwise, plain scrolling still scrolls the page. On hover, a hint chip shows how to zoom and orbit.
- When you let go, the view keeps moving and slows to a stop (frame-rate independent decay). The "Reset view" button, a double-click on the background, or `0` returns to the default angle by the shortest yaw. When the stage is focused, the arrow keys orbit (15° yaw, 5° pitch) and `+`/`-` zoom. Each keyboard step and reset is announced in an sr-only `aria-live` line. With reduced motion there is no inertia, and the reset and key steps are instant.
- Touch: one-finger horizontal drags turn the view. `touch-action: pan-y` keeps vertical swipes scrolling the page. Two fingers pinch to zoom and tilt the view. After a tap into the chart, the stage switches to `touch-action: none` and one finger orbits fully. Tapping outside or pressing Esc releases it.
- Readability: the day and month labels are billboards that always face the camera and keep a minimum on-screen size. A far-edge row fades only when the camera is low and the labels would sit behind columns. Each column now has all four sides, so it stays solid from every angle. The floor refits to the stage at each yaw so that end-on angles don't overflow. The stage clips at 320 px.
- Performance: one rAF writes the transform and label variables through refs. No React state changes per frame. `will-change` is set only while a drag is in progress (`data-live`). A click that ends a drag is suppressed, so it does not also filter. Day click and shift-click still work at any angle (checked with real clicks at 120° yaw).
- Pure math is in `src/lib/calorbit.ts` and tested in `src/__tests__/calorbit.test.ts`: clampPitch, wrapYaw, clampZoom, zoomAround, inertia, facing/edgeFade and fitScale.
- Screenshots: `polish/iter-3/cal3d-default-1440.png`, `polish/iter-3/cal3d-angle2-1440.png` (+120° yaw), `polish/iter-3/cal3d-angle3-1440.png` (+240° yaw, higher camera, about 2× zoom), `polish/iter-3/cal3d-390.png` and `polish/iter-3/cal3d-hint-1440.png`.

## Iteration 4 — 2026-11-01

### 4a Built

- Capability layer: `src/lib/capabilities.ts` (`capabilities(d, views)`, `sectionsFor`, `unlockText`, `unpricedNote`). Pure, recomputed under every filter. The store exposes `caps` (rows in view), `capsAll` (whole export, so a clicked tool row's table stays put) and `secs` (sections with something to show; the nav and scroll-spy list only these).
- Section and chart decisions all read the flags: Overview KPI (cost or tokens per applied change), Trend and calendar metric toggles (no Cost without prices), Time (cost river and cumulative or the token chart), Tools (scorecard and cost split only with 2+ tools; one tool pivots to "Projects" with an intent x project router), Funnel (no Tool break-down or tool-switch flow for one tool), Friction (per-tool signals only for 2+ tools), Works (Playbook only when effect tests ran, otherwise a one-line unlock note), Shell nav (Tools renamed Projects, empty groups dropped).
- App: dismissible "Using other tools too?" tip (single-tool exports only, localStorage in try/catch), "not enough data yet" note naming what unlocks the view, friendly empty state, basic-engine banner.
- Stats honesty, KPI reconciliation, colour, trend ticks, header, map, mobile fixes from the iteration 3 review (section B of the brief; see above).
- Data: `src/data/shapes.ts` (onlySources, noPrices, basic, small, missing, empty); dev-only `?sample=single-claude|single-copilot|two-tools|no-prices|basic|small|missing|empty` in `load.ts` (tree-shaken from builds); `sample-single-claude.json` (163 sessions, all priced) and `sample-single-copilot.json` (70 sessions, none priced).
- Python: single-source exports and insights never emit cross-tool headlines, and never rank on cost when nothing is priced (`tests/test_single_source.py`, synth profiles `single-claude` and `single-copilot`).
- Fixes found while resuming: scroll-spy no longer reads "page end" on an unscrollable page; the Tools scorecard no longer vanishes when its own row filters the export to one tool.
- Tests: `shapes.test.tsx` (capabilities unit tests plus a table over 1 tool for each of the 5 sources, 2 tools, 5 tools, Copilot only, no prices, basic engine, a first week, missing fields, empty, the tip), existing tests updated for the new copy.

### Data-shape adaptivity

| Shape (`?sample=`) | What renders |
|---|---|
| single-claude | All sections. Tools becomes "Projects" with an intent x project router; no scorecard, tool legends, tool-switch flow or "best tool". Cost KPI and charts shown. Tip about other tools. |
| single-copilot (nothing priced) | As single-claude, but tokens per applied change replaces the cost KPI, "Copilot doesn't record prices" note, no cost river, no $ anywhere, no Cost toggle. |
| two-tools | Scorecard with pairwise phrasing ("Claude Code or Cursor"), router and cost split. No tip. |
| five tools (default) | Full comparison. |
| no-prices | Tokens per applied change, token efficiency chart, no cost surfaces. |
| basic | Banner and the Playbook replaced by a note naming the ML engine command; galaxy views hidden. |
| small (5 days, 12 sessions) | Overview, Exposure, Recommendations, Sessions only; nav shows just those; note "N more days of use unlock trends, golden hours and patterns". |
| missing | Older export without optional tables: every section still renders with defaults. |
| empty | "No sessions yet" state, no nav, no KPIs. |

Screenshots (all in `polish/iter-4/`): header-1440, header-scrolled-1440, header-320, trend-1440, map-1440, map-expanded-1440, map-390, golden-1440, router-1440, loopbreaker-1440, kpi-1440, nav-320, full-1440, shape-single-claude-1440, shape-single-copilot-1440, shape-two-tools-1440, shape-basic-1440, shape-small-1440, shape-empty-1440, shape-single-copilot-390 (all .png).

Checks: tsc clean; vitest 142 passed; build 134.38 kB gzip; contrast ok; pytest 113 passed, 1 skipped; no horizontal overflow at 320, 375, 414, 768, 1440.

### 4b Built

- Sessions table (`components/Sessions.tsx`, `lib/paging.ts`, `lib/export.ts`, `components/ExportMenu.tsx`): 10 rows per page, `<nav aria-label="Sessions pages">` with Prev/Next, "11–20 of N" and an aria-live announcement; Rows 10/25/50/100/All; Compact/Comfortable density. Page, size, density and sort live in the hash (`pg`, `pgs`, `dn=c`, `so=cost-d`) via `Nav` and `setView` in `state.tsx`; a filter change drops `pg` in `commit`, a sort or size change resets it. Sort spans every row. Tool column only for multi-tool exports, Cost column only when anything is priced (both from `capsAll`). Compact on phones keeps Date, Tool, Title, Cost. The side-panel card list is now `SessionList` (unchanged behaviour).
- Export menu (CSV, JSON, Excel) exports every row in view in the current sort, null cost stays empty/null. CSV quotes everything and prefixes `= + - @ tab CR` with an apostrophe. JSON is `{meta:{generated_at,filters,count}, sessions:[...]}`. XLSX is an in-house SpreadsheetML writer in a stored zip with CRC32 (about 2.5 kB gz of code, no dependency): numbers, dates (serial plus style), booleans, inline strings (never formulas), null = no cell. Files: `prompt-analytics-sessions-YYYY-MM-DD.{csv,json,xlsx}`.
- Copy as Markdown (`lib/summary.ts`, `components/CopySummary.tsx`, button in the Overview header): `summarize(d, {f,v,win,caps,prior,cmp})` is deterministic and reads only aggregates (totals, insights, recommendations); a test seeds titles, exposure previews and cluster exemplars and asserts none appear. Clipboard, else `.md` download, plus a toast (`lib/toast.ts`, `Toaster`). No cost lines when unpriced; "X only" phrasing for one tool. Reusable for Weekly Wrapped.
- Command palette (`components/Palette.tsx`, `lib/palette-actions.ts`): Cmd/Ctrl+K and `/` outside fields, focus trap, arrows/Enter/Esc, focus restored; open animation only under no-preference. Header "⌘K" button (Ctrl K off Mac). Saved views in localStorage (try/catch, "storage blocked" toast).
- Visible non-palette equivalents: jump to section = side nav / bottom bar; filter source/intent/project = header Filters; range = Period control; clear filters = chip x / "Clear all"; Copy as Markdown = Overview button; Export = Sessions Export menu; open session = Sessions table. Exception: saved views (save/apply/delete) and session-by-title search are palette-only.
- Checks: tsc clean; vitest 159 passed (17 new in `sessions-tools.test.tsx`: paging math, hash round trip, CSV/JSON, CRC32 check value, xlsx zip local headers + CRC + central directory + cells, summary privacy, palette ranking, saved views incl. blocked storage, table and palette UI); build 142.67 kB gzip (was 134.38, +8.29; palette about 3.3 kB gz of that); contrast ok (no new colours); no horizontal overflow at 320/375/414/768/1440.
- Not done: the palette is not lazy-loaded; summary uses whole-export insights (labelled as ignoring filters); no per-row Excel column widths beyond date and title.
- Screenshots in `.../scratchpad/polish/iter-4/`: sessions-1440, sessions-compact-1440, sessions-390, export-menu-1440, palette-1440, palette-390, copy-md-toast-1440, header-320-4b.

## Iteration 4 review scores

Data-viz 7.8, Product design 7.4, Power analyst 7.4, A11y/mobile/perf 7.9, Data-shape 7.4.

Adopted: nav and section naming keyed on whole-export tool count; zero-finding export hides Exposure; palette as modal dialog (portal, inert app, live results); Wilson CI and n on Scorecard and Router with thin-cell hatching; Loop Breaker effect in points with CI; golden-hours minimum n 10 and "ignores filters" tag; summary drops insights and recommendations under filters, adds "Where it went", guards cost delta when priced shares differ, no "-0%"; "Copied" state; weekly trend markers; sessions title search, saved-views menu, right-aligned numeric columns, friction bars, Last page, export size hints.

Rejected: lazy-load palette (saves a few kB, risks a flash on first open); replace spline everywhere (Trend already uses Fritsch-Carlson monotone, no other chart uses curves).

## Iteration 5a

Built: items 1, 2 (mostly), 3, 6 as listed above. Tests: `src/__tests__/iter5a.test.tsx` (stats helpers, rephraseEffect, title filter and hash round trip, palette order, summary Where it went and filter drop, shape table over empty, single-claude, single-copilot, small, zero-finding, filtered-to-unpriced tool and filtered-to-priced tool).
Checks: tsc clean; vitest 177 passed; build 145.49 kB gzip; contrast ok.

### 5a Built (5a-2)

- Header and brand (`Shell.tsx`, `styles.css`): 32px logo tile (filled brand blue, white orbit, amber dot via `--amber`). 1px `--line-2` hairline plus a 56px 2px brand rule replaces the gradient wash. Compact scrolled bar keeps the date range and the engine chip; the palette button shows in both states. Controls moved into `.top-tools` (`display: contents` on desktop).
- One amber: logo dot, trend peak annotation (`.tr-peak`, ink variant `--warn-ink`), hotspot rings (`--warn`). Tool hues respread in lightness (Claude 0.5, Cursor 0.6, Copilot 0.63, OpenCode 0.67, Antigravity 0.36 plum, away from the Claude blue). `contrast.mjs` gains amber on brand, warn-ink on accent-soft and a Claude/Antigravity distance guard.
- Map (`Orbit.tsx`, `lib/orbit.ts`): `screenFit` frames the projected node bounds (centred, root no longer the anchor, room for labels). Labels go radially away from the parent with 5px surface halo; a label never overlaps its own node, ring or (when a clear spot exists) another node; hubs fall back through more angles.
- Mobile: the header scrolls away; only the toolbar row (period, Filters, palette) sticks (`position: sticky` with wrappers `display: contents` at <=699px). Bottom bar is 5 items plus More (already). "Tap to rotate / Done" on the 3D calendar (touch no longer self-activates on first touch) and on the map (`data-touch` sets touch-action none; exits on Done, Esc, outside tap).
- Loop Breaker: per-bucket tooltip with rate, Wilson CI and k of n. Exposure weekly and kinds-by-tool, and Recommendations, labelled "whole export, ignores filters".
- Sessions at 390: Tool already sits under the title (title ~270px).
- Tests: `src/__tests__/iter5a2.test.tsx` (screenFit, whole-export labels, header structure, calendar toggle). Loop Breaker tooltip and CSS token checks are not unit-tested (SVG needs a measured width, jsdom has none).
- Checks: tsc clean; vitest 182 passed; build 146.80 kB gzip (vite report, was 145.49 of 165); contrast ok; no horizontal overflow at 320/375/414/768/1440; no new animation (reduced-motion rules unchanged); sloplint floor on Shell.tsx and styles.css: Shell clean, styles.css 13 FAIL all on lines this iteration did not touch (opacity-disabled, oklch literals, stamp), not fixed.
- Screenshots in `.../scratchpad/polish/iter-5/`.
- Not done: map labels in the expanded state are dense near the Claude cluster (no collisions with own node, some sit close to neighbours); Dependabot/CI untouched.

### 5b Built

Close-the-loop features. Export schema is now 1.2 (1.1: `hour_week[].sessions/.applied`; 1.2: `repeats[]`, `sessions[].features`). Older exports still load: both fields stay `undefined` and each feature hides itself.

- Repeat to slash command. Python: `repeats.py` (normalized-text groups, 4+ words, not acks or `/commands`, count >= 3 in >= 2 sessions, max 10, 25 ids each, optional TF-IDF merge in ml/deep tiers), exemplar redacted and <= 160. Dashboard: "Repeated prompts" card in Friction (`Repeats.tsx`, `lib/repeats.ts`): "You typed this N times", open latest session, "Turn into a slash command" shows the `.claude/commands/<slug>.md` draft (frontmatter, exemplar, `$ARGUMENTS`). Copy is disabled, with the reason shown, when `lib/secrets.ts` (TS port of the Python redaction rules) finds anything in the draft. Card hidden when `repeats` is absent; friendly note when empty.
- Detail drawer checklist (`Detail.tsx`, `lib/habits.ts`). "Habits from your wins this session lacked": only `playbook().more` entries (CI clear of 0, BH-FDR passed) in the session's topic or intent that the session's `features` lack; "correlation, not cause". Hidden when features/what_works are missing, when the session is applied, or nothing is missing. Python `sessions[].features` = quality axes with any prompt sub-score >= 0.5.
- Weekly Wrapped (`lib/wrapped.ts`, `Wrapped.tsx`). At most 5 cards (streak, top intent, cost or tokens vs prior week, best prompt = redacted cluster exemplar, one habit). Opens from an Overview button, the palette ("Open Weekly Wrapped") and the chip. Auto-shows once per ISO week (localStorage in try/catch; blocked storage never auto-shows); an open secret finding replaces the auto-show with a dismissible chip. Not offered for thin or empty views. Numbers use the same `views`/`priorViews`/`costParts`/`tokensChg` as `summary.ts` (`costParts` and `tokensChg` extracted from `summarize`). Modal dialog, focus trap, Esc, inert page behind; motion is opacity/translate only and off under reduced motion.
- Fixed while verifying in the browser: the dialog focused a disabled button, so Esc did nothing. It now focuses the dialog container.
- Tests: `iter5b.test.tsx` (15), plus the `missing` shape now drops `repeats`/`features`; `tests/test_repeats.py`; golden regenerated.
- Checks: tsc clean; vitest 197 passed; pytest 119 passed, 1 skipped; build 151.45 kB gzip (limit 165); contrast ok; no horizontal overflow at 320/375/414/768/1440 (also with Wrapped open); reduced motion verified (animation-name none on dialog and card, `pa-pal`/`pa-wrap` otherwise). `uv.lock` unchanged.
- Screenshots in `.../scratchpad/polish/iter-5/`: repeats-1440, slash-draft-1440, detail-checklist-1440, wrapped-1440, wrapped-390, wrapped-320, full-1440, full-390.
- Not done: no sloplint run; Copy is the only action on a draft (no file write); repeats card ignores filters (labelled).

## Iteration 5 review scores

Data-viz 7.9, Product design 7.9, Power analyst 7.9, A11y/mobile/perf 8.2, Data-shape 7.0 (provisional: the reviewer could not open the shots).

Adopted: Wrapped focus/live-region/scroll-lock/honesty fixes, Wrapped auto-open replaced by the chip; golden-hours and Loop Breaker statistical honesty; Detail checklist wording and effects; one thresholds module; Overview "Where it went"; equal KPI strip; Repeats editable draft, dedupe, cost and sort; shape handling of `repeats` and `exposure.items`; map hairball and root-total fix; phone toolbar offset.

Rejected / deferred: "make Wrapped manual-only" is half-adopted (auto-open becomes the chip; the manual button stays). "Alternate tinted section bands" deferred to round 8 polish.

## Iteration 6a (fixes only; motion/3D deferred to the innovator)

### 6a Built
- Wrapped: streak/intent copy fixes, manual button kept, auto-open replaced by ISO-week chip (`lib/wrapped.ts`, `components/Wrapped.tsx`).
- Stats honesty: single `lib/thresholds.ts`; golden hours use a Bonferroni-corrected diverging scale against a baseline excluding the tested cell; loop breaker compares Wilson intervals honestly; Trend cost delta gated on pricing-share comparability.
- Overview: "Where it went" card (full width, one click filters), equalised KPI strip, KPI text wraps at 320.
- Repeats rework (slash-command draft with secret check, shapes handling); `rescope` mock shapes.
- Map: collision spread (`spread()` in `lib/orbit.ts`, r+6), off-path edges dim to 15%, `.mm-q` and zoom buttons 44px on coarse pointers.
- Mobile: `.sec` scroll-margin at <=699px is `max(104px, --hh + 16px)`.
- Checks: tsc clean; vitest 198 pass; build 154.48 kB gz (cap 165); contrast ok; no horizontal overflow at 320/375/414/768/1440 (15px diff at 768/1440 is the scrollbar), also under reduced motion.

### 6a remaining
- Map right-hand cluster is still dense at the default zoom (spread reduces overlap but 3 projects x intents stay close); needs a layout change, not a nudge.
- Cost chart y-axis labels clip their leading "$" (left padding) in Time.
- full-390 is a viewport capture (fullPage capture fails at 15.8k px height).
- Root total verified 837 = header; no change needed.

## Iteration 6b (in-chart motion and micro-interactions)

### Innovator ideas (rounds 6-8)

| Rank | Idea | Verdict |
|---|---|---|
| 1 | Bars grow and stagger on reveal | Adopted (already built in 5x; stagger delay now capped at 8 rows via `min(var(--i), 8)`) |
| 2 | Lines draw on, `useMorph` on filter change, extended to bar charts | Adopted: Trend line/area/bars morph in pixel space; draw-on existed; bars use CSS `--w` / `height` transitions |
| 3 | Linked brushing via one shared hover context | Adopted: `lib/motion.ts` store + reducer, DOM tagging (`data-hl` / `data-dim`), outline cue, aria-live line, focus triggers it |
| 4 | Hover lift/glow, card tilt, press ripple | Adopted: `components/Fx.tsx` (delegated, one rAF after pointermove, mouse only, max 3 deg); ripple also via `press()` |
| 5 | Animated tooltips, tickers on KPI deltas | Adopted: tooltip fade/slide, `Count quick` value tick, `Delta` ticks (`still` for tooltips) |
| 6 | Chart-type switch | Adopted for Trend (area/bars crossfade, bars grow from the baseline). River stacked/grouped rejected: not cheap, grouped bars would need a new layout |

Linked entities: tool (River bands, Tools table rows, Cost by tool bars, Funnel tool minis) and week (River columns, Exposure weekly columns). Trend hover is not linked (its buckets are window-aligned, not ISO weeks).

### 6b Built
- Motion math and store: `lib/motion.ts` (easing, stagger, link reducer, `barRects`). Fx host: `components/Fx.tsx`. CSS block at the end of `styles.css`.
- River: week columns now sit under the bands (before, the columns covered the bands and a band could not be hovered or clicked by pointer). Tool on a band, week on the empty space above the stack.
- Cost y-axis: gutter width follows the longest tick label (`padFor`), so the leading "$" no longer clips (LineChart and River).
- Map layout: sunburst-style fan in `lib/orbit.ts` (`shares`, rings by depth, angular budget proportional to subtree sessions, 3-radius stagger for crowded siblings). Fresh screenshot: no hairball, labels clear of nodes. The auth-service session cluster is still tight and the left third of the canvas is sparse.
- Tests: `__tests__/iter6b.test.ts` (10).
- Checks: tsc clean; vitest 208 passed; build 156.15 kB gzip (was 154.48, cap 165); contrast ok; no horizontal overflow at 320/375/414/768/1440 (15px at 768/1440 is the scrollbar).
- Reduced motion (emulated): `html.fx` absent, no tilt, bar transition 0s, tooltip and line-draw animation none, final state complete.
- Frame cost (150 synthetic pointermove/pointerover events at 16 ms spacing across Trend, bands and tool bars; dispatch to next macrotask incl. React work): median 0.4 ms, p95 3.3 ms, max 7.1 ms, 0 long tasks. rAF-based sampling was unreliable in the automation tab.
- Shots in `.../scratchpad/polish/iter-6/` (b- prefix). full-390 is two halves: `b-full-390-1.png`, `b-full-390-2.png`.

### 6b remaining
- Map: auth-service sessions cluster is still dense; canvas not perfectly centred. Consider capping sessions per project to 4 by default.
- Linked hover does not cover Trend, Friction dots or the legend.
- sloplint not run this round.

## Iteration 6 review scores

Data-viz 8.2, Product design 7.6, Power analyst 8.2, A11y/mobile/perf 7.9, Data-shape 8.2 (average 8.0).

Review summary (findings fixed in 6c, in priority order):
1. Cost share disagreed between "Where it went" and the map hotspot chips (auth-service $156.13 / 32% vs $143.90 / 14%): two selectors, two denominators, and a friction percent next to a cost share.
2. Loop Breaker headline said "no clear gain" while the CI excluded zero, and n=116 vs n=66 did not reconcile.
3. Trend overlays (dots, rings, crosshair, peak) detach from the line while it glides; bars lose the hollow partial-week mark; cost axis "$" clipped, ticks not round.
4. Card tilt on chart cards fights plot hover; `.rip-host` overrides `position`.
5. Count-up replays on tooltips and on ratios; KPI ticks should run once.
6. Linked hover fires for touch and pen, survives filter changes, announces on every hover.
7. River week columns unreachable by mouse; duplicate `<title>`.
8. Golden hours: cells coloured when none survive FDR; cramped intro and toggle.
9. Wrapped and Repeats: buried headline, duplicate aria-label, Esc swallowed Palette's, redundant sentence, truncated command slug, dollar claim not defensible.
10. Map: off-centre hub, dense labels, no legend, no reason beside disabled Apply, too many sessions per project.
11. Shapes retotal leaves streaks and commits stale; `missing` attention items on single-tool; engine badge on empty view; reduced-motion change not observed; Scorecard Cursor chip overlap.

## Iteration 6c

Built (all 11 review findings):
- One share selector (`lib/share.ts`) feeds Where it went, the Markdown summary and map hotspots; no-project row is not filterable; friction outlier needs 3+ sessions.
- Hotspots are per project and follow the map metric. Loop Breaker leads with a CI headline. Trend: cost ticks, y-axis padding, hollow partial bar. River week strip. Golden hours neutral when nothing clears the corrected bar.
- Fx: tilt on KPIs only, link hover pointer/focus-visible gated, Count plays once on first reveal, reduced-motion change listener.
- Wrapped: week headline first, streak last (6 cards max), no duplicate section label, Esc yields to the palette. Repeats: no duplicate sentence, whole-export chip, word-boundary slugs, textarea described-by.
- Map: hub centred, sessions capped at 4 per project, reason shown beside disabled Apply.
- Shapes: retotal recomputes streaks and scales commits_linked; missing-source attention dropped for single-tool; empty export hides as-of line and engine pill; scorecard cost tag no longer overlaps.

Checks: tsc clean; vitest 217 passed; build gzip 159.08 kB (cap 165); contrast ok; no horizontal overflow at 320/375/390/414/768/1440 (scrollWidth = innerWidth - 15 scrollbar).

6c remaining: sloplint not run; map hotspot labels can still touch when two hotspots sit close; map label cap (top 8) not added beyond the existing priority/collision pass.

## Iteration 7 (interactive 3D with a 2D toggle)

### Built
- Hour-of-week terrain: `dashboard/src/lib/terrain.ts` (orthographic projection, bar faces, painter order, picking, keyboard steps; reuses `orbit.clamp` and `calorbit` zoomAround / inertia / wrapYaw), `components/Terrain.tsx` (canvas 2D, `React.lazy` from `Time.tsx`), CSS block at the end of `styles.css`.
- Segmented "2D | 3D" (aria-pressed) in the Hour-by-weekday card; 2D stays the default. Hidden at <=480px (and forced back to 2D if the viewport narrows).
- Camera: orthographic (no perspective, so equal values are equal heights), default tilt 76 deg (near plan view), bars from a zero floor, rows stretched 2.2x for readable weekday labels. Drag = orbit, Ctrl/Cmd + wheel (plain wheel while focused) = zoom around the pointer, pinch, arrows rotate/tilt, +/- zoom, Esc / 0 / double-click / Reset button = home. Tooltips per cell, FDR-surviving cells outlined (Success mode), both Prompts and Success modes.
- Accessibility: canvas is a labelled group with a summary, aria-live line for view changes, the existing sr-only DataTable stays in both views. Reduced motion: no inertia, instant reset. rAF only runs during drag inertia or the reset animation; hover and key steps redraw once; no per-frame React state; loop cancelled on unmount.
- 6c remaining fixed: map resting labels capped at 8 (hotspots first, then by sessions; the rest appear on hover/focus) and the collision pass now keeps a 4 px gutter (`lib/labels.ts`, used by `Orbit.tsx`).
- Tests: `terrain.test.ts` (projection, equal heights near/far, zero baseline, hoverable zero cells, fit, picking, keys), `labels.test.ts`.

### Measured
- Build gzip 159.08 -> 164.06 kB total (limit 165). vite-plugin-singlefile inlines dynamic imports, so there is no separate chunk: the 3D code is +4.98 kB gz in the single HTML (React.lazy still defers its evaluation until toggled). A truly separate file is not possible in the single-file build.
- Per-frame draw (168 bars, 1440 viewport): median 0.3 ms, p95 0.4 ms, max 0.9 ms (read from `canvas[data-ms]` over 90 key-driven redraws).
- vitest 230 passed, tsc clean, contrast ok, overflow: scrollWidth < innerWidth at 320 / 390 / 1440.

### Ideas adopted / rejected
- Adopted: orthographic default over perspective (honest encoding), zero baseline, shared axis labels, outline reuse for FDR cells.
- Rejected: Funnel layers and cost-river ribbon in 3D (B, C): the first chart cost ~5 kB gz and the budget has ~1 kB left; also a ribbon needs stacked-area depth ordering that perspective-free views do not read better than 2D. Hash key `v3d`: optional, skipped (view mode is transient).
- Rejected: three.js or any dependency.

### Remaining
- B / C need a budget raise or trimming elsewhere (about 3 kB gz each at best). sloplint on `Terrain.tsx` reports only "no :focus-visible" (file-level false positive: the global `:focus-visible` rule is in `styles.css`). Map hotspot labels are collision-free by construction but a dense cluster still hides unlabelled nodes until hover. Full-390 shots are two half-height viewport captures (very tall page).
- Shots: scratchpad `polish/iter-7/`.

## Iteration 8 (live refresh and drilldown camera)

### Audit
- No polling existed: data is inlined into `index.html` at export; `serve` exports once. `dashboard.json` is written next to it and served same-origin, and `App` already swaps data in place through `onData` (the Engine tier switch), so the `StoreProvider` (filter, selection, scroll) survives a swap and `useMorph` glides Trend, River and Tools.
- Headroom: unused exports are tree-shaken already, dead CSS selectors: none; only one duplicate `@keyframes pa-draw` removed. No further trimming was needed (final 164.77 kB vs cap 165).

### Built
- Live: `refreshData` in `data/load.ts` re-reads `dashboard.json` on `focus` / `visibilitychange` (http(s) only, tab visible, at most every 20 s, only when `generated_at` changed; `file://` never fetches). Gate and freshness are pure in `lib/live.ts`. A changed export sets `html[data-pulse]` for 1 s: one 800 ms scale pulse on the KPIs and the "data as of" stamp (`.fx` only, so static under reduced motion). Browser run with a stubbed response: scroll stayed at 900, as-of text updated, attribute set then cleared.
- Drilldown camera: `Panel` in `components/Detail.tsx` records the last click (capture listener), and on open runs one WAAPI animation (280 ms, transform + opacity) from the clicked row/button to the panel via `flipFrom` (`lib/live.ts`). Skipped under reduced motion (`html.fx` absent) and below 700 px (bottom sheet). No per-frame React state. Close is instant; focus returns to the trigger, with the clicked element's nearest button/link as fallback when `activeElement` is `body` (verified: focus back on the row button after Esc).
- Tests: `__tests__/iter8.test.ts` (gate, freshness, flip math, zero-size safety).

### Measured
- tsc clean; vitest 234 passed; build gzip 164.06 -> 164.77 kB (cap 165); contrast ok.
- Overflow at 320/375/390/414/768/1440: scrollWidth = innerWidth - 15 (scrollbar) at every width.
- Reduced motion (emulated): `html.fx` absent, so no pulse, no FLIP.

### Remaining
- Mind map: hotspot labels no longer touch each other but the "2. infra" label can clip its last word at the canvas edge when zoom is 89%; auth-service label sits over a small node cluster. Needs a label-placement pass, not done.
- sloplint false positive on `Terrain.tsx` ("no :focus-visible") is file-level; the global `:focus-visible` rule lives in `styles.css`. Waived.
- Full-390 capture is two half-height shots (very tall page); header and drilldown shots at 390/320 taken instead.
- No exit animation for the panel (it unmounts on close). Live refresh only picks up changes if something re-exports while the server runs.
- Shots: scratchpad `polish/iter-8/`.
