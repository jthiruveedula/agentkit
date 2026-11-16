# ATLAS theme — design spec (2026-11-15)

Design pass for `docs/atlas-build-plan-2026-11-15.md`. Spec only. Paths are relative to
`packages/prompt-analytics/dashboard/src`.

## 0. Ground truth found in the tree
- Plumbing already exists (uncommitted): `lib/theme.ts` (`useTheme`, `setTheme`, `applyTheme`, key `pa.theme`),
  `ThemeSwitch` in `components/Shell.tsx`, and `main.tsx` imports `components/atlas.css` (currently 0 bytes).
  `atlas.css` must stay the LAST stylesheet import so equal-specificity rules win.
- Specificity: `:root[data-theme="atlas"] .x` is (0,3,0); it beats every `html.glass .x` (0,2,1) rule without `!important`.
  The only `!important` needed is where TSX writes an inline `background` (heatmap cells, section 2.3).
- "Mind map" is rendered by `Sunburst.tsx` (`.sb-*` arcs), not a node-link graph. See flags.
- `scripts/contrast.mjs` reads only the first `:root {` block of `styles.css` and `mix.css`; it does not see `atlas.css`.
  The ratios below were computed with the same WCAG formula. Extending the script to ATLAS is a build task, not a design one.

### Flags: what the brief asks for that the code does not have
| Brief item | Reality | Decision |
|---|---|---|
| Stamps "SWEET SPOT", "BEST FIT" | Neither string exists anywhere. Model fit verdicts are `td[data-fit="ok\|over\|under"]` with text `matched / oversized / undersized` | Stamp the existing words. Do not add the invented labels |
| Stamps "HIGH / MED / LOW" | No priority field. Do next rows carry `.tag.bad\|warn\|info\|good` whose text is `r.impact` | Stamp styling on the existing impact text, colour by tone class. No HIGH/MED/LOW text |
| Summit marker "Peak Wed 12:00" | Already data-driven: `Rhythm.tsx` renders `Peak <b>{DOW[best.dow]} {best.hour}:00</b>, {n} prompts` in `.rh-go` | Style `.rh-go` as the summit label. Never hardcode the slot |
| "STRUGGLED" stamp per session | Rows render only `r.applied` (`yes/no`). `struggled(r)` exists in `lib/filter.ts:32` but is not in the row markup | One attribute in TSX (section 2.12). No new computation |
| Survey network with triangulation markers | Sunburst arcs, hub, numbered hotspot callouts | Restyle the sunburst; hotspot callouts become triangulation markers |
| Mind map "top topic as flagged summit" | Rank 1 hotspot is `.sb-call` whose `.sb-rank` text is `1`; CSS cannot select by text | `calls` order is a layout order, not guaranteed rank order: add `data-rank={c.x.rank}` on `g.sb-call` (`Sunburst.tsx:230`) and select `[data-rank="1"]` |
| Colour words in copy | `Rhythm.tsx` Heat aria-label says "purple quiet to yellow busy"; `Time.tsx` ramp aria-label says "grey ... blue"; `Time.tsx:195` summary says "Amber bars" | Branch these three strings on `useTheme()` (section 2.3, 2.15). Otherwise ATLAS lies to screen readers |

## 1. Tokens
Paste as the first rule of `components/atlas.css`. All hex. `--sans`, `--mono`, spacing tokens are inherited unchanged.

```css
:root[data-theme="atlas"] {
  /* paper + ink */
  --bg: #f6efdd; --surface: #fbf6e9; --sunk: #ede3c9; --line: #d8c9a6; --line-2: #8f7a52;
  --ink: #2b2118; --muted: #62523f; --prior: #8a7c66;
  --accent: #2e4a7a; --accent-ink: #fbf6e9; --accent-soft: #dde3e2;
  /* status */
  --good: #1f6f6b; --good-ink: #185a57; --good-soft: #d3e3dd;
  --warn: #a87424; --warn-ink: #74500f; --amber: #b27b25;
  --bad: #a83a26; --bad-ink: #8a2c1b; --bad-soft: #f1d9cc;
  --warn-secret: #1f6f6b; --warn-pii: #a87424; --warn-phi: #7d3f66;
  /* categorical: no red, no ochre (reserved for status) */
  --s1c: #2e4a7a; --s2c: #1f6f6b; --s3c: #7a4a80; --s4c: #5f7a34; --s5c: #7d7263;
  --s6c: #3f6f8f; --s7c: #8a4a68; --s8c: #6b6a2c; --s9c: #4a4470;
  --src-claude_code: #2e4a7a; --src-copilot: #3f7a4f; --src-cursor: #2f7689;
  --src-opencode: #7a4a80; --src-antigravity: #6e2f4a; --src-other: #7d7263;
  --t0: #2e4a7a; --t1: #1f6f6b; --t2: #7a4a80; --t3: #5f7a34; --t4: #3f6f8f;
  --t5: #8a4a68; --t6: #6b6a2c; --t7: #7d7263; --t8: #4a4470;
  /* overview widget chips */
  --w1-bg: #f1d9cc; --w1-ink: #8a2c1b; --w2-bg: #d9dfe6; --w2-ink: #2e4a7a; --w3-bg: #e4d8df; --w3-ink: #6a3f70;
  --w4-bg: #f0dfb9; --w4-ink: #74500f; --w5-bg: #d3e3dd; --w5-ink: #185a57; --w6-bg: #dde3c8; --w6-ink: #4c6327;
  /* mix.css marks */
  --tier0: #748cb1; --tier1: #2e4a7a; --tier2: #1b2c4d;
  --kx-ci: #6f87ad; --kx-trk: #8a7c66; --kx-rest: #6a82a8; --kx-o2: #4a3c2d; --kx-o3: #62523f;
  /* no glass, no shadows: hairlines only */
  --shadow: none; --gshadow: none; --rim: #d8c9a6; --solid: #fbf6e9;
  --wall-min: #f6efdd; --gfloor: 1; --rw: 3px; --r1: 2px; --r2: 2px; --r3: 3px;
  --hatch: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Cpath d='M0 6L6 0' stroke='%238f7a52' stroke-width='1'/%3E%3C/svg%3E");
  /* new */
  --serif: Georgia, 'Times New Roman', serif;
  --rule: #c9b78f;            /* sepia hairline: decorative rules and dotted trails */
  --brick: #a83a26; --brick-ink: #8a2c1b; --teal: #1f6f6b; --ochre: #b9822e; --inkblue: #2e4a7a;
  --contour: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='240' fill='none' stroke='%23c9b78f' stroke-width='.6' opacity='.45'%3E%3Cpath d='M-10 60C50 20 110 90 170 55s110-40 170 5M-10 100C60 60 110 130 180 95s100-35 160 10M-10 150C40 120 120 185 190 145s90-30 150 15M-10 200C70 165 130 235 200 195s80-25 140 20M60 20c30-18 70-10 80 12s-20 40-55 36S35 40 60 20z'/%3E%3C/svg%3E");
  --compass: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23fbf6e9' stroke='%232b2118'/%3E%3Ccircle cx='16' cy='16' r='10.5' fill='none' stroke='%23c9b78f' stroke-dasharray='1 2.3'/%3E%3Cpath d='M16 3l3 13-3 13-3-13z' fill='%232b2118'/%3E%3Cpath d='M16 3l3 13h-6z' fill='%23a83a26'/%3E%3Cpath d='M3 16l13-2.2L29 16l-13 2.2z' fill='none' stroke='%232b2118' stroke-width='.8'/%3E%3Ccircle cx='16' cy='16' r='1.6' fill='%23fbf6e9' stroke='%232b2118'/%3E%3C/svg%3E");
}
```

