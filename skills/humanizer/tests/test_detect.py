"""Golden and rule tests for scripts/detect.py. Run with:
python3 -m pytest skills/humanizer/tests/test_detect.py
"""

import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.path.join(HERE.parent, "scripts"))
from detect import DEFAULT_THRESHOLD, compare, detect, main  # noqa: E402

AI = HERE / "fixtures" / "ai.md"
HUMAN = HERE / "fixtures" / "human.md"


def rules(text, **kw):
    return {f["rule"] for f in detect(text, **kw)["findings"]}


def test_golden_ai_sample_is_flagged():
    result = detect(AI.read_text(encoding="utf-8"))
    assert result["score"] >= DEFAULT_THRESHOLD
    got = {f["rule"] for f in result["findings"]}
    for rule in (
        "stock-phrase",
        "not-x-but-y",
        "em-dash",
        "rule-of-three",
        "repeated-opener",
        "emoji-bullet",
        "summary-closer",
        "uniform-length",
    ):
        assert rule in got, rule
    assert main([str(AI)]) == 1


def test_golden_human_sample_passes():
    result = detect(HUMAN.read_text(encoding="utf-8"))
    assert result["score"] < DEFAULT_THRESHOLD
    assert [f for f in result["findings"] if f["category"] == "ai"] == []
    assert main([str(HUMAN)]) == 0


def test_findings_carry_line_refs():
    text = "Plain first line.\n\nWe delve into it.\n"
    (f,) = [f for f in detect(text)["findings"] if f["rule"] == "stock-phrase"]
    assert f["line"] == 3


def test_code_and_urls_are_ignored():
    text = (
        "```\ndelve tapestry -- seamless\n```\n"
        "Run `delve --tapestry` or see https://example.com/delve-tapestry.\n"
    )
    assert detect(text)["findings"] == []


def test_not_x_but_y_forms():
    assert "not-x-but-y" in rules("It is not just a tool, but a platform.")
    assert "not-x-but-y" in rules("This isn't a bug. It's a feature.")


def test_em_dash_needs_a_habit_not_one_use():
    one = "We shipped it — finally. " + "Plain words here. " * 10
    assert "em-dash" not in rules(one)
    many = "A — b. C — d. E — f. G works."
    assert "em-dash" in rules(many)


def test_repeated_opener_spans_wrapped_lines():
    text = "We tried it.\nWe broke\nit. We fixed it.\n"
    assert "repeated-opener" in rules(text)


def test_uniform_length():
    flat = " ".join(["The job runs every night at two."] * 6)
    assert "uniform-length" in rules(flat)
    varied = (
        "It broke. The nightly export failed because the upstream load ran "
        "long and nobody had told cron about the dependency. We fixed it. "
        "Then it broke again on Friday. Ugh. The second fix moved the export "
        "into the orchestrator so it waits for the load to finish first."
    )
    assert "uniform-length" not in rules(varied)


def test_slides_mode_flags_titles_and_long_bullets():
    deck = (
        "Key Takeaways\n"
        "- This bullet keeps going with far too many words for anyone to "
        "read from the back row\n"
    )
    got = rules(deck, slides=True)
    assert {"generic-heading", "long-bullet"} <= got
    assert "long-bullet" not in rules(deck)


def test_grammar_findings_do_not_score():
    result = detect("We ran the the job , then it passed.")
    got = {f["rule"] for f in result["findings"]}
    assert {"doubled-word", "space-before-punct"} <= got
    assert result["score"] == 0


def test_fact_guard_reports_lost_and_added():
    original = "Load took 95 minutes; run `make load` per https://x.io/a.\n"
    good = "The load took 95 minutes. Run `make load` (https://x.io/a).\n"
    assert compare(original, good) == {"lost": [], "added": []}
    bad = "The load took 90 minutes, down 40%. Run `make all`.\n"
    diff = compare(original, bad)
    assert "95" in diff["lost"] and "`make load`" in diff["lost"]
    assert "90" in diff["added"] and "40%" in diff["added"]


def test_fact_guard_cli_exit(tmp_path):
    orig = tmp_path / "o.md"
    orig.write_text("Cost fell 38%.\n", encoding="utf-8")
    same = tmp_path / "s.md"
    same.write_text("The cost fell by 38%.\n", encoding="utf-8")
    changed = tmp_path / "c.md"
    changed.write_text("The cost fell.\n", encoding="utf-8")
    assert main([str(same), "--against", str(orig)]) == 0
    assert main([str(changed), "--against", str(orig)]) == 1


def test_inline_code_before_punctuation_is_not_spacing_error():
    text = "Use `doc-standards`; then run `detect.py --slides`.\n"
    assert "space-before-punct" not in rules(text)


def test_phrases_match_across_hard_wraps():
    text = "The tool, it's worth\nnoting, is not just fast\nbut cheap.\n"
    got = {(f["rule"], f["line"]) for f in detect(text)["findings"]}
    assert ("stock-phrase", 1) in got
    assert ("not-x-but-y", 2) in got


def test_fences_front_matter_and_tables_are_skipped():
    text = (
        "---\ntitle: delve tapestry\n---\n"
        "````md\n```python\ndelve()\n```\nstill code: tapestry\n````\n"
        "| delve | tapestry |\n|---|---|\n"
        "Plain prose after.\n"
    )
    assert detect(text)["findings"] == []


def test_unclosed_fence_runs_to_end():
    assert detect("Fine.\n```\ndelve\n")["findings"] == []


def test_doc_section_titles_only_flag_in_slides():
    assert "generic-heading" not in rules("## Overview\n\nText here.\n")
    assert "generic-heading" in rules("Overview\n", slides=True)
    assert "generic-heading" in rules("## Key Takeaways\n")


def test_check_marks_are_not_emoji_bullets():
    assert "emoji-bullet" not in rules("- \u2713 Linux\n- \u2714 macOS\n")
    assert "emoji-bullet" in rules("- \U0001f680 Ship it\n")


def test_openers_reset_per_paragraph_and_skip_abbreviations():
    paras = "The one.\n\nThe two.\n\nThe three.\n"
    assert "repeated-opener" not in rules(paras)
    abbrev = "We use tools, e.g. Make. We test. We ship.\n"
    assert "repeated-opener" in rules(abbrev)
    assert "repeated-opener" not in rules("We use tools, e.g. Make. We ship.\n")


def test_fact_guard_dates_versions_duplicates_links():
    original = (
        "Released 2024-01-15 as v1.2.3, 3 of 3 retries, 1,000 rows, "
        "see [docs](guide/setup.md).\n"
    )
    assert compare(original, original.replace("1,000", "1000")) == {
        "lost": [],
        "added": [],
    }
    diff = compare(original, original.replace("2024-01-15", "2024-15-01"))
    assert diff == {"lost": ["2024-01-15"], "added": ["2024-15-01"]}
    assert "1.2.3" in compare(original, original.replace("v1.2.3", "v1.2"))["lost"]
    assert compare(original, original.replace("3 of 3", "3"))["lost"] == ["3"]
    gone = compare(original, original.replace("(guide/setup.md)", "(x.md)"))
    assert "guide/setup.md" in gone["lost"]


def test_bad_path_is_usage_error(tmp_path):
    import pytest

    with pytest.raises(SystemExit) as e:
        main([str(tmp_path / "missing.md")])
    assert e.value.code == 2
