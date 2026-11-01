#!/usr/bin/env python3
"""Distil the MOCK dashboard sample into data.js for the composition. Mock data only."""

import json
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "../../packages/prompt-analytics/dashboard/src/data/sample.json"
d = json.loads(SRC.read_text())
MOCK = {
    "atlas-api",
    "orbit-web",
    "ledger-etl",
    "nimbus-cli",
    "quill-mobile",
    "helio-docs",
}
assert all(s["project"] in MOCK for s in d["sessions"]), (
    "sample.json is not the mock profile"
)
start = date.fromisoformat(d["range"]["start"])
cal = [
    [(date.fromisoformat(c["date"]) - start).days, c["prompts"]] for c in d["calendar"]
]
stages = [sum(i["counts"][k] for i in d["funnel"]["by_intent"]) for k in range(6)]
rates = d["friction"]["rates"]
n = sum(r["n"] for r in rates)
keys = ("correction", "frustration", "rephrase", "interrupted", "abandoned")
fr = {k: sum(r[k] * r["n"] for r in rates) / n for k in keys}
cl = sorted(d["galaxy"]["clusters"], key=lambda c: -c["size"])[:6]
out = {
    "range": d["range"],
    "totals": d["totals"],
    "start_dow": start.weekday(),
    "by_source": [
        {k: s[k] for k in ("source", "sessions", "prompts", "cost_usd")}
        for s in d["by_source"]
    ],
    "cal": cal,
    "stages": stages,
    "friction": fr,
    "clusters": [
        {k: c[k] for k in ("label", "size", "intent", "success", "exemplar")}
        for c in cl
    ],
    "exposure": {
        "sessions": d["exposure"]["sessions"],
        "share": d["exposure"]["share"],
    },
}
(HERE / "data.js").write_text(
    "window.PA = " + json.dumps(out, separators=(",", ":")) + ";\n"
)
print(out["stages"], out["friction"], out["clusters"][0])