Both data URIs together are about 1.1 KB raw. Do not add more image assets; everything else is borders and gradients.

### Contrast (WCAG 2.x ratio; columns are the background)
Text tokens, minimum 4.5:

| Token | Hex | paper `#f6efdd` | surface `#fbf6e9` | sunk `#ede3c9` | other |
|---|---|---|---|---|---|
| `--ink` | `#2b2118` | 13.73 | 14.59 | 12.32 | accent-soft 12.12, bad-soft 11.65, tier0 4.60 |
| `--muted` | `#62523f` | 6.54 | 6.96 | 5.87 | accent-soft 5.78, w4-bg 5.70 |
| `--accent` | `#2e4a7a` | 7.70 | 8.19 | 6.91 | accent-soft 6.80 |
| `--good-ink` | `#185a57` | 6.94 | 7.37 | 6.23 | good-soft 5.99 |
| `--warn-ink` | `#74500f` | 6.32 | 6.72 | 5.67 | w4-bg 5.51 |
| `--bad-ink` / `--brick-ink` | `#8a2c1b` | 7.45 | 7.92 | 6.69 | bad-soft 6.32 |
| `--bad` / `--brick` | `#a83a26` | 5.55 | 5.90 | 4.98 | bad-soft 4.71 |
| `--accent-ink` on `--accent` | `#fbf6e9` | | | | 8.19 |
| white on `--tier1` / `--tier2` | | | | | 8.84 / 13.87 |
| `--kx-o2` / `--kx-o3` | `#4a3c2d` / `#62523f` | | 9.85 / 6.96 | | |
| `--w1..6-ink` on own `-bg` | | | | | 6.32, 6.58, 5.94, 5.51, 5.99, 5.09 |

Brick `#a83a26` passes 4.5 on all three papers (4.98 worst case) but only 4.71 on `--bad-soft`. Rule: text under 14px and
all stamp text uses `--brick-ink`/`--bad-ink`; `--brick` is for marks, rules, numerals 16px and larger. `styles.css` uses
`color: var(--bad)` for small text in `.so .bad`, `.kd[data-tone="bad"]`, `.todo .tag.bad`: override those three to `--bad-ink`.

Mark tokens, minimum 3 (paper / surface):

| Token | Ratio | Token | Ratio | Token | Ratio |
|---|---|---|---|---|---|
| `--good` | 5.17 / 5.49 | `--s1c` `--t0` `--src-claude_code` | 7.70 / 8.19 | `--s6c` `--t4` | 4.72 / 5.01 |
| `--warn` `--warn-pii` | 3.53 / 3.75 | `--s2c` `--t1` | 5.17 / 5.49 | `--s7c` `--t5` | 5.62 / 5.97 |
| `--bad` | 5.55 / 5.90 | `--s3c` `--t2` `--src-opencode` | 5.87 / 6.24 | `--s8c` `--t6` | 4.92 / 5.23 |
| `--amber` | 3.18 / 3.38 | `--s4c` `--t3` | 4.24 / 4.50 | `--s9c` `--t8` | 7.78 / 8.27 |
| `--prior` `--kx-trk` | 3.55 / 3.77 | `--s5c` `--t7` `--src-other` | 4.11 / 4.36 | `--src-copilot` | 4.46 / 4.74 |
| `--line-2` | 3.61 / 3.84 | `--warn-phi` | 6.60 / 7.01 | `--src-cursor` | 4.49 / 4.78 |
| `--kx-ci` | 3.19 / 3.39 | `--kx-rest` | 3.41 / 3.62 | `--src-antigravity` | 8.44 / 8.97 |
| `--tier0` | 2.99 / 3.18 | | | | |

Known limits, all deliberate:

- `--tier0 #748cb1` has to hold ink text (4.60) and be a 3:1 mark; that window is one hex wide. It passes on `--surface`
  (3.18), where the tier bar lives inside a `.kt` tile, and is 2.99 on bare paper. Never draw it on `--bg`.
- `--ochre #b9822e` (the brand ochre) is 2.91 on paper, 3.09 on surface: fills and stamps-with-ink-text only
  (ink on ochre 4.72). `--warn` and `--amber` are the darkened mark variants.
- `--amber` on `--accent` is 2.42 (Classic checks that pair for the logo dot). In ATLAS the logo is the compass, so the
  pair does not occur. Builder: grep `var(--amber)` and confirm no other amber-on-accent use.
- `--line #d8c9a6` and `--rule` are decorative hairlines (about 1.5:1), same role as Classic `--line`.
- `--line-2` is darker than Classic on purpose: with shadows gone it is the only control boundary, so it meets 3:1.

## 2. Per-section treatments
Every selector below is prefixed with `:root[data-theme="atlas"]` in `atlas.css`; the prefix is omitted here.
Write `A` for it in the snippets.

### 2.0 Global sheet
- `html, body { background: var(--bg) var(--contour) }`; `body::before { background: none; -webkit-backdrop-filter: none; backdrop-filter: none }`
  kills the glass wallpaper (`styles.css:797`).
