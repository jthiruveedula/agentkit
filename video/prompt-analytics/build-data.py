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
        cap="What changed in your AI coding, why, and what next?",
    ),
    dict(
        shot="overview",
        dur=4.8,
        chip="Briefing",
        cap="The briefing leads: more sessions are struggling.",
        segs=[
            dict(b=None, d=0.7),
            dict(b="head", t="Compact header"),
            dict(b="brief", t="3.9% to 11.0%"),
        ],
    ),
    dict(
        shot="keynums",
        dur=7.4,
        chip="Key numbers",
        cap="Key numbers: spend, tokens and applied rate, vs the earlier window.",
        segs=[
            dict(b="card", d=1.0),
            dict(b="k1", t="Sessions, top model, spend"),
            dict(b="k2", t="Tokens by tier, cost per change"),
            dict(b="k3", t="Applied-rate gauge, exposure"),
        ],
    ),
    dict(
        shot="mix",
        dur=5.0,
        chip="Usage mix",
        cap="Usage mix: which models and tools carry the work.",
        segs=[
            dict(b="models", t="Model mix"),
            dict(b="tools", t="Tokens and spend by tool"),
            dict(b="tiers", t="Model tier mix"),
        ],
    ),
    dict(
        shot="driver",
        dur=3.6,
        chip="Why",
        cap="Why: mostly billing-api and bugfix.",
        segs=[dict(b="driver", t="Where the change came from")],
    ),
    dict(
        shot="tools",
        dur=3.4,
        chip="Tools",
        cap="Which tool lands the work, and at what cost.",
        segs=[
            dict(b="resolved", t="Resolved rate"),
            dict(b="struggled", t="Struggled by tool"),
        ],
    ),
    dict(
        shot="time-2d",
        dur=3.0,
        chip="Time",
        cap="When the work happens.",
        segs=[dict(b="cal", t="Activity calendar")],
        cur=[dict(at=0.8, to="tog3", dur=1.0), dict(at=2.0, click=1)],
    ),
    dict(
        shot="time-cal3d",
        dur=2.6,
        chip="Time",
        cap="Flip it to 3D.",
        segs=[dict(b="cal", t="3D calendar")],
    ),
    dict(
        shot="time-terrain3d",
        dur=2.8,
        chip="Time",
        cap="Or a 3D terrain of your rhythm.",
        segs=[dict(b="hours", t="3D terrain")],
    ),
    dict(
        shot="funnel",
        dur=3.2,
        chip="Funnel",
        cap="Where sessions stall on the way to resolved.",
        segs=[
            dict(b="stages", t="Session to resolved"),
            dict(b="switches", t="Tool switches"),
        ],
    ),
    dict(
        shot="friction",
        dur=3.0,
        chip="Friction",
        cap="The signals behind the struggle.",
        segs=[
            dict(b="signals", t="Signals"),
            dict(b="byIntent", t="Retries by intent"),
        ],
    ),
    dict(
        shot="models",
        dur=3.0,
        chip="Model fit",
        cap="Is the model sized to the task?",
        segs=[
            dict(b="grid", t="Task size by model tier"),
            dict(b="change", t="What to change"),
        ],
    ),
    dict(
        shot="works",
        dur=2.8,
        chip="What works",
        cap="Habits that pay off, backed by tests.",
        segs=[dict(b="playbook", t="Prompt playbook")],
    ),
    dict(
        shot="works-radar",
        dur=2.4,
        chip="What works",
        cap="Your quality profile and best sessions.",
        segs=[dict(b="radar", t="Quality profile")],
    ),
    dict(
        shot="recs",
        dur=2.8,
        chip="Next",
        cap="What to do next, in order.",
        segs=[dict(b="next", t="Do next, in order")],
    ),
    dict(
        shot="exposure",
        dur=3.5,
        chip="Exposure",
        cap="Secrets and PII are masked in the review queue.",
        segs=[dict(b="queue", t="Review queue, masked")],
    ),
    dict(
        shot="map",
        dur=2.6,
        chip="Map",
        cap="How your work connects, as a sunburst.",
        segs=[dict(b="sb", t="Sunburst mind map")],
        cur=[dict(at=0.9, to="bugfix", dur=0.8), dict(at=2.0, click=1)],
    ),
    dict(
        shot="map-zoom",
        dur=2.6,
        chip="Map",
        cap="Click a branch to zoom in.",
        segs=[dict(b="sb")],
        cur=[dict(at=0.6, to="billing", dur=0.9), dict(at=1.9, click=1)],
    ),
    dict(
        shot="map-ses",
        dur=2.2,
        chip="Map",
        cap="Down to a single session.",
        segs=[dict(b="sb")],
        cur=[dict(at=0.5, to="ses", dur=0.8), dict(at=1.6, click=1)],
    ),
    dict(
        shot="map-panel",
        dur=2.8,
        chip="Map",
        cap="Its detail opens beside the map.",
        segs=[dict(b="panel", t="Session detail")],
    ),
    dict(
        shot="palette",
        dur=2.4,
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
