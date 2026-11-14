# Craft

What separates a correct chart from one people trust at a glance.

## Titles and text

- **Title = the takeaway**, as a sentence, left-aligned, in the ink
  colour. "Enterprise overtook SMB in Q3", not "Revenue by segment".
- **Subtitle = what is plotted**: metric, unit, period. This is where
  "Monthly revenue, USD millions, 2023-2025" goes, which removes the
  need for a y-axis title.
- **Caption = provenance**: source, n, date pulled, caveats.
- A hierarchy of three sizes at most (title, labels, caption). Labels
  never smaller than 11-12 px on screen, 8 pt in print.
- Tabular (monospaced) figures for numbers that line up.
- Colour words in the title ("Enterprise" set in the Enterprise colour)
  can replace a legend, but only when the series are also direct-labelled
  or told apart without colour (dash, shape, position). A coloured word
  alone fails colour-blind readers and greyscale prints.

## Axes and grid

- Bars and areas: zero baseline, no exceptions. Lines and dots: the
  range of the data plus breathing room, with labelled ticks at round
  values.
- 3-5 ticks per axis. Label the top tick with the unit (`40%`, `$2M`),
  the rest bare.
- Horizontal gridlines only, in `--chart-grid`; no axis line where a
  gridline already does the job; no tick marks on categorical axes.
- Time axes: label where the unit changes ("Jan", "Apr", "Jul", "Oct",
  "2025"), not every tick.
- Log scales only for multiplicative data, and say "log scale" on the
  axis.
- Small multiples: same x and y on every panel, axis labels only on the
  outer edge, panel title where a legend entry would have been.

## Marks

- Lines 1.5-2 px; the accent line slightly heavier than context lines.
  Markers only when points are sparse (< ~12) or individually meaningful.
- Bars: gap about half a bar width; no outlines; no rounded tops on
  anything that will be compared closely.
- Points: 3-5 px radius, opacity for overlap, a thin background-coloured
  stroke to separate neighbours.
- Reference lines (target, average, threshold): thin, muted, labelled on
  the line itself.
- Annotations beat tooltips: put the two or three facts that matter on
  the chart in text, with a short leader line if needed.

## Layout

- Aspect: time series wider than tall (roughly 16:9 to 3:1); aim for
  slopes near 45 degrees. Scatter plots near square. Horizontal bars get
  ~24-28 px per row and grow with the data.
- Leave the right margin for line-end labels instead of clipping them.
- At narrow widths: fewer ticks, shorter number formats, labels above
  bars instead of beside them, and stack small multiples in one column.
  Never shrink the type below the minimum; drop detail instead.

## Dashboards

Scan order is the layout. Top-left gets the most important thing.

1. **KPI row**: 3-5 tiles. Each tile has a plain label, the value with
   unit, a delta against a **named** baseline ("+4.1% vs last week"),
   and optionally a sparkline. More than five tiles means nobody
   decided what matters.
2. **The explaining chart**: the one view that says why the headline
   number moved. Full width.
3. **Breakdowns**: two or three smaller charts on a shared grid.
4. **Detail table** last, sortable, for people with their own question.

Rules:

- One metric, one colour, one scale across the page. A reader who
  learns "blue is Enterprise" in one chart must not unlearn it in the
  next.
- Sparklines: no axes, no grid, last point marked and labelled; the same
  time window on every tile. They show shape, not value, so the y-range
  is each tile's own unless tiles are meant to be compared.
- Delta colour needs a sign or arrow too, and a neutral state for
  "within noise". Decide per metric whether up is good.
- Every tile states its period and freshness once ("Last 7 days,
  updated 09:00 UTC"), preferably once per page.
- Empty, loading and error states are designed, with the same
  footprint as the chart (no layout shift).
- No chart junk to fill a grid cell. An empty cell is fine.

## Interaction

The static render is the product; interaction is a bonus for readers
with their own questions.

| Add | When | Not when |
|---|---|---|
| Tooltip | Exact values on dense marks | It holds the only copy of the takeaway |
| Hover highlight | Many overlapping series | Fewer than 4 series, already labelled |
| Filter / toggle | Reader owns the question (exploration) | The chart argues one point (explanation) |
| Zoom / brush | Long time series, dense scatter | The interesting range is known: just show it |
| Drill-down | A real hierarchy with a next question | To hide detail that should be a second chart |

- Everything reachable by hover is reachable by keyboard focus and by
  touch. Hit targets at least 24 px; snap tooltips to the nearest
  point on x rather than requiring a precise hover on a 2 px line.
- State lives in the URL when a view is worth sharing.

## Motion

- Motion explains a change of state (filter applied, data updated):
  marks move from old position to new so the eye can follow. It does
  not decorate first paint.
- Budget: 200-400 ms, ease-out, once. No looping, no bouncing bars, no
  count-up numbers on values people need to read now.
- `prefers-reduced-motion: reduce` means no transition: render the end
  state. Check it in the library config (`animation: false`,
  `isAnimationActive={false}`, `transition.duration(0)`), not only CSS.
- Live data: update in place at a calm interval and mark the last
  update time; do not animate every tick.

## Accessibility

- Static SVG: `role="img"` and an `aria-label` (or `<title>`/`<desc>`)
  that states the takeaway and the range, not "bar chart". Canvas: the
  same on the element plus fallback content.
- Interactive charts: do not wrap focusable marks in one `role="img"`;
  it flattens the subtree and hides them from assistive tech. Put the
  summary on a caption or `aria-describedby`, give each focusable mark
  its own `aria-label` ("Q3 2025, Enterprise, 4.2M"), or keep the
  graphic as an image and offer the same data as an adjacent table.
- Offer the underlying numbers as a table or download for anything
  people act on.
- Never rely on colour alone (labels, shapes, dashes). Run the
  `palette` check on each theme. Text contrast 4.5:1.
- Focus order follows reading order; focus is visible on interactive
  marks.

## Per-library switches

The defaults to undo first, wherever you are:

| Library | Turn off / change |
|---|---|
| matplotlib | Top and right spines off; `tab10` cycle replaced with tokens; legend replaced by `ax.text` at line ends; `fig.set_layout_engine("constrained")`; title left via `loc="left"` |
| plotly | `template="simple_white"`; hide the modebar unless needed; `showlegend=False` plus annotations; `hovermode="x unified"` |
| Chart.js | Legend plugin off, labels via a datalabels approach or annotations; `grid.display=false` on x; `animation=false` under reduced motion; set `maintainAspectRatio` deliberately |
| Recharts | Drop `<Legend>` for `<LabelList>` or end labels; `<CartesianGrid vertical={false}>`; `isAnimationActive={false}` under reduced motion; colours from CSS variables |
| D3 / raw SVG | You own everything: tokens via `currentColor` and CSS variables, `viewBox` for scaling, `font-variant-numeric: tabular-nums` |
| Vega-Lite | One `config` object carrying tokens (`axis.grid`, `view.stroke: null`, `range.category`); text marks for direct labels |
| Spreadsheets / BI tools | Remove chart border and 3D; set the colour per series by hand; write the takeaway into the title field |

If the project already wraps its charts in a theme or component, extend
that instead of styling one chart by hand.