- One rule removes blur everywhere it is set: `.card, .kpi, .w, .top, .rail, .pop, .morebox, .prefs, .mm-side, .xs, .brief { -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: none; background: var(--surface); border: 1px solid var(--rule); }`.
- `.card` gets a double rule: `outline: 1px solid var(--line); outline-offset: 3px` is NOT allowed (collides with focus ring).
  Use `border: 1px solid var(--rule)` plus `box-shadow: inset 0 0 0 3px var(--surface), inset 0 0 0 4px var(--line)`.
- Serif display: `.sec-h h2, .card-h h3, .top h1, .kt .val, .w-n, .b-num, .mm-big b, .val, .todo .num, .todo h4 { font-family: var(--serif); letter-spacing: 0 }`.
  Keep `font-variant-numeric: tabular-nums lining-nums` so Georgia's old-style figures do not break column alignment.
- `.sec-h { border-bottom: 3px double var(--rule) }`. `.sec-h h2::before { content: "§ "; color: var(--brick) }` is decorative; skip if it reads aloud badly in QA.
- `.btn { background: var(--surface); border-color: var(--line-2) }`, `.btn.primary, .todo .btn.primary { background: var(--inkblue); border-color: var(--inkblue); color: var(--accent-ink) }` (replaces the blue gradient at `govern.css:29`).
- `.tbl tbody tr:nth-child(even) { background: none }`, `.tbl th, .tbl td { border-bottom-color: var(--rule) }`.
- `:focus-visible` already uses `--accent`: ink blue on paper is 7.70. No change.
- Stamp primitive, reused by 2.5 to 2.13. One rule, selectors appended to it:

```css
A :is(.todo .tag, td[data-fit] span, td[data-out]::after, .srow [data-out], [data-sg] .ti::after, .xs .tag[data-cat], .sg td[data-hi], .play-e) {
  display: inline-block; padding: 0 6px; height: auto; border: 1.5px solid currentColor; border-radius: 2px;
  background: none; box-shadow: none; font: 700 10px/16px var(--sans); letter-spacing: .08em; text-transform: uppercase;
  rotate: -2deg; color: var(--brick-ink);
  mask: radial-gradient(circle at 30% 40%, #000 60%, #000c 61%) 0 0 / 5px 5px;   /* worn-ink grain, 1 line */
}
```
  Colour modifiers set only `color` (border follows via `currentColor`): good `--good-ink`, warn `--warn-ink`,
  bad `--brick-ink`, info `--ink`. All four are 5.67 or better on every paper. Stamps keep the existing text; no text is added except 2.12.

### 2.1 Header cartouche + compass (`Shell.tsx`, `.top`, `.brand`, `.glyph`)
- `.top { background: var(--surface); border-bottom: 3px double var(--line-2) }`.
- `.brand-t h1 { font: 700 21px/26px var(--serif) }`; cartouche bracket rules: `.brand-t { padding: 2px 12px; border-inline: 1px solid var(--rule) }`
  with `.brand-t::before, .brand-t::after` as 5px corner ticks (absolute, `border-top/bottom: 1px solid var(--line-2)`).
  `.brand-t` is `position: relative` already and its popover hangs from it; give the pseudo-elements `pointer-events: none`.
- `.top-meta > * + * { border-left-color: var(--rule) }`; `.top-meta .count { color: var(--inkblue) }`.
- `.top-tools { background: var(--sunk); border-color: var(--rule) }`; pressed segment keeps `box-shadow: 0 0 0 1px var(--line-2)` (re-enable for this selector after the global shadow reset).
- Compass mark, CSS only, no TSX: `.glyph { background: var(--compass) center / contain no-repeat } .glyph > * { display: none }`.
  The `<svg class="glyph">` root is a CSS box, so a background paints. It sits in `.rail .brand` (top-left of the sheet).
  On widths where the rail is a drawer (`max-width: 819px`), repeat it in the header:
  `.top-id .navbtn + .brand-t { padding-left: 38px; background: var(--compass) 8px 50% / 24px no-repeat }`.
- `.brand b { font: 700 15px var(--serif); letter-spacing: .02em }`.
- Motion: needle settle is not available CSS-only on a background image. Skip; the header is static.

### 2.2 Sidebar "ATLAS INDEX" (`nav.side`, `.grp`, `.nv`, `.ic`, `.nl`)
- `.rail { background: var(--bg); border-right: 1px solid var(--line-2) }`.
- `.side::before { content: "Atlas index"; display: block; padding: 6px 8px; font: 700 10px/14px var(--sans); letter-spacing: .18em; text-transform: uppercase; color: var(--muted); border-block: 1px solid var(--rule) }`.
  Hide it when the rail is collapsed (same condition that hides `.nl`; reuse that selector from `styles.css` near line 650).
- `.grp h2 { font: italic 700 13px/18px var(--serif); color: var(--ink); text-transform: none; letter-spacing: 0 }`.
- `.side .ic { background: none; box-shadow: none; border-radius: 0; color: var(--muted) }` (drops the per-group `--h` hue at `styles.css:657`).
- `.nv[aria-current] { background: none; color: var(--ink); font-weight: 700; box-shadow: inset 2px 0 0 var(--brick) }`, `.nv[aria-current] .ic { color: var(--brick) }`.
- Index leader: `.nl { flex: 1; background: radial-gradient(circle, var(--rule) 1px, #0000 1.2px) 100% 85% / 6px 3px repeat-x }` is optional; drop it if labels wrap.
- Real labels and group structure untouched.

### 2.3 Overview strip = "Top story — field readings" (`.hero .strip > .w[data-w="1..6"]`)
Strip heading: there is no visible strip title element (`h2#s-overview-h` is `sr-only`). CSS-only caption:
`.strip::before { content: "Top story — field readings"; grid-column: 1 / -1; font: italic 13px/18px var(--serif); color: var(--muted); border-bottom: 1px solid var(--rule) }`.
This adds one grid row; at the `<420px` scroll-snap layout (`grid-auto-flow: column`) set `display: none` on it.
If QA dislikes generated content here, the alternative is one `<p className="strip-h" aria-hidden>` in `Overview.tsx:236`.

