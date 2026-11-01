"""One-tool installs: no cross-tool headlines, no cost-ranked insights when nothing is priced."""

from __future__ import annotations

import pytest
import synth
from prompt_analytics import export
from prompt_analytics.insights import NAMES

CROSS_TOOL = (
    "footprint.top_source",
    "footprint.cost_source",
    "recommend.summary.top_tool",
)


def _data(profile: str) -> dict:
    cfg, con, _ = synth.build_analyzed(profile=profile)
    return export.build(con, cfg)


@pytest.mark.parametrize("profile", ["single-claude", "single-copilot"])
def test_one_source_has_no_cross_tool_insights(profile: str) -> None:
    d = _data(profile)
    srcs = {r["source"] for r in d["sessions"]}
    assert len(srcs) == 1
    ids = {i["id"] for i in d["insights"]}
    assert not ids & set(CROSS_TOOL)
    claims = " ".join(i["claim"] for i in d["insights"])
    others = [n for s, n in NAMES.items() if s not in srcs]
    assert not any(n in claims for n in others), "names a tool the user never ran"
    assert "1 tools" not in claims and "100% of your" not in claims
    summary = next(i for i in d["insights"] if i["id"] == "recommend.summary.sessions")
    assert summary["claim"].endswith(f"in {NAMES[synth.SINGLE[profile]]}")


def test_unpriced_source_never_ranks_on_cost() -> None:
    d = _data("single-copilot")
    assert all(r["cost_usd"] is None for r in d["sessions"])
    for i in d["insights"]:
        assert i["unit"] != "USD", i["id"]
        assert "cost" not in i["metric"] and "spend" not in i["metric"], i["id"]
    assert not any(
        "spend" in (r.get("title") or "").lower() for r in d["recommendations"]
    )
