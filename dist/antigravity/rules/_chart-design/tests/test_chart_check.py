"""Golden tests for scripts/chart_check.py. Run with:
python3 tests/test_chart_check.py        # plain asserts
python3 -m pytest tests/test_chart_check.py
"""

import contextlib
import json
import os
import subprocess
import sys
import tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(SKILL_DIR, "scripts", "chart_check.py")
sys.path.insert(0, os.path.join(SKILL_DIR, "scripts"))

import chart_check as cc  # noqa: E402

# Palettes and tokens documented in reference/color.md -- they must keep passing.
LIGHT_6 = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#332288", "#882255"]
DARK_6 = ["#56B4E9", "#D55E00", "#009E73", "#CC79A7", "#F0E442", "#E69F00"]
OKABE_ITO = DARK_6 + ["#0072B2", "#000000"]
TAB10 = (
    "#1f77b4 #ff7f0e #2ca02c #d62728 #9467bd #8c564b #e377c2 #7f7f7f #bcbd22 #17becf"
).split()


def _run(*args):
    return subprocess.run(
        [sys.executable, SCRIPT, *args], capture_output=True, text=True
    )


@contextlib.contextmanager
def _csv(text, encoding="utf-8"):
    fd, path = tempfile.mkstemp(suffix=".csv")
    try:
        with os.fdopen(fd, "w", encoding=encoding, newline="") as fh:
            fh.write(text)
        yield path
    finally:
        os.unlink(path)


def _infer(text, **kw):
    with _csv(text, **kw) as path:
        return cc.infer_csv(path)


def _types(text, **kw):
    return [c["type"] for c in _infer(text, **kw)["columns"]]


def _top(**kw):
    return cc.recommend(**kw)["recommendations"][0]["form"]


def _raises(fn, *args, **kw):
    try:
        fn(*args, **kw)
    except ValueError as e:
        return str(e)
    raise AssertionError("expected ValueError")


# ------------------------------------------------------------------ palette


def test_contrast_golden():
    white = cc.parse_hex("#ffffff")
    assert round(cc.contrast_ratio(cc.parse_hex("#767676"), white), 2) == 4.54
    assert round(cc.contrast_ratio(cc.parse_hex("#000"), white), 2) == 21.0
    assert round(cc.contrast_ratio(white, white), 2) == 1.0


def test_ciede2000_sharma_pairs():
    # Sharma, Wu & Dalal (2005) test data, incl. the hue-wrap (pairs with
    # hue angles straddling 0/360) and zero-chroma branches.
    pairs = [
        ((50, 2.6772, -79.7751), (50, 0, -82.7485), 2.0425),
        ((50, 2.5, 0), (50, 0, -2.5), 4.3065),
        ((50, 2.5, 0), (73, 25, -18), 27.1492),
        ((50, 2.5, 0), (50, 3.1736, 0.5854), 1.0000),
        ((50, 2.49, -0.001), (50, -2.49, 0.0009), 7.1792),
        ((50, 2.49, -0.001), (50, -2.49, 0.0011), 7.2195),
        ((50, -0.001, 2.49), (50, 0.0009, -2.49), 4.8045),
        ((50, 0, 0), (50, -1, 2), 2.3669),  # zero chroma on one side
        ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
        ((2.0776, 0.0795, -1.1350), (0.9033, -0.0636, -0.5514), 0.9082),
    ]
    for a, b, want in pairs:
        assert round(cc.ciede2000(a, b), 4) == want, (a, b)
        assert round(cc.ciede2000(b, a), 4) == want, (b, a)  # symmetric


def test_lab_white_point():
    L, a, b = cc.to_lab((1.0, 1.0, 1.0))
    assert abs(L - 100) < 1e-3 and abs(a) < 1e-3 and abs(b) < 1e-3
    assert cc.to_lab((0.0, 0.0, 0.0)) == (0.0, 0.0, 0.0)


def test_cvd_simulation_of_pure_red():
    # First column of each Machado (2009) severity-1.0 matrix, clamped to 0-1.
    red = cc.to_linear(cc.parse_hex("#ff0000"))
    want = {
        "normal": (1.0, 0.0, 0.0),
        "protanopia": (0.152, 0.115, 0.0),
        "deuteranopia": (0.367, 0.280, 0.0),
        "tritanopia": (1.0, 0.0, 0.005),
    }
    for vision, rgb in want.items():
        got = tuple(round(c, 3) for c in cc.simulate(red, vision))
        assert got == rgb, (vision, got)