Common: `.w { border: 1px solid var(--rule); border-radius: 2px; background: var(--surface) }`, `.w-ic { background: none; border: 1px solid var(--w-ink); border-radius: 50% }`,
`.w-t { font: 700 10px/16px var(--sans); letter-spacing: .1em; text-transform: uppercase }`, `.w-n { font: 700 26px/28px var(--serif) }`,
`.w .chip { border-radius: 2px; background: none; border: 1px solid var(--rule) }`, `.w .chip.bad { color: var(--bad-ink); border-color: var(--brick) }`, `.w .chip.good { color: var(--good-ink); border-color: var(--teal) }`.

| # | Widget | Selectors | Treatment |
|---|---|---|---|
| 1 | Compass-dial struggle gauge | `.gauge .g-track`, `.g-fill`, `.g-s0/.g-s1/.g-s2`, `.g-ndl`, `.g-hub`, `.g-was`, `.b-ring` | Track: `stroke: var(--rule); stroke-width: 9; stroke-dasharray: 1 5; stroke-linecap: butt` (bearing ticks). Fill: `stroke-width: 3`, stops teal `#1f6f6b` / ochre `#b9822e` / brick `#a83a26`. Needle `stroke: var(--brick); stroke-width: 2`; hub `fill: var(--surface); stroke: var(--ink)`. `.g-was { stroke: var(--ink); stroke-width: 1.5 }` (notch). Keep `stroke-linecap` of `.g-fill` as is: `pa-ring` depends on its dash setup |
| 2 | Route-line sparkline | `.sp`, `.sp-l`, `.sp-a`, `.sp-was`, `.sp-d` | `.sp-l { stroke-width: 1.5; stroke-dasharray: none }` in `--sp` (bad = brick, good = teal via tokens). `.sp-a { opacity: .06 }`. `.sp-was { stroke: var(--line-2); stroke-dasharray: 1 3 }`. `.sp-d` becomes the survey dot: `width/height: 9px; margin: -4.5px; background: var(--surface); box-shadow: 0 0 0 1.5px var(--sp), 0 0 0 4px var(--surface)`. Only one dot exists (the last point); intermediate survey dots would need new SVG nodes: do not add |
| 3 | Elevation-tint heatmap | `.hm i`, `.hm-k i` | Cells take an inline `background: viridis()`. TSX (`Rhythm.tsx`, `Heat`): add `"--v": x.v / peak` to the existing style object (one token). CSS: `.hm i[style] { background: color-mix(in oklab, #a8683a calc(var(--v) * 100%), #dfe3c4) !important; box-shadow: none }` (lowland sage to sienna); zero cells keep `--sunk`. `.hm-k i { background: linear-gradient(90deg, #dfe3c4, #d9c184, #a8683a) }`. Branch the aria-label colour words on `useTheme()` |
| 4 | Serif cost figure | `.w.cost .w-n`, `.w.cost .w-c` | `.w-n { font-size: 32px; line-height: 34px }`; `.w-c { font-style: italic; border-top: 1px solid var(--rule) }` (footnote line). Value is `usd(c.value)` from insights: untouched |
| 5 | Dot-survey Why grid | `.wd i`, `.ud-r[data-r="now"] .wd i[data-on]`, `.ud-r[data-r="prior"] .wd i[data-on]`, `.w-fix`, `.story` | Off dots: `background: none; box-shadow: inset 0 0 0 1px var(--line-2)` (open survey point). On, now: `background: var(--brick)`. On, prior: `background: var(--prior)`. `.w-fix { color: var(--inkblue) }` |
| 6 | Shaded-relief terrain | `.rh-plot`, `.rh-2d i`, `.rh-2d i[data-top]`, `.rh-go` | 3D: palette in section 4. 2D fallback: `.rh-2d i { background: color-mix(in oklab, #a8683a calc(var(--v) * 100%), #dfe3c4) }`, `[data-top] { background: var(--brick) }`. Summit label: `.rh-go { color: var(--ink); font-family: var(--serif) } .rh-go::before { content: "▲ "; color: var(--brick) }`, `.rh-go b { color: var(--brick-ink) }`. Text stays the existing data string |

The brief panel above the strip (`.brief`, `.b-top`, `h3#ov-hd`, `.b-acts`): `h3 { font: 700 22px/28px var(--serif) }`,
`.brief[data-tone="bad"] { border-left: 3px solid var(--brick) }`, `[data-tone="good"]` teal, `flat` `--line-2`.
Drivers list (`.drv`, `.dv i`, `li[data-tone]`): bars in brick / teal via tokens; `.drv-why` becomes a small stamp (append to the stamp rule, colour `--ink`).

### 2.4 Key numbers = map-legend table (`ul.kpis > li.kt[data-kpi]`, `mix.css:34-103`)
- `.kpis { gap: 0; border-block: 3px double var(--rule) }`, `.kt { background: none; border: 0; border-radius: 0; border-right: 1px solid var(--rule) }`, last child no rule.
  When the grid wraps, vertical rules misalign; add `border-bottom: 1px solid var(--rule)` and accept a full grid of hairlines.
- `.kt .lbl { font: 700 10px/14px var(--sans); letter-spacing: .12em }` (already uppercase), `.kt .ti { background: none; border-radius: 0 }` (legend symbol, colour from `--ic`).
- `.kt .val { font: 700 clamp(28px, 22cqi, 46px)/1.1 var(--serif) }`. Check `cqi` overflow at the narrowest tile; `white-space: nowrap` is set, so cap at 46px.
- `.kt .sub, .kt .kpi-note, .kg-l { font-size: 12px; font-style: italic; border-top: 1px dotted var(--rule); padding-top: 4px }` (footnote lines).
- `.kd > span:first-child { background: none; border-radius: 0; padding: 0 }`; `.kd[data-tone="bad"] { color: var(--bad-ink) }`.
- `.kt[data-primary]`: `box-shadow: inset 0 2px 0 var(--brick)`.
- Tilt: `Fx.tsx` sets `data-tilt` on `.kpi`. Neutralise: `.kpi[data-tilt] { transform: none }` (paper does not tilt). Ripple can stay.
- Tier bar and meters (`.tb-0..2`, `.meter .m-on/.m-off/.m-rest`, `.kx-t`) recolour through `--tier*` / `--kx-*`. `.mlg-sw[data-hatch]` uses `--hatch` (remapped).

