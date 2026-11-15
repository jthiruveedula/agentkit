# Chart forms

Start from the question the reader is asking. The same table can answer
several questions; each one wants a different chart. `chart_check.py pick`
encodes the rules below; this file is the reasoning and the failure modes.

Why form matters: people read **position on a common scale** most
accurately, then length, then angle and slope, then area, then colour
intensity. Put the comparison that matters on the most accurate channel
available.

## Not a chart

| You have | Use | Why |
|---|---|---|
| 1 number | Stat tile: big value, unit, delta vs a named baseline | A gauge adds ink, not information |
| 2 numbers | A sentence, or a tile with delta | "Up 12% to 4.2M" or "62% of signups are mobile" beats two bars or a two-slice pie |
| Exact values to look up | Table, right-aligned numbers, one accent column | Charts show shape, tables show values |
| A handful of unrelated numbers | Tile row | No comparison means no shared axis |

## Comparison (which is bigger, by how much)

- **Sorted horizontal bar** is the default. Sort by value unless the
  categories have a real order (age bands, funnel stages). Zero baseline.
- **Column chart** only for few categories with short labels or ordered
  categories.
- **Dot plot / lollipop** when values sit far from zero and differences
  are small: a dot may live on a zoomed axis, a bar may not.
- **Dumbbell** for two values per category (before/after, plan/actual):
  the gap is the mark. Sort by the gap.
- **Grouped bars** stop working past about 4 series x 5 categories. Then
  use small multiples or a heatmap table with the numbers in the cells.
- More than ~15 bars: show the top N, fold the tail into "Other", say so.

Failure modes: truncated bar axis; one colour per bar; alphabetical order;
radar charts (the shape depends on axis order and area exaggerates).

## Change over time (trend)

- **Line chart**: time on x, evenly spaced as time. 1 to ~6 lines,
  direct-labelled at the right end.
- **Columns** when there are few discrete periods and each total matters
  more than the slope (quarterly revenue).
- **Slope chart** for exactly two periods across several series.
- **Small multiples** past ~6 series, shared y-axis, ordered by the
  takeaway (not alphabetically). Or one accent line over grey context
  lines when the story is one series against the field.
- **Area** only when the filled quantity is the point; baseline at zero.
- **Heatmap (time x series)** for dozens of series or calendar patterns.
- Annotate the event that explains the shape (launch, outage, policy
  change) on the chart, next to the point.

Failure modes: dual axes; stacked areas used to compare the upper bands;
interpolating across missing periods; a smoothed curve with no raw data;
a y-axis zoomed until noise looks like a crisis (or flattened until a
crisis looks like noise); mixing partial and complete periods (the last
month always "drops").

## Part-to-whole (share)

- **2 parts**: a sentence or stat tile ("62% mobile"); a single 100% bar
  if the split must be seen.
- **3 parts**: a donut/pie reads instantly, or a single 100% bar. Label
  slices directly.
- **4+ parts**: sorted bar of shares, labelled with percentages. State
  what the whole is.
- **Many parts or a hierarchy**: treemap for the big blocks, with the
  tail folded into "Other".
- **Share across groups or time**: 100% stacked bars with at most ~5
  segments, the important one on the baseline; beyond that, small
  multiples of each share.
- **One share for a general audience**: 10x10 waffle.

Failure modes: pies with many slices; side-by-side pies; 3D or exploded
slices; parts that do not sum to a meaningful whole (multi-select survey
answers are a comparison, not a composition).

## Distribution (how values are spread)

- **n < 30**: show every point (strip/dot plot). Do not bin, do not
  summarise.
- **One variable, larger n**: histogram with a deliberate bin width
  stated in the caption; ECDF when percentiles matter.
- **Across groups**: box plots sorted by median (with points overlaid
  when n is small); violins or ridgelines when shapes differ; small
  multiple histograms with shared bins for 2-6 groups.
- Mark the median or the threshold the reader cares about with a labelled
  rule.

Failure modes: bar of means with no spread; error bars with no statement
of what they are (SD, SE, CI); violins on small samples; log-scaled
histograms without saying so.

## Relationship (do these move together)

- **Scatter plot**. Label the outliers that carry the story; grey the
  rest.
- **Overplotting** (thousands of points): hexbin or 2D density; or small
  marks at low opacity when outliers matter.
- **Third measure**: bubble size by area with a size legend, sparingly.
- **Many measures**: scatterplot matrix or a correlation heatmap
  (diverging scale centred on zero), then promote the one pair that
  matters to its own chart.
- **Connected scatter** for a path through time; label start, end, turns.
- A fitted line needs the points behind it and a stated method.

Failure modes: dual-axis lines offered as correlation; bubbles sized by
radius; log axes not labelled as log; implying cause in the title.

## Flow (where things go)

- **One linear path** (funnel): horizontal bars from a shared zero
  baseline, labelled with step-to-step conversion. Not a tapered funnel
  drawing.
- **Splits and merges**: Sankey, nodes ordered to minimise crossings,
  at most ~20 nodes; aggregate small flows.
- **Signed contributions to a total**: waterfall.
- **Many-to-many**: adjacency matrix heatmap.

## Geography

Ask first: is the pattern spatial? If the reader only needs the ranking,
a sorted bar wins.

- **Choropleth** for rates and per-capita values, 5-7 classed steps of a
  sequential ramp, equal-area projection.
- **Proportional symbols** for counts and totals.
- **Tile grid map** when small regions matter as much as large ones.
- Pair the map with a ranked bar of the top regions.

Failure modes: choropleth of raw counts (it is a population map);
rainbow scales; Mercator for area comparison; unclassed ramps where no
one can read a value back.

## Picker cheat sheet

```
chart_check.py pick --intent <intent> [--x temporal|categorical|ordinal|numeric|geo]
                    [--series N] [--points N] [--measures N] [--csv FILE] [--json]
```

`--points` is x positions, categories, slices or observations per series
(`--categories` is an alias); both and `--series` must be >= 1.

`--csv` reads comma, semicolon or tab-delimited files with a header row
and infers column types, row and distinct counts, and an intent;
explicit flags override it. A file with no data rows is an error.

- **temporal**: ISO dates and datetimes, `2025/01/31`, `31.12.2025`,
  `1/31/2025`, `Jan 5, 2025`, `5-Jan-2025`, `January 2025`, `2025-Q1`,
  `2025-W03`, or 4-digit years under a `year` header.
- **numeric**: plain, signed, currency, percent, scientific, thousands
  commas in valid groups of three, or a decimal comma (`12,5`). Phone
  numbers and other spaced digit runs stay categorical.
- **geo**: by header (`country`, `province`, `county`, `city`, ISO and
  postal codes, `fips`). `state` counts only when the values are
  two-letter codes, because it is as often a status column.
- `lat`/`lon` columns are numeric; a pair of them means points on a map
  (point map, not a choropleth).

Intent inference is a starting guess from shape alone, in this order: a
date column means "trend" (even with a region column: one series per
region), a region column "geo", a category column "comparison". If the
real question is share or spread, pass `--intent`.