def test_red_green_fails_deuteranopia_only():
    out = cc.check_palette(["#d62728", "#2ca02c"])
    by = {s["vision"]: s for s in out["separation"]}
    assert by["normal"]["ok"] and by["normal"]["min"]["delta_e"] > 50
    assert not by["deuteranopia"]["ok"]
    assert by["tritanopia"]["ok"]
    assert not out["ok"]


def test_separation_gate_uses_unrounded_delta():
    pair = ["#d62728", "#2ca02c"]
    raw = cc.delta_e(*pair, vision="protanopia")
    shown = round(raw, 2)
    # a threshold just above the raw value must fail even though the
    # displayed (rounded) number equals it or rounds up past it
    for eps in (1e-6, 0.004):
        out = cc.check_palette(pair, min_delta=raw + eps)
        by = {s["vision"]: s for s in out["separation"]}
        assert not by["protanopia"]["ok"], eps
        assert by["protanopia"]["failing"][0]["delta_e"] == shown
    by = {s["vision"]: s for s in cc.check_palette(pair, min_delta=raw)["separation"]}
    assert by["protanopia"]["ok"]


def test_low_contrast_flagged():
    out = cc.check_palette(["#F0E442"], bg="#ffffff")  # yellow on white
    assert out["contrast"][0]["ok"] is False and not out["ok"]
    assert cc.check_palette(["#F0E442"], bg="#111418")["ok"]


def test_reference_palettes_pass():
    assert cc.check_palette(LIGHT_6, bg="#ffffff")["ok"]
    assert cc.check_palette(DARK_6, bg="#111418")["ok"]
    assert cc.check_palette(["#0072B2", "#8a9099"], bg="#ffffff")["ok"]
    assert cc.check_palette(["#56B4E9", "#7b828c"], bg="#111418")["ok"]
    assert cc.check_palette(["#0072B2", "#D55E00"], bg="#ffffff")["ok"]


def test_reference_text_tokens_meet_text_contrast():
    # --chart-ink and --chart-muted in reference/color.md, per theme
    for bg, tokens in (
        ("#ffffff", ["#1b1f24", "#5b6470"]),
        ("#111418", ["#e6e8eb", "#9aa1ab"]),
    ):
        out = cc.check_palette(tokens, bg=bg, min_contrast=4.5, min_delta=0)
        assert all(c["ok"] for c in out["contrast"]), out["contrast"]


def test_threshold_claims_in_color_md():
    # "Okabe-Ito bottoms out at 10.9; tab10 has pairs under 4 for protan
    # and deutan vision" -- the basis for the default threshold of 10.
    seps = cc.check_palette(OKABE_ITO, bg="#111418")["separation"]
    assert all(s["ok"] for s in seps)
    assert round(min(s["min"]["delta_e"] for s in seps), 1) == 10.9
    by = {
        s["vision"]: s["min"]["delta_e"] for s in cc.check_palette(TAB10)["separation"]
    }
    assert by["protanopia"] == 1.25 and by["deuteranopia"] < 4


def test_palette_cli_exit_codes():
    assert _run("palette", *LIGHT_6).returncode == 0
    bad = _run("palette", "#d62728", "#2ca02c", "--json")
    assert bad.returncode == 1
    assert json.loads(bad.stdout)["ok"] is False
    assert _run("palette", "#nothex").returncode == 2


# --------------------------------------------------------------------- pick


def test_temporal_numeric_picks_line():
    assert _top(intent="trend", x="temporal", series=3, points=40) == "line chart"
    assert _top(intent="trend", x="temporal", points=200) == "line chart"


def test_many_series_avoids_spaghetti():
    top = _top(intent="trend", x="temporal", series=12, points=40)
    assert top.startswith("small-multiple")


def test_one_value_picks_stat_tile():
    for intent in cc.INTENTS:
        assert _top(intent=intent, points=1) == "stat tile"


def test_two_values_are_a_sentence_not_a_chart():
    for intent in ("trend", "comparison", "part-to-whole"):
        assert _top(intent=intent, points=2) == "stat tile with delta", intent
    # two categories x several series is a real comparison again
    assert _top(intent="comparison", points=2, series=3) != "stat tile with delta"