### 2.5 Rubber-stamp badges: which existing classes carry verdicts
| Meaning | Element | Existing hook | Stamp colour |
|---|---|---|---|
| Do next impact (the only priority signal) | `.todo .tag` | class `bad` / `warn` / `info` / `good` | brick-ink / warn-ink / ink / good-ink |
| Model fit verdict | `.mf-mx td[data-fit] span` | `data-fit="ok"` / `over` / `under` | good-ink / warn-ink / brick-ink |
| KPI delta verdict | `.kd[data-tone]` | `good` / `bad` / `grey` | text colour only, no stamp box (too many per row) |
| Brief verdict | `.brief[data-tone]`, `.drv li[data-tone]` | `bad` / `good` / `flat` | left rule colour |
| Tool status | `.tbl.sc .tag[data-st]` | `degraded` / `missing` | warn-ink stamp; other statuses stay plain tags |
| Exposure category | `.xs .tag[data-cat]`, `.chip[data-cat]` | `secret` / `pii` / `phi` | teal / warn-ink / `#7d3f66` |
| Playbook effect | `.play-e`, `.play[data-dir="less"] .play-e` | `data-dir` | good-ink / warn-ink |
| Session outcome | see 2.12 | new `data-out`, `data-sg` | good-ink / brick-ink |

Non-verdict `.tag` (intent, "all sessions", "not priced") stays a flat label: `.tag { background: none; border: 1px solid var(--rule); border-radius: 2px }`.
Do not stamp them; a page of stamps reads as noise.

### 2.6 Do next = expedition itinerary (`#s-next ol.todo > li`, `govern.css:13-29`)
- `.todo { gap: 0; position: relative }`, `.todo li { background: none; border: 0; border-radius: 0; border-bottom: 1px solid var(--rule); padding-left: 44px; position: relative }`.
- Trail: `.todo::before { content: ""; position: absolute; left: 21px; top: 16px; bottom: 16px; border-left: 2px dotted var(--line-2) }`.
- Waypoint: `.todo .num { position: absolute; left: 8px; top: 10px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); border: 1.5px solid var(--ink); font: 700 13px var(--serif); color: var(--ink); text-align: center }`.
  First row: `li:first-child .num { background: var(--brick); border-color: var(--brick); color: var(--accent-ink) }` (paper on brick 5.90).
- `.todo h4 { font: 700 15px/20px var(--serif) }`; `.todo .tag` is the stamp. `.todo .tag { white-space: normal }` exists: with long impact text set `rotate: 0` when it wraps? CSS cannot detect wrap; use `rotate: -1deg` for `.todo .tag` only.
- Disable the hover lift: `html.fx .todo li:hover { transform: none }` (`govern.css:95`).
- The `li` grid has 4 columns starting with `.num`; taking `.num` out of flow leaves an empty first track. Set `grid-template-columns: minmax(0, 1fr) auto auto` and `details { grid-column: 1 / -1 }`.

### 2.7 Mind map = survey network (`Sunburst.tsx` `.sb-*`, `MindMap.tsx` `.mm-*`, `mindmap.css`)
- Arcs: `.sb-arc { stroke: var(--surface); stroke-width: 1px }`; fills come from `--src-*` tokens (remapped). `.sb-rim { stroke: var(--line-2); stroke-dasharray: 1 4 }` (graticule ring).
- Hub: `.sb-disc { fill: var(--surface); stroke: var(--ink) }`, `.sb .sb-n { font-family: var(--serif) }`.
- Struggle rings: `.sb-edge` (the red outer edge) `fill: var(--brick)`; `.sb-hot { stroke: var(--brick); stroke-width: 1.5px; stroke-dasharray: 2 2 }`.
- Triangulation markers: `.sb-call polyline { stroke: var(--ink); stroke-width: 1px; stroke-dasharray: 3 2 }`, `.sb-call circle:not(.sb-badge) { fill: var(--ink) }`,
  `.sb-call .sb-badge { fill: var(--surface); stroke: var(--ink); stroke-dasharray: none }`, `.sb .sb-rank { font: 700 10px var(--sans); fill: var(--ink) }`.
  A true triangle marker needs a different SVG shape; a ringed station dot is the CSS-only equivalent. Do not change the geometry.
- Flagged summit: `.sb-call[data-rank="1"] .sb-badge { fill: var(--brick); stroke: var(--brick) }` + `.sb-rank { fill: var(--accent-ink) }` (needs the `data-rank` attribute, see flags).
- Inspector as field notes: `.mm-side { background: var(--surface) repeating-linear-gradient(#0000 0 19px, var(--line) 19px 20px); border: 1px solid var(--rule); border-left: 3px double var(--brick) }`,
  `.mm-detail p, .mm-note { line-height: 20px }` (sits on the ruled lines), `.mm-nm { font: 700 16px/20px var(--serif) }`, `.mm-big b { font-family: var(--serif) }`, `.mm-eye { letter-spacing: .1em; text-transform: uppercase; font-size: 10px }`.
  Body copy stays sans at its current size; do not use a script or italic face for data text.
- `.mm-track i { background: var(--inkblue) }`, `.mm-track[data-bad] i { background: var(--brick) }`, `.mm-kid:hover { background: var(--sunk) }`.
- Legend keys (`.mm-key .k-arc::before`, `.k-tone::before`, `.k-heat::before`, `.hatch::before`) read tokens; verify `.k-heat` shows brick.

### 2.8 What works = field-notebook plates (`.play`, `.play-grid`, `.forest .fr`, `table.best`, `.dbt`)
- `.play { border: 1px solid var(--rule); border-radius: 2px; background: var(--surface); box-shadow: inset 0 0 0 3px var(--surface), inset 0 0 0 4px var(--line) }` (plate frame); `.play[data-on] { background: var(--accent-soft); border-color: var(--inkblue) }`.
- Plate number, CSS counter, no data: `.plays { counter-reset: pl } .play { counter-increment: pl } .play-h b::before { content: "Pl. " counter(pl) " "; font: italic 12px var(--serif); color: var(--muted) }`.
  This is an ordinal of list position, not a metric. Drop it if the list is filter-reordered in a way that makes "Pl. 3" misleading.
- `.play-col h4 { font: italic 700 14px var(--serif) }`, `.play-ci i, .play-ci em { background: var(--inkblue) }`, `.play-c { color: var(--warn-ink) }`.
- Forest rows: `.fr { border-bottom: 1px dotted var(--rule); border-radius: 0 }`, `.fr[data-on] { background: var(--accent-soft) }`.
- `table.best td { border-top: 1px solid var(--rule) }` (replaces the white `oklch(1 0 0 / .7)` rule at `govern.css:43`), `.best .link { border-radius: 2px; background: none; border: 1px solid var(--rule) }`.

