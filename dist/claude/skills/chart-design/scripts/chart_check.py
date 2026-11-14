#!/usr/bin/env python3
"""Deterministic chart checks. Stdlib only, no randomness.

  chart_check.py pick --intent trend --x temporal --series 3 --points 40
  chart_check.py pick --csv sales.csv [--intent comparison] [--json]
  chart_check.py palette "#4269d0" "#efb118" "#ff725c" --bg "#ffffff" [--json]

pick     ranks chart forms for an intent + data shape, with reasons and the
         anti-patterns to avoid. Flags override anything inferred from --csv.
palette  checks a CATEGORICAL palette: WCAG contrast of each colour against
         the background (marks need 3:1) and pairwise CIEDE2000 separation
         under normal vision, protanopia, deuteranopia and tritanopia.
         Sequential/diverging ramps have close neighbours by design; check
         only their end (and mid) stops here.

Exit codes: 0 ok, 1 a palette check failed, 2 usage error.
"""

import argparse
import csv
import itertools
import json
import math
import re
import sys

# --------------------------------------------------------------------- pick

INTENTS = (
    "comparison",
    "trend",
    "part-to-whole",
    "distribution",
    "relationship",
    "flow",
    "geo",
)
ALIASES = {
    "change-over-time": "trend",
    "time": "trend",
    "ranking": "comparison",
    "composition": "part-to-whole",
    "share": "part-to-whole",
    "correlation": "relationship",
    "funnel": "flow",
    "map": "geo",
}
X_TYPES = ("temporal", "categorical", "ordinal", "numeric", "geo")

ALWAYS_AVOID = [
    "3D, gradients or shadows on data marks",
    "a legend where direct labels fit",
    "a title that names the topic instead of stating the takeaway",
]

_MON = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?"
    r"|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
)
TEMPORAL_RES = [
    re.compile(pattern, re.I)
    for pattern in (
        r"^\d{4}[-/]\d{1,2}([-/]\d{1,2})?([T ]\d{1,2}:\d{2}.*)?$",  # 2025-01-31, 2025/01
        r"^\d{1,2}/\d{1,2}/\d{2,4}$",  # 1/31/2025
        r"^\d{1,2}\.\d{1,2}\.\d{2,4}$",  # 31.12.2025
        r"^\d{4}[- ]?Q[1-4]$",  # 2025-Q1
        r"^Q[1-4][- ]?\d{4}$",  # Q1 2025
        r"^\d{4}-?W\d{2}$",  # 2025-W03
        r"^%s([ -]\d{2,4})?$" % _MON,  # Jan, January 2025, Jan-25
        r"^%s \d{1,2},? \d{4}$" % _MON,  # Jan 5, 2025
        r"^\d{1,2}[- ]%s[- ]\d{2,4}$" % _MON,  # 5-Jan-2025
    )
]
YEAR_HEADERS = {"year", "yr", "fy", "fiscal_year"}
# Region columns are recognised by header. Code-like headers may hold digits;
# name-like headers must hold text; `state` is ambiguous (order state, UI
# state) so it only counts when the values are two-letter codes.
# ponytail: full state names under `state` read as plain categories (a sorted
# bar is still a fine answer); add a name list if maps get missed.
GEO_CODE_HEADERS = {"zip", "zipcode", "postcode", "postal_code", "fips"}
GEO_NAME_HEADERS = {
    "country",
    "country_code",
    "iso2",
    "iso3",
    "province",
    "county",
    "city",
}
LAT_HEADERS = {"lat", "latitude"}
LON_HEADERS = {"lon", "lng", "long", "longitude"}
# Thousands commas only in groups of three ("555 123 4567" and "1,23" are
# not numbers); "12,5" is read as a decimal comma.
NUM_RE = re.compile(
    r"^[-+]?[$€£]?[-+]?"
    r"(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+|\d+,\d{1,2})"
    r"(?:[eE][-+]?\d+)?\s?%?$"
)
# ponytail: types are inferred from the first 5000 rows; raise if a file
# changes type further down.
CSV_SAMPLE_ROWS = 5000


