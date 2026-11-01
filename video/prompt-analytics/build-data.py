#!/usr/bin/env python3
"""Scene table -> data.js (composition) and the captions VTT. Boxes come from shots.json
(capture.sh, MOCK dashboard data only). Beats and captions live here, once."""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
VTT = HERE / "../../site/assets/prompt-analytics/prompt-analytics.vtt"
shots = {s["name"]: s for s in json.loads((HERE / "shots.json").read_text())["shots"]}

# shot, dur (s), chip, cap; segs = camera push-ins [{b: box name, d: secs, t: callout}];
# cur = cursor actions [{at, to: box | [box, fx, fy], dur, click}] (to is in the shot's viewport space)
S = [
    dict(
        shot=None,
        dur=3.0,
        chip="",
        cap="Where do your AI coding hours go? Prompt Analytics shows you, locally.",
    ),
    dict(
        shot="overview",
        dur=5.5,
        chip="Overview",
        cap="Totals, trend and what needs attention, at a glance.",
        segs=[
            dict(b=None, d=0.7),
            dict(b="kpis", t="KPIs with deltas"),
            dict(b="attention", t="What needs attention"),
        ],
    ),
    dict(
        shot="tools",
        dur=3.0,
        chip="Tools",
        cap="Which assistant handles which kind of work: the router matrix.",
        segs=[dict(b="router", t="Tool by intent")],
    ),
    dict(
        shot="time-2d",
        dur=3.2,
        chip="Time",
        cap="Activity calendar and hour of week.",
        segs=[dict(b="cal", t="Activity calendar")],
        cur=[dict(at=1.0, to="tog3", dur=1.1), dict(at=2.3, click=1)],
    ),
    dict(
        shot="time-cal3d",
        dur=3.2,
        chip="Time",
        cap="Flip it to 3D, then drag to orbit.",
        segs=[dict(b="cal", t="3D calendar")],
        cur=[
            dict(at=0.5, to=["cal", 0.25, 0.55], dur=0.5),
            dict(at=1.0, click=1),
            dict(at=1.1, to=["cal", 0.75, 0.5], dur=1.9),
        ],
    ),
    dict(
        shot="time-cal3d-orbit",
        dur=2.4,
        chip="Time",
        cap="Same data, new angle.",
        segs=[dict(b="cal")],
    ),
    dict(
        shot="time-hours-2d",
        dur=2.8,
        chip="Time",
        cap="Hour of week, flat.",
        segs=[dict(b="hours", t="Hour by weekday")],
        cur=[dict(at=0.7, to="seg3d", dur=1.1), dict(at=2.4, click=1)],
    ),
    dict(
        shot="time-terrain3d",
        dur=2.5,
        chip="Time",
        cap="Or as a 3D terrain of your working rhythm.",
        segs=[dict(b="hours", t="3D terrain")],
    ),
    dict(
        shot="funnel",
        dur=3.8,
        chip="Funnel",
        cap="Where prompts stall, and which tool switches follow.",
        segs=[
            dict(b="stages", t="Prompt stages"),
            dict(b="switches", t="Tool switches"),
        ],
    ),
    dict(
        shot="friction",
        dur=4.0,
        chip="Friction",
        cap="Friction by tool and by intent.",
        segs=[
            dict(b="signals", t="Signals by tool"),
            dict(b="byIntent", t="Friction by intent"),
        ],
    ),
    dict(
        shot="loopbreak",
        dur=3.2,
        chip="Friction",
        cap="The loop breaker flags retry loops.",
        segs=[dict(b="loop", t="Loop breaker")],
    ),
    dict(
        shot="works",
        dur=3.0,
        chip="What works",
        cap="A playbook distilled from the prompts that succeeded.",
        segs=[dict(b="playbook", t="Playbook")],
    ),
    dict(
        shot="exposure",
        dur=4.2,
        chip="Exposure",
        cap="Secrets and PII are found and masked, never stored raw.",
        segs=[
            dict(b="findings", t="Findings by category"),
            dict(b="kinds", t="Kinds by tool"),
        ],
    ),
    dict(
        shot="sessions-10",
        dur=3.2,
        chip="Sessions",
        cap="Every session in a table. Page ten rows, or more.",
        segs=[dict(b="pager", t="Paging")],
        cur=[dict(at=0.8, to="rows", dur=1.1), dict(at=2.7, click=1)],
    ),
    dict(
        shot="sessions-25",
        dur=2.8,
        chip="Sessions",
        cap="Twenty-five rows. Switch density to fit more.",
        segs=[dict(b="pager", t="25 rows")],
        cur=[dict(at=0.6, to=["dens", 0.75, 0.5], dur=1.1), dict(at=2.3, click=1)],
    ),
    dict(
        shot="sessions-compact",
        dur=2.2,
        chip="Sessions",
        cap="Compact rows.",
        segs=[dict(b="pager", t="Compact density")],
    ),
    dict(
        shot="sessions-pre-export",
        dur=2.3,
        chip="Export",
        cap="Export what you see.",
        segs=[dict(b="exp")],
        cur=[dict(at=0.5, to="exp", dur=1.0), dict(at=1.9, click=1)],
    ),
    dict(
        shot="sessions-export",
        dur=2.5,
        chip="Export",
        cap="CSV, JSON or xlsx.",
        segs=[dict(b="menu", t="CSV / JSON / xlsx")],
    ),
    dict(
        shot="map",
        dur=3.5,
        chip="Map",
        cap="A 3D mind map of your topics.",
        segs=[dict(b="map", t="3D mind map")],
    ),
    dict(
        shot="single-top",
        dur=2.8,
        chip="Any setup",
        cap="Only use one assistant? The dashboard adapts.",
        segs=[dict(b="kpis", t="Single-tool view")],
    ),
    dict(
        shot="single-tools",
        dur=2.8,
        chip="Any setup",
        cap="Sections reshape to your tool.",
        segs=[dict(b="tools")],
    ),
    dict(
        shot="palette",
        dur=3.0,
        chip="Shortcuts",
        cap="Press Cmd+K to jump anywhere.",
        segs=[dict(b="palette", t="Command palette")],
    ),
    dict(
        shot=None,
        dur=4.0,
        chip="",
        cap="Know where your hours go. Run uvx prompt-analytics run.",
    ),
]
for s in S:
    s.setdefault("segs", [])
    s.setdefault("cur", [])
    for g in s["segs"]:
        assert g["b"] is None or g["b"] in shots[s["shot"]]["boxes"], (
            s["shot"],
            g["b"],
        )
    for c in s["cur"]:
        t = c.get("to")
        if t:
            assert (t if isinstance(t, str) else t[0]) in shots[s["shot"]]["boxes"], (
                s["shot"],
                t,
            )

boxes = {n: s["boxes"] for n, s in shots.items()}
total = round(sum(s["dur"] for s in S), 2)
(HERE / "data.js").write_text(
    "window.PA = "
    + json.dumps(dict(scenes=S, boxes=boxes, total=total), separators=(",", ":"))
    + ";\n"
)


def ts(x):
    return f"{int(x // 60):02d}:{x % 60:06.3f}"


t, out = 0.0, ["WEBVTT", ""]
for s in S:
    out += [f"{ts(t)} --> {ts(t + s['dur'])}", s["cap"], ""]
    t += s["dur"]
VTT.write_text("\n".join(out))
print("total", total)