### 2.9 Model fit = ruled ledger (`ModelFit.tsx`: `.mf-kpis .kpi`, `table.mf-mx td[data-fit]`, `.mf-recs`)
- `.mf-mx { border-block: 2px solid var(--ink) }`, `.mf-mx th, .mf-mx td { border-bottom: 1px solid var(--rule); border-right: 1px solid var(--line) }`, first column `border-right: 3px double var(--brick)` (ledger margin rule).
- `td[data-fit] b { font: 700 18px var(--serif) }`, `td[data-fit] span` = stamp (2.5). Cell tint off: `td[data-fit] { background: none }`; `--c` stays for any swatch.
  `[data-fit="over"] { --c: var(--warn) }` (Classic uses `--amber`; `--warn` is the safer mark on paper).
- `.mf-kpis .kpi { background: none; border: 0; border-bottom: 1px solid var(--rule); border-radius: 0 }`, `.val` serif.
- `.mf-recs li { border-bottom: 1px dotted var(--rule) }`.

### 2.10 Tools = field-guide catalog rows (`Tools.tsx`: `table.tbl.sc`, `.mx.rt .cell`, `.tag[data-st]`)
- `.tbl.sc tbody tr { border-bottom: 1px solid var(--rule) }`, `.tbl.sc th[scope="row"] { font: 700 14px var(--serif) }`, tool logo left with a `--src-*` 2px rule: `tbody tr { box-shadow: inset 2px 0 0 var(--rule) }`.
- `.tbl thead th { font: 700 10px var(--sans); letter-spacing: .1em; text-transform: uppercase; border-bottom: 2px solid var(--ink) }` (applies to every `.tbl`; put it in 2.0).
- Matrix `.mx .cell`: fills are `color-mix(var(--accent) ..., var(--sunk))`: remap gives ink-blue on parchment, fine. `.cell[data-low]` hatch via `--hatch`. `.cell[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--brick) }`.

### 2.11 Exposure = hazard register (`Exposure.tsx`, `ReviewQueue.tsx`: `.rq`, `.xsum i[data-cat]`, `.xl`, `section.xs`, `.xk .tag[data-cat]`, `.rq-pages`)
- `.xs { background: none; border: 0; border-top: 1px solid var(--rule); border-left: 3px solid var(--c, var(--line-2)); border-radius: 0 }`.
  `--c` is set by `[data-cat]` (`govern.css:10`); `.xs` itself has no `data-cat`, so the left rule is `--line-2` unless a child sets it. Use `.xs:has(.tag[data-cat="secret"])` etc. only if `:has` is already used in the codebase (it is: `mindmap.css` `.sb:has(...)`).
- `[data-cat="secret"] { --c: var(--teal) }` (Classic hardcodes `oklch(0.52 0.09 195)` at `govern.css:10`; override so it tracks the token).
- `.xsum` bar and `.xl` key: token colours. `.xl b { font-family: var(--serif) }`. Category tags = stamps.
- Register numbering via counter: `.rq { counter-reset: hz } .xs { counter-increment: hz } .xs > :first-child::before { content: "No. " counter(hz) }` is optional and resets per page of `.rq-pages`; skip it (page 2 would restart at 1 and mislead).

### 2.12 Sessions = log book with APPLIED / STRUGGLED stamps (`Sessions.tsx`)
What indicates the outcome today: `r.applied` only, rendered as plain text `yes` / `no` in the last `<td className="hide-s">` (line 98)
and `applied` / `not applied` in `.srow .l3` (line 48). Nothing marks struggled; `td.cx[data-hi]` is `friction > 0.5`, which is only one arm of
`struggled()` (`lib/filter.ts:32`: `struggle_p >= 0.5`, else `loops >= 3 || friction >= 0.5`).

TSX, three attributes, no new elements, Classic output unchanged:

1. Line 98, the applied cell: `<td className="hide-s" data-out={r.applied ? "applied" : undefined}>`.
2. Line 90, `<tr ... data-sg={struggled(r) || undefined}>` (import `struggled` from `../lib/filter`).
3. Line 46-48, `.srow`: `data-sg={struggled(r) || undefined}` on the row button and `data-out` on the existing applied `<span>` in `.l3`.

CSS:

- `td[data-out] { font-size: 0 } td[data-out]::after { content: "applied"; color: var(--good-ink) }` + stamp rule. Cells without `data-out` keep the plain `no`.
- `tr[data-sg] th.ti::after, .srow[data-sg] .ti::after { content: "struggled"; margin-left: 8px; color: var(--brick-ink); vertical-align: 1px }` + stamp rule.
  A session can be both applied and struggled; both stamps show. That is correct, not a conflict.
- `.srow .ti` is a 2-line `-webkit-box` clamp: the `::after` can be clipped. For `.srow` put the stamp on `.l1::after` instead.
- Stamps are 16px line-height inside 32px rows: row height must not change. With `rotate: -2deg` keep `overflow: visible` on the cell.
- Log-book rules: `.tbl.sess tbody tr { background: none }`, `.tbl.sess td, .tbl.sess th { border-bottom: 1px solid var(--rule) }`, `.tbl.sess td:first-child { border-right: 3px double var(--brick); font-family: var(--serif) }` (date margin).
  `.tbl tbody tr[data-sel], .srow[aria-current] { background: var(--accent-soft) }`. `.fbar { background: var(--brick) }`.
- Hidden `hide-s` column on small screens hides the APPLIED stamp there; the `.srow` list covers that layout.

### 2.13 Funnel = terraced steps (`Funnel.tsx`: `BarList cascade` rows `.bar-row`, `.bar-t i`, `ul.drops .chip`, `.minis .mini`, `table.tbl.nv`)
- Bars are `.bar-t i` with `width: calc(var(--w) * 100%)` and `color: "var(--accent)"`. Terrace: `.bar-t { height: 14px; background: none; border-radius: 0; border-bottom: 1px solid var(--line-2) }`,
  `.bar-t i { border-radius: 0; background: var(--c, var(--accent)) repeating-linear-gradient(90deg, #0000 0 7px, #fbf6e940 7px 8px) }` (contour hachure on each step).
  Scope with `.bars[data-cascade]` (emitted by `BarList cascade`, `ui.tsx:107`) so other bar lists keep 8px bars.
