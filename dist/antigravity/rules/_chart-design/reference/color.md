# Colour

Colour answers one of four jobs. Pick the job, then the palette.

| Job | Palette | Example |
|---|---|---|
| Point at one thing | Grey context + 1 accent | Our product vs competitors |
| Tell things apart | Categorical, max 6 (8 at the limit) | Regions, plans |
| Show how much | Sequential, one hue, light to dark | Density, rate |
| Show which side of a midpoint | Diverging, two hues through neutral | Change vs last year, sentiment |

If colour is doing none of these, use one colour.

## Highlight: the default

Most charts have one story. Draw everything in a mid grey, the subject
in the accent, and label both. This is the cheapest way to make a chart
look designed, and it is colour-blind safe by construction.

| Theme | Background | Accent | Context grey |
|---|---|---|---|
| Light | `#ffffff` | `#0072B2` | `#8a9099` |
| Dark | `#111418` | `#56B4E9` | `#7b828c` |

Two accents (us vs them, before vs after): blue `#0072B2` and vermillion
`#D55E00`. Never red and green as the only difference.

## Categorical

Both sets pass `chart_check.py palette` against their background
(contrast >= 3:1, CIEDE2000 >= 10 for every pair under normal, protan,
deutan and tritan vision). The skill's tests pin both sets, the
highlight pairs above, the text tokens below (4.5:1) and the threshold
figures quoted under "The check".

| Slot | Light (`#ffffff`) | Dark (`#111418`) |
|---|---|---|
| 1 | `#0072B2` blue | `#56B4E9` sky |
| 2 | `#D55E00` vermillion | `#D55E00` vermillion |
| 3 | `#009E73` green | `#009E73` green |
| 4 | `#CC79A7` pink | `#CC79A7` pink |
| 5 | `#332288` indigo | `#F0E442` yellow |
| 6 | `#882255` wine | `#E69F00` orange |

Built on Okabe-Ito with two Paul Tol hues for the light set, because
Okabe-Ito's yellow, orange and sky fall under 3:1 on white.

Rules:

- Assign slots in order and keep the mapping stable across every chart on
  the page. "Enterprise" is blue everywhere or nowhere.
- Six is tight on purpose. Under colour-vision deficiency the usable
  space collapses to roughly lightness plus one hue axis, so a seventh
  distinguishable colour at 3:1 contrast barely exists. Need more? Small
  multiples, an "Other" bucket, or highlight-and-grey.
- Add a second channel whenever colour carries identity: direct labels
  first, then dash patterns for lines, shapes for points.
- Brand colours: run them through `palette`. Keep the ones that pass,
  shift lightness (not hue) on the ones that fail, re-run.

## Sequential and diverging

Use the perceptual ramps the library ships; do not hand-interpolate
between two hex values in RGB.

| Need | Use | Avoid |
|---|---|---|
| Sequential | Single-hue ramps (Blues), viridis, cividis | Rainbow / jet / turbo, hue-only ramps |
| Diverging | Blue-orange (PuOr), blue-red (RdBu), neutral midpoint | Red-yellow-green |

- Light means "less" on a light background and "more" on a dark one;
  flip the ramp with the theme so the extreme always has the most
  contrast against the page.
- Class the ramp into 5-7 steps when readers must read a value back
  (choropleths, heatmaps without numbers). Continuous is fine when the
  number is printed in the cell.
- Diverging only when the midpoint means something (zero, target,
  average) and pin the neutral colour to it.
- `palette` is a categorical check: neighbouring ramp steps are close by
  design. Check a ramp's two ends (and the diverging midpoint) for
  separation, and the darkest/lightest step you rely on for contrast.

## Semantic colour

Good/bad, up/down: pair colour with a sign, arrow or word. Blue/vermillion
reads as two states without implying traffic lights. If red/green is a
hard brand requirement, make them differ strongly in lightness and keep
the arrow.

## Theme tokens

Marks, text and grid all read from tokens; no hex literals in chart code.

```css
:root {
  --chart-bg: #ffffff;
  --chart-ink: #1b1f24;      /* titles, values */
  --chart-muted: #5b6470;    /* axis labels, captions */
  --chart-grid: #e6e8eb;     /* gridlines: decoration, may be faint */
  --chart-accent: #0072B2;
  --chart-context: #8a9099;
  --chart-1: #0072B2; --chart-2: #D55E00; --chart-3: #009E73;
  --chart-4: #CC79A7; --chart-5: #332288; --chart-6: #882255;
}
@media (prefers-color-scheme: dark) {
  :root {
    --chart-bg: #111418;
    --chart-ink: #e6e8eb;
    --chart-muted: #9aa1ab;
    --chart-grid: #2a2f36;
    --chart-accent: #56B4E9;
    --chart-context: #7b828c;
    --chart-1: #56B4E9; --chart-2: #D55E00; --chart-3: #009E73;
    --chart-4: #CC79A7; --chart-5: #F0E442; --chart-6: #E69F00;
  }
}
```

Canvas, matplotlib and other non-CSS renderers: keep the same two token
sets as a dict and pick by theme; re-render on theme change. If the host
app toggles theme with a class or `data-theme` attribute, scope the dark
block to that selector as well as the media query.

## The check

```
python3 scripts/chart_check.py palette <hex...> --bg <hex> [--min-contrast 3] [--min-delta 10] [--json]
```

- **Contrast**: WCAG 2.x ratio against the background. 3:1 is the
  non-text minimum for marks (SC 1.4.11); run text colours with
  `--min-contrast 4.5`.
- **Separation**: each colour is converted to linear RGB, passed through
  the Machado, Oliveira and Fernandes (2009) severity-1.0 matrices for
  protanopia, deuteranopia and tritanopia, then compared pairwise in CIE
  Lab with CIEDE2000.
- **Threshold 10**: chosen empirically. The Okabe-Ito set, designed for
  colour-blind readers, bottoms out at 10.9; common defaults (Tableau 10
  / matplotlib `tab10`) have pairs under 4 for protan and deutan vision.
  The gate compares the unrounded value; output is rounded for display.
  Thin lines and small dots need more separation than large fills, so
  treat 10 as a floor and raise `--min-delta` for hairlines.
- Exit code 1 on any failure, so it can gate CI.
- A pass is necessary, not sufficient: still do the greyscale and squint
  tests, and still direct-label.