def test_many_slices_never_pie():
    out = cc.recommend("part-to-whole", x="categorical", points=9)
    forms = [r["form"] for r in out["recommendations"]]
    assert forms[0].startswith("horizontal bar")
    assert not any("pie" in f or "donut" in f for f in forms)
    assert any("pie" in a for a in out["avoid"])
    assert "pie" in _top(intent="part-to-whole", points=3)


def test_other_intents():
    assert _top(intent="comparison", x="categorical", points=12).startswith(
        "horizontal bar"
    )
    assert _top(intent="comparison", points=8, series=2).startswith("dumbbell")
    assert _top(intent="distribution", points=500) == "histogram"
    assert _top(intent="distribution", points=12).startswith("strip")
    assert _top(intent="relationship", points=300) == "scatter plot"
    assert _top(intent="relationship", points=50000).startswith("hexbin")
    assert _top(intent="flow", points=12, series=3) == "Sankey diagram"
    assert _top(intent="flow", x="ordinal", points=5).startswith("funnel")
    assert _top(intent="geo", points=50) == "choropleth map"
    assert _top(intent="geo", points=6).startswith("horizontal bar")
    assert _top(intent="geo", x="numeric", points=300) == "point (dot) map"
    assert _top(intent="correlation", points=300) == "scatter plot"  # alias


def test_deterministic():
    a = cc.recommend("trend", x="temporal", series=3, points=40)
    assert a == cc.recommend("trend", x="temporal", series=3, points=40)


def test_shape_flags_must_be_positive():
    assert "points" in _raises(cc.recommend, "trend", points=0)
    assert "series" in _raises(cc.recommend, "trend", points=5, series=0)
    assert "series" in _raises(cc.recommend, "trend", points=5, series=-2)
    assert _run("pick", "--intent", "trend", "--points", "0").returncode == 2
    assert _run("pick", "--intent", "trend", "--series", "-1").returncode == 2


# ---------------------------------------------------------------------- csv


def test_csv_inference_long_format():
    rows = ["date,region,revenue"]
    for m in range(1, 13):
        for region in ("north", "south", "west"):
            rows.append("2025-%02d-01,%s,%d" % (m, region, 100 * m))
    info = _infer("\n".join(rows) + "\n")
    types = [c["type"] for c in info["columns"]]
    assert types == ["temporal", "categorical", "numeric"]
    assert info["intent"] == "trend"
    assert info["shape"]["points"] == 12 and info["shape"]["series"] == 3
    assert info["shape"]["rows"] == 36


def test_date_formats():
    for value in (
        "2025-01-31",
        "2025/01/31",
        "31.12.2025",
        "1/31/2025",
        '"Jan 5, 2025"',
        "5-Jan-2025",
        "2025-W03",
        "2025-Q1",
        "Q3 2024",
        "January 2025",
        "Sept-24",
        "2025-01-31T09:30:00Z",
    ):
        assert _types("when,v\n%s,1\n" % value) == ["temporal", "numeric"], value
    # words that merely start like a month are not dates
    for value in ("Marketing", "Junior", "Mayor", "Decimal", "Augusta", "1.5"):
        assert _types("when,v\n%s,1\n" % value)[0] != "temporal", value


def test_numeric_parsing_is_strict():
    for value in ("42", "-3.5", '"1,204"', '"$1,234,567.89"', "12%", "1e6", ".5"):
        assert _types("label,v\na,%s\n" % value)[1] == "numeric", value
    for value in ("555 123 4567", '"1,23,4"', '"12,3456"', "1-2", "12 apples", "%"):
        assert _types("label,v\na,%s\n" % value)[1] == "categorical", value


def test_percent_column_is_a_measure():
    info = _infer("plan,conversion\nfree,2.5%\npro,11%\nteam,14.2%\n")
    assert [c["type"] for c in info["columns"]] == ["categorical", "numeric"]
    assert info["intent"] == "comparison" and info["shape"]["points"] == 3


def test_temporal_beats_geo():
    info = _infer(
        "month,country,revenue\n2025-01,FR,10\n2025-01,DE,12\n2025-02,FR,11\n2025-02,DE,9\n"
    )
    assert [c["type"] for c in info["columns"]] == ["temporal", "geo", "numeric"]
    assert info["intent"] == "trend"
    assert info["shape"]["points"] == 2 and info["shape"]["series"] == 2