- Step tint by position, lightening downhill: `.bar-row:nth-child(n) .bar-t i { opacity: calc(1 - (n - 1) * .12) }` written out for 5 rows. Ink-blue at 0.52 opacity on paper is still about 3.2:1; do not go lower than 0.52.
- `.drops .chip { border-radius: 2px; background: none; border: 1px dashed var(--line-2) }`, `[aria-pressed="true"] { border-style: solid; border-color: var(--brick); color: var(--bad-ink) }`.
- `.mini { background: none; border: 1px solid var(--rule) }`, `.mini[data-on] { background: var(--accent-soft); border-color: var(--inkblue) }`.

### 2.14 Friction = hazard list with stamps (`Friction.tsx`: `table.sg`, `.lb` loop-breaker SVG, `.dbt` dumbbells, `.so .bad`)
- Signal grid `table.sg td`: cell tint is inline or `color-mix` on `--bad`; verify which. If inline, leave the tint (it reads through tokens) and only set `border-radius: 0`, `font-family: var(--serif)`.
  `.sg :is(thead, tbody) tr > :first-child { background: var(--surface) }` already tokenised.
  The stamp rule lists `.sg td[data-hi]`: that attribute does not exist on `.sg` cells today. Remove it from the stamp rule unless the builder adds a threshold attribute that already exists in the data; do not invent a "HIGH" cutoff.
- Hazard marker on the worst row, existing data: `.so .bad` (the worst retry figure, line 61) becomes `color: var(--bad-ink); border-bottom: 2px solid var(--brick)`.
- Loop breaker: `.lb-line { stroke: var(--ink); stroke-width: 1.5 }`, `.lb-dot { fill: var(--surface); stroke: var(--ink); stroke-width: 1.5 }`, `.lb-dot[data-be] { fill: var(--brick); stroke: var(--brick) }`,
  `.lb-ci { stroke: var(--line-2) }`, `.lb-be { stroke: var(--brick); stroke-dasharray: 4 3 }`, `.grid-l { stroke: var(--line); stroke-dasharray: 1 3 }`, `.ax { fill: var(--muted) }`, `.tr-end { fill: var(--bad-ink); font-family: var(--serif) }`.
- Dumbbells (`.dbt .seg.bad/.good`, `.c`, `.p`): tokens.

### 2.15 Time = relief sheet + choropleth strip (`Time.tsx`: `.cal .cell`, `.hw .cell`, `.ramp i`, `.b3d*`, `.tog3`)
- Choropleth strip (calendar): `.cal .cell:not([data-zero]) { --cf: color-mix(in oklab, #a8683a calc(var(--v, 0) * 100%), #dfe3c4); border-radius: 0 }`, `.cal .cell[data-zero] { background: var(--sunk) }`,
  `.cal { gap: 1px }`, `.cell[data-sel], .cell[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--ink) }`.
- Hour x weekday: `.hw .cell[data-dir="up"] { background-color: color-mix(in oklab, var(--teal) calc(var(--v, 0) * 75%), var(--sunk)) }`, `[data-dir="down"]` with `--prior` at 50%, `[data-neutral]` unchanged formula.
  Volume mode uses the `--accent` mix: override to the sage-to-sienna mix above so both Time grids and the Overview heatmap share one elevation scale.
- `.ramp i { background: linear-gradient(90deg, #dfe3c4, #d9c184, #a8683a) }`, `.ramp i.div { background: linear-gradient(90deg, color-mix(in oklab, var(--prior) 50%, var(--sunk)), var(--sunk), color-mix(in oklab, var(--teal) 75%, var(--sunk))) }`.
  The ramp `aria-label` ("grey is below ..., blue is above") needs the `useTheme()` branch: "sepia is below ..., teal is above".
- Relief sheet (3D): section 4. `.b3d-ramp { background: linear-gradient(90deg, #dfe3c4, #a8683a) }` (Classic hardcodes blue at `styles.css:626`).
  `.b3d-cv { border: 1px solid var(--rule); background: var(--surface) }` (neat-line frame).
- `Time.tsx` hardcodes chip colours `#c8cbd0` (line 129) and `#f5af20` (line 180), and "Amber bars" in the summary (line 195). All three must read the ATLAS palette from `Bars3D` (section 4).
- Dumbbells and `.so` line: tokens.

## 3. Motion: "drawn, not glown"
Nothing new is invented. Every rule goes inside `@media (prefers-reduced-motion: no-preference)` and under `.fx .sec[data-in]`
(`html.fx` is set only in real browsers and removed live when the OS preference flips, `Fx.tsx`). End state is the default
(from-only keyframes with `backwards` fill), so numbers are readable at first paint and under reduced motion nothing moves.
Reuse only existing keyframes from `styles.css:384-396`.

| Effect | Existing hook to reuse | ATLAS change |
|---|---|---|
| Route line draws in | `pa-draw` on `.sp-l` (`hero.css:114`) and `.line.draw` (`styles.css:365`). Both paths have `pathLength={1}` | Keep. Because `pa-draw` sets `stroke-dasharray: 1`, a dashed route line is impossible while it animates: keep `.sp-l` solid |
| Trail draws (Do next) | none on `.todo::before` | `animation: pa-wipe 800ms ... backwards` with `clip-path` top-to-bottom is not what `pa-wipe` does (it wipes left to right). Use `pa-sy` with `transform-origin: 50% 0` on `.todo::before` |
| Dots survey in sequence | `pa-cell` on `.wd i` with `--k` stagger (`hero.css:116`); `pa-pop` on `.sp-d`, `.dot.pt`, `.ud-on` | Keep delays. Replace the bouncy easing `cubic-bezier(.2, 1.2, .4, 1)` with `cubic-bezier(.2, .8, .2, 1)` for these selectors (ink does not bounce). Drop `sp-ping` and `wd-flip`: `animation-name` override to the first animation only |
| Waypoints | `pa-pop` | `.todo .num { animation: pa-pop 300ms backwards; animation-delay: calc(var(--i, 0) * 120ms) }`; `--i` is not set on `li`: use `li:nth-child(1..3)` (only 3 rows show by default) |
| Heatmap / choropleth tint | `pa-cell` on `.hm i` (`--day` stagger), `.cell:not(.none)` (`--d` stagger) | Keep, same easing swap |
| Gauge | `pa-ring` on `.g-fill`, `g-swing` on `.g-ndl` | Keep `g-swing` but with `cubic-bezier(.2, .8, .2, 1)` (no overshoot). Keep `pa-ring` |
| Terrain rises | `Bars3D.tsx` JS grow: height 0 to 1 over `T = 420ms`, camera settle `SWING` over `TC = 900ms`, gated by `reducedNow()` | Keep as is: that is the terrain rise. In ATLAS set the idle pulse colour to the brick pair (section 4). 2D fallback `.rh-2d i`: existing `pa-cell` with `--v` delay |
| Cards / tiles enter | `pa-up` on `.card`, `.kpis > li`, `.strip > .w` | Keep; reduce travel is not possible without a new keyframe. Acceptable |
| Stamps | none | No stamp-thud animation. A stamp that animates on every filter change is noise; static |
| Hover | `html.fx .todo li:hover` lift, `.w` translate, KPI tilt | All set to `transform: none; translate: none` in ATLAS. Hover feedback is `background: var(--sunk)` or a rule colour change |