def _norm(header):
    return header.strip().lower().replace(" ", "_")


def _is_num(v):
    return bool(NUM_RE.match(v))


def _col_type(header, values):
    """temporal | numeric | geo | categorical for one column's non-empty values."""
    h = _norm(header)
    if not values:
        return "categorical"
    need = 0.9 * len(values)

    def mostly(test):
        return sum(1 for v in values if test(v)) >= need

    if mostly(lambda v: any(r.match(v) for r in TEMPORAL_RES)):
        return "temporal"
    if h in YEAR_HEADERS and all(re.match(r"^(19|20)\d\d$", v) for v in values):
        return "temporal"
    if h in GEO_CODE_HEADERS:
        return "geo"
    numeric = mostly(_is_num)
    if h in GEO_NAME_HEADERS and not numeric:
        return "geo"
    if h == "state" and mostly(lambda v: re.match(r"^[A-Z]{2}$", v)):
        return "geo"
    return "numeric" if numeric else "categorical"


def infer_csv(path):
    """Column types and a data shape from a delimited file with a header row."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        first = fh.readline()
        # the delimiter is whichever of , ; tab the header uses most (tie: comma)
        delimiter = max(",;\t", key=first.count)
        reader = csv.reader(itertools.chain([first], fh), delimiter=delimiter)
        headers = next(reader, None) or []
        cols = [[] for _ in headers]
        rows = 0
        for row in reader:
            if not any(c.strip() for c in row):
                continue
            rows += 1
            if rows <= CSV_SAMPLE_ROWS:
                for i, cell in enumerate(row[: len(headers)]):
                    if cell.strip():
                        cols[i].append(cell.strip())
    if not rows:
        raise ValueError("%s: no data rows" % path)
    columns = []
    for h, vals in zip(headers, cols):
        columns.append(
            {"name": h, "type": _col_type(h, vals), "distinct": len(set(vals))}
        )
    by = {t: [c for c in columns if c["type"] == t] for t in X_TYPES}
    nums, cats, regions = by["numeric"], by["categorical"], by["geo"]
    # a lat + lon pair is a position, not two measures
    lat = [c for c in nums if _norm(c["name"]) in LAT_HEADERS]
    lon = [c for c in nums if _norm(c["name"]) in LON_HEADERS]
    coords = bool(lat and lon)
    if coords:
        nums = [c for c in nums if c not in lat + lon]
    shape = {"rows": rows, "measures": len(nums)}
    if by["temporal"]:
        # A date column outranks a region column: "revenue by month per
        # country" is a trend with one series per country.
        # long format (a group column) -> one series per group;
        # wide format -> one series per numeric column
        groups = cats + regions
        series = min(c["distinct"] for c in groups) if groups else max(len(nums), 1)
        shape.update(x="temporal", points=by["temporal"][0]["distinct"], series=series)
        intent = "trend"
    elif regions:
        shape.update(x="geo", points=max(c["distinct"] for c in regions))
        intent = "geo"
    elif coords:
        shape.update(x="numeric", points=rows)
        intent = "geo"
    elif cats:
        shape.update(
            x="categorical", points=cats[0]["distinct"], series=max(len(nums), 1)
        )
        intent = "comparison"
    elif len(nums) >= 2:
        shape.update(x="numeric", points=rows)
        intent = "relationship"
    else:
        shape.update(x="numeric", points=rows)
        intent = "distribution"
    return {"columns": columns, "shape": shape, "intent": intent}


def _rec(form, *why):
    return {"form": form, "why": list(why)}


def recommend(intent, x=None, series=1, points=None, measures=None):
    """Ranked chart forms for an intent and data shape. Pure and deterministic.

    points = x positions / categories / slices / observations, per series.
    """
    intent = ALIASES.get(intent, intent)
    if intent not in INTENTS:
        raise ValueError(
            "unknown intent %r (choose from %s)" % (intent, ", ".join(INTENTS))
        )
    series = 1 if series is None else series
    for flag, value in (("points", points), ("series", series), ("measures", measures)):
        if value is not None and value < 1:
            raise ValueError("--%s must be >= 1 (got %d)" % (flag, value))
    n = points
    recs, avoid = [], []

    if n is not None and n * series <= 1:
        recs = [
            _rec(
                "stat tile",
                "one number is not a chart: show it big, with unit, context "
                "(vs target or prior period) and a plain-words label",
            )
        ]
        avoid = [
            "a gauge or donut wrapped around one number",
            "a bar chart with one bar",
        ]
    elif (
        intent in ("comparison", "part-to-whole")
        and n == 2
        and series == 1
        and x != "temporal"
    ):
        if intent == "comparison":
            second = _rec(
                "horizontal bar chart, sorted by value",
                "only if the two must be seen side by side",
            )
        else:
            second = _rec(
                "single 100% stacked bar", "only if the split must be seen at a glance"
            )
        recs = [
            _rec(
                "stat tile with delta",
                "two numbers are a sentence: state both and the gap (or the share) in words",
            ),
            second,
        ]
        avoid = ["a chart whose only job is to hold two numbers"]
    elif intent == "trend" and n == 2 and series == 1:
        recs = [
            _rec(
                "stat tile with delta",
                "two points are a before/after: show the current value and the signed change",
            ),
            _rec("slope chart", "only if the direction itself needs to be seen"),
        ]
        avoid = ["a two-point line chart dressed up as a trend"]
    elif intent == "trend":
        if n == 2:
            recs.append(
                _rec(
                    "slope chart",
                    "two periods, several series: slopes show who rose, fell and crossed",
                    "label both ends directly; highlight the one that matters",
                )
            )
            recs.append(
                _rec(
                    "dumbbell (dot) plot", "when ranking by size of change matters more"
                )
            )
        elif series > 6:
            recs.append(
                _rec(
                    "small-multiple line charts",
                    "%d series on one plot is spaghetti; one panel each, shared y-axis, "
                    "ordered by the takeaway" % series,
                )
            )
            recs.append(
                _rec(
                    "line chart with one highlighted series",
                    "when the story is one series against the field: it gets the accent, the rest go grey",
                )
            )
            if series > 20:
                recs.append(
                    _rec(
                        "heatmap (time x series)",
                        "many series: trade precision for pattern, sequential scale",
                    )
                )
        else:
            recs.append(
                _rec(
                    "line chart",
                    "time on x, position on y is the most accurate read of change",
                    "label each line at its right end instead of a legend"
                    if series > 1
                    else "label the last point; annotate the event that explains the shape",
                )
            )
            if series == 1 and n is not None and n <= 12:
                recs.append(
                    _rec(
                        "column chart",
                        "few discrete periods where each total matters more than the slope",
                    )
                )
            if series == 1:
                recs.append(
                    _rec(
                        "area chart",
                        "only when the filled volume is the point; baseline at zero",
                    )
                )
            else:
                recs.append(
                    _rec(
                        "small-multiple line charts",
                        "if lines overlap too much to follow",
                    )
                )
        if n is not None and n > 500:
            recs[0]["why"].append(
                "%d points: aggregate to the grain of the question or overlay a rolling mean "
                "on a faint raw line" % n
            )
        avoid = [
            "dual y-axes (the crossing point is an artefact of two arbitrary scales)",
            "stacked area to compare individual series (only the bottom band has a flat baseline)",
            "uneven time spacing drawn as even",
            "smoothing that invents values between observations",
        ]
    elif intent == "comparison":
        if series == 1:
            recs.append(
                _rec(
                    "horizontal bar chart, sorted by value",
                    "length from a zero baseline is the easiest comparison; horizontal keeps labels readable",
                    "sort by value unless the categories have a natural order",
                )
            )
            if n is not None and n <= 7:
                recs.append(
                    _rec(
                        "column chart",
                        "few categories with short labels or a natural order",
                    )
                )
            recs.append(
                _rec(
                    "dot plot (lollipop)",
                    "when values sit far from zero and differences are small: dots may use a non-zero axis, bars may not",
                )
            )
            if n is not None and n > 30:
                recs[0]["why"].append(
                    "%d categories: show the top 10-15 and fold the tail into 'Other', or use a table"
                    % n
                )
        elif series == 2:
            recs.append(
                _rec(
                    "dumbbell (dot) plot",
                    "two values per category: the gap between dots is the story; sort by gap",
                )
            )
            if n is None or n <= 6:
                recs.append(
                    _rec(
                        "grouped bar chart",
                        "few categories; keep the pair adjacent, two tones of one hue",
                    )
                )
            recs.append(_rec("slope chart", "if the two series are before/after"))
        elif series <= 4 and (n is None or n <= 5):
            recs.append(
                _rec(
                    "grouped bar chart", "small grid of values; direct-label the groups"
                )
            )
            recs.append(
                _rec("small-multiple bar charts", "one panel per series, shared axis")
            )
        else:
            recs.append(
                _rec(
                    "small-multiple bar charts",
                    "%d series: one panel each on a shared axis beats a wall of grouped bars"
                    % series,
                )
            )
            recs.append(
                _rec(
                    "heatmap table",
                    "categories x series grid: sequential colour plus the number in each cell",
                )
            )
        avoid = [
            "a bar axis that does not start at zero",
            "a different colour per bar when colour encodes nothing",
            "alphabetical order when value order is the point",
            "radar charts (area depends on axis order)",
        ]
    elif intent == "part-to-whole":
        if x == "temporal" or series > 1:
            if n is not None and n > 5:
                recs.append(
                    _rec(
                        "small-multiple line or bar charts of share",
                        "%d parts stacked cannot be compared; give each part its own baseline"
                        % n,
                    )
                )
                recs.append(
                    _rec(
                        "100% stacked bar chart",
                        "only after folding to 4-5 parts plus 'Other'",
                    )
                )
            else:
                recs.append(
                    _rec(
                        "100% stacked bar chart",
                        "composition across groups or time; put the part that matters on the baseline",
                    )
                )
                recs.append(
                    _rec(
                        "stacked area chart",
                        "long time series where the total also matters",
                    )
                )
            avoid = ["several pies side by side", "more than 5 stacked segments"]
        elif n is not None and n <= 3:
            recs.append(
                _rec(
                    "donut or pie chart",
                    "3 parts is the one case a pie reads instantly; label slices directly",
                )
            )
            recs.append(
                _rec(
                    "single 100% stacked bar", "same data, less space, easier to label"
                )
            )
            avoid = [
                "3D or exploded slices",
                "a legend instead of labels on the slices",
            ]
        else:
            recs.append(
                _rec(
                    "horizontal bar chart of share, sorted",
                    "angles cannot be compared beyond a few slices; bar length can",
                    "label each bar with its percentage and say what the whole is",
                )
            )
            if n is not None and n > 5:
                recs.append(
                    _rec(
                        "treemap",
                        "many parts or a hierarchy: shows the big blocks, not precise ranks",
                    )
                )
                recs[0]["why"].append("fold the long tail into 'Other'")
            else:
                recs.append(
                    _rec("single 100% stacked bar", "when it must fit in one line")
                )
                recs.append(
                    _rec(
                        "waffle chart (10x10)",
                        "one share out of 100 for a general audience",
                    )
                )
            avoid = [
                "pie or donut chart with more than 3 slices",
                "3D or exploded slices",
                "parts that do not sum to a meaningful whole",
            ]
    elif intent == "distribution":
        if series > 1:
            if n is not None and n < 30:
                recs.append(
                    _rec(
                        "strip (jittered dot) plot per group",
                        "small samples: show every observation",
                    )
                )
                recs.append(
                    _rec("box plot per group", "only with the raw points drawn on top")
                )
            else:
                recs.append(
                    _rec(
                        "box plot per group, sorted by median",
                        "compact comparison of centre and spread",
                    )
                )
                recs.append(
                    _rec(
                        "violin or ridgeline plot",
                        "when shape (bimodality, skew) differs between groups",
                    )
                )
                recs.append(
                    _rec(
                        "small-multiple histograms",
                        "shared x-axis and bins, 2-6 groups",
                    )
                )
        elif n is not None and n < 30:
            recs.append(
                _rec(
                    "strip (dot) plot",
                    "fewer than 30 observations: show each one, do not bin",
                )
            )
            recs.append(
                _rec("sorted bar or dot plot", "if each observation is a named thing")
            )
        else:
            recs.append(
                _rec(
                    "histogram",
                    "shape of one variable; choose bin width deliberately and say what it is",
                )
            )
            recs.append(_rec("ECDF", "exact percentiles with no binning choices"))
            recs.append(
                _rec(
                    "density plot", "smooth shape for large n; never for small samples"
                )
            )
        avoid = [
            "a bar of means with no spread shown",
            "default bin counts left unexamined",
            "violin or density plots for small samples",
        ]
    elif intent == "relationship":
        m = measures or 2
        if m > 3:
            recs.append(
                _rec(
                    "scatterplot matrix",
                    "%d measures: every pair at a glance, then promote the one that matters"
                    % m,
                )
            )
            recs.append(
                _rec(
                    "correlation heatmap",
                    "diverging scale centred on zero, coefficient in each cell",
                )
            )
        else:
            if n is not None and n > 2000:
                recs.append(
                    _rec(
                        "hexbin or 2D density plot",
                        "%d points overplot; bin them so density is visible" % n,
                    )
                )
                recs.append(
                    _rec(
                        "scatter plot with low opacity",
                        "small marks, alpha ~0.2, if outliers matter",
                    )
                )
            else:
                recs.append(
                    _rec(
                        "scatter plot",
                        "two measures, one mark per observation; label the outliers that carry the story",
                    )
                )
            if m == 3:
                recs.append(
                    _rec(
                        "bubble chart",
                        "third measure as AREA (not radius), with a size legend",
                    )
                )
            if series > 6:
                recs.append(
                    _rec(
                        "small-multiple scatter plots",
                        "%d groups: one panel each, shared axes" % series,
                    )
                )
            if x == "temporal":
                recs.append(
                    _rec(
                        "connected scatter plot",
                        "path through time; label the start, end and turns",
                    )
                )
        avoid = [
            "two lines on dual axes as evidence of correlation",
            "a trend line without the points behind it",
            "bubble size mapped to radius instead of area",
        ]
    elif intent == "flow":
        if x == "ordinal" or (series == 1 and n is not None and n <= 8):
            recs.append(
                _rec(
                    "funnel drawn as horizontal bars",
                    "one linear path: bars from a shared zero baseline, labelled with step conversion",
                )
            )
            recs.append(
                _rec("waterfall chart", "if steps add and subtract toward a total")
            )
            recs.append(_rec("Sankey diagram", "only if the path branches"))
        elif n is not None and n > 20:
            recs.append(
                _rec(
                    "adjacency matrix heatmap",
                    "%d nodes make a Sankey unreadable; a from/to grid scales" % n,
                )
            )
            recs.append(
                _rec(
                    "Sankey diagram", "after aggregating to the top flows plus 'Other'"
                )
            )
        else:
            recs.append(
                _rec(
                    "Sankey diagram",
                    "quantities splitting and merging between stages; link width is the amount",
                )
            )
            recs.append(
                _rec(
                    "waterfall chart",
                    "if the flow is signed contributions to one total",
                )
            )
            recs.append(
                _rec("funnel drawn as horizontal bars", "if there is one linear path")
            )
        avoid = [
            "a tapered funnel graphic whose widths are not to scale",
            "a Sankey with crossing links left unsorted",
            "arrows-and-boxes with quantities only in text",
        ]
    elif intent == "geo":
        if x == "numeric":  # latitude/longitude points, not regions
            if n is not None and n > 2000:
                recs.append(
                    _rec(
                        "hexbin or density map",
                        "%d points overplot; bin them so density is visible" % n,
                    )
                )
            recs.append(
                _rec(
                    "point (dot) map",
                    "one mark per location on a plain basemap; small marks, low opacity where they overlap",
                )
            )
            recs.append(
                _rec(
                    "proportional symbol map",
                    "if each location carries an amount: circle area, with a size legend",
                )
            )
        elif n is not None and n <= 10:
            recs.append(
                _rec(
                    "horizontal bar chart, sorted by value",
                    "%d regions: unless the pattern is spatial, a sorted bar is read faster than a map"
                    % n,
                )
            )
            recs.append(
                _rec(
                    "choropleth map",
                    "if adjacency or clustering is the story; rates, not counts",
                )
            )
        else:
            recs.append(
                _rec(
                    "choropleth map",
                    "rates or per-capita values by region; 5-7 classed steps of a sequential scale",
                )
            )
            recs.append(
                _rec(
                    "proportional symbol map",
                    "for counts and totals: circle area carries the amount",
                )
            )
            recs.append(
                _rec("tile grid map", "equal-weight regions so small ones are not lost")
            )
            recs.append(
                _rec(
                    "horizontal bar chart of the top regions",
                    "next to the map, for the ranking",
                )
            )
        if x == "temporal":
            recs.append(
                _rec("small-multiple maps", "one map per period, shared colour scale")
            )
        avoid = [
            "a choropleth of raw counts (it redraws the population map)",
            "a rainbow colour scale",
            "Mercator when areas are compared",
        ]

    for i, r in enumerate(recs, 1):
        r["rank"] = i
    return {
        "intent": intent,
        "shape": {"x": x, "series": series, "points": points, "measures": measures},
        "recommendations": recs,
        "avoid": avoid + ALWAYS_AVOID,
    }


def cmd_pick(a):
    inferred = None
    if a.csv:
        try:
            inferred = infer_csv(a.csv)
        except (OSError, ValueError, csv.Error) as e:  # ValueError covers bad encodings
            print("error: %s" % e, file=sys.stderr)
            return 2
    s = inferred["shape"] if inferred else {}
    intent = a.intent or (inferred and inferred["intent"])
    if not intent:
        print("error: give --intent or --csv", file=sys.stderr)
        return 2
    points = a.points if a.points is not None else s.get("points")
    if (
        inferred
        and s.get("rows") == 1
        and s.get("measures", 0) <= 1
        and a.points is None
    ):
        points = 1  # a one-row, one-measure file is a single number
    try:
        out = recommend(
            intent,
            x=a.x or s.get("x"),
            series=a.series if a.series is not None else s.get("series", 1),
            points=points,
            measures=a.measures if a.measures is not None else s.get("measures"),
        )
    except ValueError as e:
        print("error: %s" % e, file=sys.stderr)
        return 2
    if inferred:
        out["csv"] = {"rows": s["rows"], "columns": inferred["columns"]}
        out["intent_inferred"] = a.intent is None
    if a.json:
        print(json.dumps(out, indent=2))
        return 0
    sh = out["shape"]
    print(
        "intent: %s%s   x=%s series=%s points=%s"
        % (
            out["intent"],
            " (inferred)" if out.get("intent_inferred") else "",
            sh["x"] or "?",
            sh["series"],
            "?" if sh["points"] is None else sh["points"],
        )
    )
    if inferred:
        for c in inferred["columns"]:
            print(
                "  column %-20s %-11s %d distinct"
                % (c["name"], c["type"], c["distinct"])
            )
    for r in out["recommendations"]:
        print("%d. %s" % (r["rank"], r["form"]))
        for w in r["why"]:
            print("     - %s" % w)
    print("avoid:")
    for item in out["avoid"]:
        print("  x %s" % item)
    return 0


# ------------------------------------------------------------------ palette

# Machado, Oliveira & Fernandes (2009), severity 1.0, applied to linear RGB.
CVD = {
    "protanopia": (
        (0.152286, 1.052583, -0.204868),
        (0.114503, 0.786281, 0.099216),
        (-0.003882, -0.048116, 1.051998),
    ),
    "deuteranopia": (
        (0.367322, 0.860646, -0.227968),
        (0.280085, 0.672501, 0.047413),
        (-0.011820, 0.042940, 0.968881),
    ),
    "tritanopia": (
        (1.255528, -0.076749, -0.178779),
        (-0.078411, 0.930809, 0.147602),
        (0.004733, 0.691367, 0.303900),
    ),
}
MIN_CONTRAST = 3.0  # WCAG 2.x 1.4.11 non-text contrast, for graphical marks
MIN_DELTA_E = 10.0  # CIEDE2000; see reference/color.md for how it was chosen


def parse_hex(s):
    h = s.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.match(r"^[0-9a-fA-F]{6}$", h):
        raise ValueError("not a hex colour: %r" % s)
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def _linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_linear(rgb):
    return tuple(_linear(c) for c in rgb)


def luminance(rgb):
    r, g, b = to_linear(rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a, b):
    """WCAG 2.x contrast ratio between two sRGB colours (0-1 tuples)."""
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def simulate(lin, kind):
    """Linear RGB as seen with a colour-vision deficiency ('normal' = unchanged)."""
    if kind == "normal":
        return lin
    return tuple(
        min(1.0, max(0.0, sum(m * c for m, c in zip(row, lin)))) for row in CVD[kind]
    )


def to_lab(lin):
    """Linear sRGB -> CIE L*a*b* (D65)."""
    r, g, b = lin
    xyz = (
        (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
        0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
        (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883,
    )
    fx, fy, fz = (
        t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116 for t in xyz
    )
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def ciede2000(lab1, lab2):
    """CIEDE2000 colour difference (Sharma, Wu & Dalal 2005 formulation)."""
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    cbar = (math.hypot(a1, b1) + math.hypot(a2, b2)) / 2
    g = 0.5 * (1 - math.sqrt(cbar**7 / (cbar**7 + 25.0**7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if c1p else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if c2p else 0.0
    dl, dc = L2 - L1, c2p - c1p
    if c1p * c2p == 0:
        dh = 0.0
    elif abs(h2p - h1p) <= 180:
        dh = h2p - h1p
    elif h2p - h1p > 180:
        dh = h2p - h1p - 360
    else:
        dh = h2p - h1p + 360
    dH = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dh / 2))
    lbar, cbarp = (L1 + L2) / 2, (c1p + c2p) / 2
    if c1p * c2p == 0:
        hbar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbar = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbar = (h1p + h2p + 360) / 2
    else:
        hbar = (h1p + h2p - 360) / 2
    t = (
        1
        - 0.17 * math.cos(math.radians(hbar - 30))
        + 0.24 * math.cos(math.radians(2 * hbar))
        + 0.32 * math.cos(math.radians(3 * hbar + 6))
        - 0.20 * math.cos(math.radians(4 * hbar - 63))
    )
    sl = 1 + 0.015 * (lbar - 50) ** 2 / math.sqrt(20 + (lbar - 50) ** 2)
    sc = 1 + 0.045 * cbarp
    sh = 1 + 0.015 * cbarp * t
    rc = 2 * math.sqrt(cbarp**7 / (cbarp**7 + 25.0**7))
    rt = -math.sin(math.radians(60 * math.exp(-(((hbar - 275) / 25) ** 2)))) * rc
    return math.sqrt(
        (dl / sl) ** 2 + (dc / sc) ** 2 + (dH / sh) ** 2 + rt * (dc / sc) * (dH / sh)
    )


def delta_e(hex1, hex2, vision="normal"):
    """CIEDE2000 between two hex colours as seen with `vision`."""
    a, b = (to_lab(simulate(to_linear(parse_hex(h)), vision)) for h in (hex1, hex2))
    return ciede2000(a, b)


def check_palette(
    colors, bg="#ffffff", min_contrast=MIN_CONTRAST, min_delta=MIN_DELTA_E
):
    """Contrast of each colour vs bg, and pairwise separation per vision type."""
    bg_rgb = parse_hex(bg)
    contrast = []
    for c in colors:
        ratio = contrast_ratio(parse_hex(c), bg_rgb)
        contrast.append(
            {"color": c, "ratio": round(ratio, 2), "ok": ratio >= min_contrast}
        )
    separation = []
    for vision in ("normal",) + tuple(CVD):
        pairs = []
        for i in range(len(colors)):
            for j in range(i + 1, len(colors)):
                pairs.append((delta_e(colors[i], colors[j], vision), i, j))

        def shown(pair):  # rounded for display only; the gate uses the raw float
            return {
                "a": colors[pair[1]],
                "b": colors[pair[2]],
                "delta_e": round(pair[0], 2),
            }

        failing = [shown(p) for p in pairs if p[0] < min_delta]
        separation.append(
            {
                "vision": vision,
                "min": shown(min(pairs)) if pairs else None,
                "failing": failing,
                "ok": not failing,
            }
        )
    ok = all(c["ok"] for c in contrast) and all(s["ok"] for s in separation)
    return {
        "background": bg,
        "min_contrast": min_contrast,
        "min_delta_e": min_delta,
        "contrast": contrast,
        "separation": separation,
        "ok": ok,
    }


def cmd_palette(a):
    try:
        out = check_palette(a.colors, a.bg, a.min_contrast, a.min_delta)
    except ValueError as e:
        print("error: %s" % e, file=sys.stderr)
        return 2
    if a.json:
        print(json.dumps(out, indent=2))
        return 0 if out["ok"] else 1
    print("background %s" % out["background"])
    print("contrast vs background (min %g:1)" % out["min_contrast"])
    for c in out["contrast"]:
        print(
            "  %-8s %5.2f:1  %s" % (c["color"], c["ratio"], "ok" if c["ok"] else "FAIL")
        )
    print("separation, CIEDE2000 (min %g)" % out["min_delta_e"])
    for s in out["separation"]:
        if s["min"] is None:
            print("  %-13s n/a (one colour)" % s["vision"])
            continue
        m = s["min"]
        print(
            "  %-13s closest %s / %s = %.2f  %s"
            % (s["vision"], m["a"], m["b"], m["delta_e"], "ok" if s["ok"] else "FAIL")
        )
        for p in s["failing"]:
            print("      FAIL %s / %s = %.2f" % (p["a"], p["b"], p["delta_e"]))
    print("result: %s" % ("ok" if out["ok"] else "FAIL"))
    return 0 if out["ok"] else 1


def main(argv=None):
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pk = sub.add_parser("pick", help="rank chart forms for an intent and data shape")
    pk.add_argument("--intent", help=", ".join(INTENTS))
    pk.add_argument(
        "--x",
        choices=X_TYPES,
        help="type of the x / grouping field (geo + numeric = lat/lon points)",
    )
    pk.add_argument("--series", type=int, help="number of series or groups (default 1)")
    pk.add_argument(
        "--points",
        "--categories",
        dest="points",
        type=int,
        help="x positions, categories, slices or observations per series",
    )
    pk.add_argument("--measures", type=int, help="numeric fields (relationship)")
    pk.add_argument("--csv", help="infer column types and shape from a CSV file")
    pk.add_argument("--json", action="store_true")
    pk.set_defaults(fn=cmd_pick)

    pl = sub.add_parser(
        "palette", help="contrast and colour-blind separation of a categorical palette"
    )
    pl.add_argument("colors", nargs="+", help="hex colours, e.g. '#4269d0'")
    pl.add_argument(
        "--bg", default="#ffffff", help="chart background (default #ffffff)"
    )
    pl.add_argument(
        "--min-contrast",
        type=float,
        default=MIN_CONTRAST,
        help="minimum contrast vs background (3 for marks, 4.5 for text)",
    )
    pl.add_argument(
        "--min-delta",
        type=float,
        default=MIN_DELTA_E,
        help="minimum pairwise CIEDE2000",
    )
    pl.add_argument("--json", action="store_true")
    pl.set_defaults(fn=cmd_palette)

    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