def test_state_header_needs_region_codes():
    orders = _infer("state,count\nopen,5\nclosed,9\npending,2\n")
    assert orders["columns"][0]["type"] == "categorical"
    assert orders["intent"] == "comparison"
    usa = _infer("state,rate\nCA,5.1\nTX,4.0\nNY,4.4\n")
    assert usa["columns"][0]["type"] == "geo" and usa["intent"] == "geo"
    # a name-like geo header holding numbers is not a region column
    assert _types("city,v\n1,2\n3,4\n")[0] == "numeric"


def test_lat_lon_are_numeric_and_pick_a_point_map():
    text = "name,lat,lng,visits\na,48.85,2.35,10\nb,51.50,-0.12,7\nc,40.71,-74.0,3\n"
    info = _infer(text)
    assert [c["type"] for c in info["columns"]][1:] == ["numeric"] * 3
    assert info["intent"] == "geo" and info["shape"]["x"] == "numeric"
    assert info["shape"]["measures"] == 1  # the coordinate pair is not a measure
    with _csv(text) as path:
        out = json.loads(_run("pick", "--csv", path, "--json").stdout)
    forms = [r["form"] for r in out["recommendations"]]
    assert forms[0] == "point (dot) map"
    assert not any("choropleth" in f for f in forms)
    # latitude alone is just a number
    assert _infer("lat,v\n1.5,2\n2.5,3\n")["intent"] == "relationship"


def test_delimiters_bom_and_ragged_rows():
    semi = _infer("team;headcount\nplatform;12\ndata;7\n")
    assert [c["type"] for c in semi["columns"]] == ["categorical", "numeric"]
    tab = _infer("date\tvalue\n2025-01-01\t3\n2025-01-02\t4\n")
    assert [c["type"] for c in tab["columns"]] == ["temporal", "numeric"]
    decimal_comma = _infer("team;score\na;12,5\nb;7,25\n")
    assert decimal_comma["columns"][1]["type"] == "numeric"

    bom = _infer("date,value\n2025-01-01,3\n2025-01-02,4\n", encoding="utf-8-sig")
    assert bom["columns"][0] == {"name": "date", "type": "temporal", "distinct": 2}

    ragged = _infer("team,headcount\nplatform,12,extra,cells\ndata\n\nweb,3\n")
    assert ragged["shape"]["rows"] == 3  # blank line skipped
    assert [c["type"] for c in ragged["columns"]] == ["categorical", "numeric"]
    assert ragged["columns"][0]["distinct"] == 3


def test_csv_without_data_is_a_usage_error():
    for text in ("", "\n\n", "team,headcount\n", "team,headcount\n,\n"):
        with _csv(text) as path:
            assert "no data rows" in _raises(cc.infer_csv, path), repr(text)
            res = _run("pick", "--csv", path)
            assert res.returncode == 2 and "no data rows" in res.stderr


def test_malformed_csv_is_a_usage_error():
    with _csv("a,b\n1,2\n") as path:
        with open(path, "wb") as fh:
            fh.write(b"a,b\n1,\x00\xff\xfe\n")  # not UTF-8
        assert _run("pick", "--csv", path).returncode == 2
    huge = "a,b\n" + '"' + "x" * (cc.csv.field_size_limit() + 10) + '",1\n'
    with _csv(huge) as path:  # csv.Error: field larger than field limit
        res = _run("pick", "--csv", path)
        assert res.returncode == 2 and "Traceback" not in res.stderr


def test_csv_cli_picks_and_overrides():
    with _csv('team,headcount\nplatform,12\ndata,7\nweb,"1,204"\nml,5\n') as path:
        out = json.loads(_run("pick", "--csv", path, "--json").stdout)
        assert out["intent"] == "comparison" and out["intent_inferred"] is True
        assert out["shape"]["points"] == 4
        assert out["recommendations"][0]["form"].startswith("horizontal bar")
        args = ("pick", "--csv", path, "--intent", "part-to-whole", "--json")
        out = json.loads(_run(*args).stdout)
        assert out["intent"] == "part-to-whole" and out["intent_inferred"] is False

    with _csv("revenue\n1234\n") as path:
        out = json.loads(_run("pick", "--csv", path, "--json").stdout)
        assert out["recommendations"][0]["form"] == "stat tile"


def test_pick_usage_errors():
    assert _run("pick").returncode == 2
    assert _run("pick", "--intent", "vibes").returncode == 2
    assert _run("pick", "--csv", "/nonexistent.csv").returncode == 2


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