Glow removal checklist: `box-shadow` pings (`sp-ping`), `backdrop-filter`, `html.glass` gradients, `.btn.primary` gradient. All covered in 2.0 and above.

## 4. ECharts-GL terrain (`Bars3D.tsx`): matte shaded relief
One TSX change set, same chunk, no new imports beyond `useTheme` from `../lib/theme` (already in the main bundle).

Add next to `BLUE` / `GREY` and select with `const pal = useTheme() === "atlas" ? ATLAS : CLASSIC`; add `pal` to the deps of the
`items` memo and of the option effect. Export `b3Palette(theme)` (or the two objects) so `Time.tsx` chips use `pal.mark` / `pal.off[1]`
instead of the literals `#f5af20` / `#c8cbd0`.

| Role | Classic (current literal) | ATLAS |
|---|---|---|
| Value ramp (0, .25, .5, .75, 1) | `#d2dff5 #b3caf1 #95b5ec #789fe7 #5b8ae1` | `#dfe3c4 #cdd2a1 #d9c184 #c99a5b #a8683a` (lowland sage, meadow, sand, ochre, sienna) |
| Off-window ramp (0, .5, 1) | `#e1e4e8 #c8cbd0 #b0b4b9` | `#e6dcc3 #d3c7a8 #bfb18d` |
| Zero-value plate | `#dde7f7` | `#e9e1c9` |
| Mark (best hour / summit) | `#f5af20` | `#a83a26` |
| Mark pulse high | `#ffc94d` | `#c4533d` |
| Selected day | `#1957d2` | `#2e4a7a` |
| Hover emphasis | `#003db7` | `#1b2c4d` |
| Frame line (`line3D`) and frame chip | `#1957d2` | `#2b2118` |
| Axis labels | `#575e69` | `#62523f` |
| Axis line | `#b9bec6` | `#8f7a52` |
| Split lines (full / mini) | `#dadee3` / `#eceff2` | `#d8c9a6` / `#e6dcc3` |
| Tooltip bg / border / text | `rgba(255,255,255,.85)` / `#dadee3` / `#11161f` | `#fbf6e9` (opaque) / `#c9b78f` / `#2b2118` |
| Tooltip `extraCssText` | blur + drop shadow, radius 12 | no `backdrop-filter`, no shadow, `border-radius: 2px`, `font-family: Georgia, serif` for the bold first line only |

Matte relief lighting (ATLAS only): `light.main { intensity: 0.55, alpha: 38, beta: -45, shadow: false }` (north-west light, the
cartographic convention) and `ambient.intensity: 0.62`; keep `shading: "lambert"`, `postEffect` off. Set `bevelSize: 0` so bars
read as cut terraces, not glossy pills. Do not switch to `"realistic"` shading: it needs more of echarts-gl and adds specular glow.

The idle pulse tests `x.color === "#f5af20"` (line 147) to find the marked bar. With a palette object this must compare against
`pal.mark`, or better use the existing `mark` flag carried through `items`. Otherwise the summit never pulses in ATLAS.

Summit label: no in-canvas text. The label is the existing `.rh-go` caption (`Peak {DOW[best.dow]} {best.hour}:00, {n} prompts`)
for the Overview widget and the existing `.note` line "Busiest: ..." under the Time card. The marked bar in brick is the summit marker.
An in-canvas label would need `scatter3D` + label (a new echarts-gl chart type, more bytes): not worth it.

Contrast of relief colours on paper: summit brick 5.55, top of ramp sienna 3.89, selected ink blue 7.70. The low end of the ramp
(1.15 to 2.22) is intentionally close to paper, like the Classic ramp on white; bar height and the lambert shading carry the value,
and the 2D grid plus the data table remain the accessible views.

## 5. Budget and build notes
- Estimated `atlas.css`: 9 to 11 KB raw, about 2.8 to 3.4 KB gzip. TSX deltas (palette object, three attributes, three string
  branches, one `--v`): under 0.5 KB gzip. Well inside the 25 KB headroom. No fonts, no images beyond the two data URIs.
- Group selectors with `:is()` under one `:root[data-theme="atlas"]` prefix where possible; native CSS nesting
  (`:root[data-theme="atlas"] { .card { ... } }`) would cut the prefix repetition by roughly 40% if the Vite/lightningcss target
  already allows nesting. `vite.config.ts` sets `target: "es2022"` and no `cssTarget`; confirm the minifier keeps or flattens nesting before relying on it.
- TSX touch list, complete: `Bars3D.tsx` (palette + lighting + pulse test), `Time.tsx` (two chip colours, two colour-word strings),
  `Rhythm.tsx` (`--v` on heat cells, one aria-label branch), `Sessions.tsx` (`data-out`, `data-sg`), `Sunburst.tsx`
  (`data-rank`). Nothing else needs TSX.
- Verify after build, in this order: Classic pixel-identical (no rule in `atlas.css` without the prefix; grep for lines not starting
  with `:root[data-theme="atlas"]`, `@media`, `}` or whitespace); glass off in ATLAS at every glass-strength setting; `.kt .val`
  does not overflow at the narrowest tile with Georgia; rotated stamps do not clip in `.tbl-wrap` (`overflow-x: auto`).
