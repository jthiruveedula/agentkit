"""Golden tests for scripts/story_lint.py. Run with:
python3 tests/test_story_lint.py        # plain asserts
python3 -m pytest tests/test_story_lint.py
"""

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(SKILL_DIR, "scripts", "story_lint.py")
FIXTURES = os.path.join(SKILL_DIR, "tests", "fixtures")
HEADLINES_DOC = os.path.join(SKILL_DIR, "reference", "headlines.md")

_spec = importlib.util.spec_from_file_location("story_lint", SCRIPT)
story_lint = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(story_lint)

# Headline -> kind. Add a case here before tuning a word list.
GOLDEN_HEADLINES = [
    ("Q3 Results", "topic-label"),
    ("Overview", "topic-label"),
    ("Architecture", "topic-label"),
    ("Next Steps", "topic-label"),
    ("Key Takeaways", "topic-label"),
    ("Results and Discussion", "topic-label"),
    ("Top 5 use cases", "topic-label"),
    ("Quick wins for Q3 2026", "topic-label"),
    ("Budget cuts and hiring plan", "topic-label"),
    ("The budget cuts and hiring plan", "topic-label"),
    ("Improved onboarding for new users", "topic-label"),
    ("Price Increase Timeline", "topic-label"),
    ("Revenue grew", "topic-label"),
    # Noun/verb words used as nouns.
    ("Mean Time to Recovery", "topic-label"),
    ("Cloud Spend by Team", "topic-label"),
    ("Reach and Frequency by Channel", "topic-label"),
    # A participle after a plural noun is a label without a number or object.
    ("Lessons Learned from the Migration", "topic-label"),
    ("Features shipped in Q3", "topic-label"),
    ("Tickets dropped 40% after the fix", "action"),
    # Digits inside names are not numbers.
    ("S3 costs by team", "topic-label"),
    ("p95 latency by region", "topic-label"),
    ("GPT-4 pricing overview", "topic-label"),
    ("Option 1 vs Option 2", "topic-label"),
    # Question-word openers: a label unless they carry a verb and a number.
    ("How it works", "topic-label"),
    ("What we learned in Q3", "topic-label"),
    ("How we cut churn 18% in one quarter", "action"),
    # Word enumerators are stripped only with a separator.
    ("Step 2: Data Collection", "topic-label"),
    ("Phase 2 doubles capacity", "action"),
    ("Churn fell 18%", "action"),
    ("Churn fell 12% after onboarding fix", "action"),
    ("We should ship v2 in March", "action"),
    ("Latency down 40% vs v1", "action"),
    ("From 12 days to 4 minutes", "action"),
    ("Latency drops below 100ms", "action"),
    ("New pricing costs us 12% of signups", "action"),
    ("Half of our alerts are never read", "action"),
    ("The planner switches strategy at 10,000 rows", "action"),
    ("Finds the failing row in 10 seconds, with no config", "action"),
    ("Customers love the guided flow", "action"),
    ("Most teams prefer the weekly digest", "action"),
    ("The rollout goes live in March", "action"),
    ("Approve the $40k migration by Friday", "action"),
    ("**We need two more engineers**", "action"),
    ("What if setup took 4 minutes?", "question"),
]

CLAIM = "## Churn fell 18% after the fix\n\n"
ASK = "We need sign-off.\n"


def _run(*args, stdin=None):
    """Run the CLI. `stdin` may be str or bytes; output is decoded text."""
    if isinstance(stdin, str):
        stdin = stdin.encode("utf-8")
    out = subprocess.run(
        [sys.executable, SCRIPT, *args], input=stdin, capture_output=True
    )
    out.stdout = out.stdout.decode("utf-8")
    out.stderr = out.stderr.decode("utf-8")
    return out


def _fixture(name):
    return os.path.join(FIXTURES, name)


def _codes(result):
    return [f["code"] for f in result["findings"]]


def _kinds(result):
    return [s["kind"] for s in result["sections"]]


def test_golden_headlines():
    for headline, want in GOLDEN_HEADLINES:
        assert story_lint.classify(headline)["kind"] == want, headline


def test_headlines_doc_examples_lint_as_documented():
    with open(HEADLINES_DOC, encoding="utf-8") as fh:
        doc = fh.read()
    table = doc.split("| Topic label | Action title |")[1].split("\n\n")[0]
    rows = [r.strip("| ").split(" | ") for r in table.splitlines()[2:]]
    assert len(rows) >= 10
    for label, action in rows:
        assert story_lint.classify(label)["kind"] == "topic-label", label
        assert story_lint.classify(action)["kind"] == "action", action
    section = doc.split("## When there is no number")[1].split("\n## ")[0]
    bullets = re.findall(r'^- [\w ]+: "(.+)"$', section, re.M)
    read_through = re.findall(r"^\d\. (.+)$", doc.split("```")[3], re.M)
    assert len(bullets) == 4 and len(read_through) == 6
    for headline in bullets + read_through:
        assert story_lint.classify(headline)["kind"] == "action", headline
    # The rewrite the weak-verbs paragraph recommends, and what it replaces.
    quoted = re.findall(r'"([^"]+)" becomes "([^"]+)"', doc.replace("\n", " "))
    assert quoted
    for weak, strong in quoted:
        assert story_lint.classify(weak)["kind"] == "topic-label", weak
        assert story_lint.classify(strong)["kind"] == "action", strong


def test_period_and_name_digits_are_not_numbers():
    for label in ("Q3 2026 results for v2", "s3 p95 gpt-4", "Option 1", "March 3"):
        assert not story_lint.classify(label)["number"], label
    for claim in ("Churn fell 18%", "under $90k", "10,000 rows", "~4 minutes"):
        assert story_lint.classify(claim)["number"], claim


def test_bad_deck_fails():
    out = _run("--json", "--strict", _fixture("bad_deck.md"))
    assert out.returncode == 1, out.stderr
    result = json.loads(out.stdout)
    assert result["mode"] == "slides"
    codes = _codes(result)
    assert codes.count("topic-label") == 5  # title slide is exempt
    for code in ("no-hook", "no-ask", "duplicate-headline", "too-many-bullets"):
        assert codes.count(code) == 1, code
    assert result["sections"][0]["kind"] == "title"
    assert result["summary"]["action_titles"] == 0
    assert result["ok"] is False


def test_bad_deck_exits_zero_without_strict():
    out = _run(_fixture("bad_deck.md"))
    assert out.returncode == 0
    assert '"Overview"' in out.stdout and "topic-label" in out.stdout


def test_good_deck_passes_strict():
    out = _run("--json", "--strict", _fixture("good_deck.md"))
    assert out.returncode == 0, out.stdout
    result = json.loads(out.stdout)
    assert result["findings"] == []
    # Every slide is scored on its own headline, the title included.
    assert _kinds(result) == ["action"] * 6 + ["appendix"]
    assert result["summary"]["action_titles"] == 6


def test_good_heading_outline_passes_from_stdin():
    with open(_fixture("good_outline.md"), encoding="utf-8") as fh:
        out = _run("--strict", "-", stdin=fh.read())
    assert out.returncode == 0, out.stdout
    assert "<stdin> (headings mode" in out.stdout
    assert "0 finding(s)" in out.stdout


def test_filler_detection():
    deck = (
        CLAIM + "In today’s fast-paced world we delve into a game-changing flow.\n\n"
        "```\ndelve\n```\n\n"
        "## Approve the rollout by Friday\n"
    )
    result = story_lint.lint(deck)
    fillers = [f for f in result["findings"] if f["code"] == "filler"]
    assert [f["line"] for f in fillers] == [3, 3, 3]  # fenced code is skipped
    assert _codes(result) == ["filler"] * 3


def test_filler_word_boundaries():
    def fillers(body):
        return [
            f["message"]
            for f in story_lint.lint(CLAIM + body + "\n\n" + ASK)["findings"]
            if f["code"] == "filler"
        ]

    assert fillers("It syncs seamlessly.") == ['filler phrase "seamlessly"; cut it']
    assert fillers("Seamlessness and delvers are not on the list.") == []
    assert (
        fillers("It replaces more than just 3 dashboards and more than just $9.") == []
    )
    assert len(fillers("It is more than just a tool.")) == 1


def test_fences_match_on_char_and_length():
    deck = (
        CLAIM + "````\n```\ndelve\n## Overview\n````\n\n"
        "~~~\n```\nseamless\n~~~\n\n" + ASK
    )
    assert _codes(story_lint.lint(deck)) == []


def test_unclosed_fence_is_reported_and_rest_is_linted():
    deck = CLAIM + "```\ncode\n\n## Overview\n\n" + ASK
    result = story_lint.lint(deck)
    assert _codes(result) == ["unclosed-fence", "topic-label"]
    assert result["findings"][0]["line"] == 3


def test_one_rule_does_not_make_a_deck():
    doc = CLAIM + "Detail.\n\n---\n\n## Approve the rollout by Friday\n"
    assert story_lint.lint(doc)["mode"] == "headings"
    assert story_lint.lint(doc, mode="slides")["mode"] == "slides"
    assert "(slides mode" in _run("--slides", "-", stdin=doc).stdout
    two = doc + "\n---\n\njust text\n"
    assert story_lint.lint(two)["mode"] == "slides"
    assert "no-headline" in _codes(story_lint.lint(two))
    forced = _run("--headings", "--json", "-", stdin=two)
    assert json.loads(forced.stdout)["mode"] == "headings"
    assert _run("--slides", "--headings", "-", stdin=doc).returncode == 2


def test_bom_and_crlf_input():
    raw = ("﻿" + CLAIM + ASK).replace("\n", "\r\n").encode("utf-8")
    out = _run("--json", "--strict", "-", stdin=raw)
    assert out.returncode == 0, out.stdout
    assert json.loads(out.stdout)["sections"][0]["headline"].startswith("Churn fell")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "bom.md")
        with open(path, "wb") as fh:
            fh.write(raw)
        out = _run("--json", "--strict", path)
    assert out.returncode == 0, out.stdout
    assert _kinds(json.loads(out.stdout)) == ["action"]


def test_appendix_needs_a_whole_keyword_headline():
    deck = CLAIM + "## HEAD\n\nDetail.\n\n## Approve the rollout by Friday\n"
    for head in ("Notes from the field", "Sources of churn", "Backup strategy"):
        assert (
            _kinds(story_lint.lint(deck.replace("HEAD", head)))[1] == "topic-label"
        ), head
    for head in (
        "Appendix",
        "Appendix B: cohorts",
        "Backup slides",
        "Sources",
        "Notes",
    ):
        tail = CLAIM + "## Approve the rollout by Friday\n\n## " + head + "\n\n- data\n"
        result = story_lint.lint(tail)
        assert _kinds(result)[-1] == "appendix" and _codes(result) == [], head


def test_ending_with_ask_detection():
    body = CLAIM + "Detail.\n\n"
    for ending in (
        "## Thank you\n\nQuestions?\n",
        "## The team is ready\n\nJoin us. Install the app. Fund the work.\n",
    ):
        assert "no-ask" in _codes(story_lint.lint(body + ending)), ending
    for ending in (
        "## We recommend rolling out to all regions\n",
        "## The rollout plan is ready\n\nDecision needed by Friday.\n",
        "## Next steps: Priya ships the flow to EU in March\n",
    ):
        assert "no-ask" not in _codes(story_lint.lint(body + ending)), ending
    # An appendix after the ask does not hide it.
    tail = "## Approve the $40k budget\n\n## Appendix\n\n- data\n"
    assert _codes(story_lint.lint(body + tail)) == []


def test_opening_hook():
    rest = "\n\n## Approve the $40k rebuild by Friday\n"
    label = "## Quarterly Business Review\n\n"
    # A date is not a hook; a number or a question is.
    for body in ("Updated 2026-03-01 by the growth team.", "Updated March 3, 2026."):
        assert "no-hook" in _codes(story_lint.lint(label + body + rest)), body
    for body in ("One in 4 accounts quit.", "Why do new accounts quit?"):
        assert "no-hook" not in _codes(story_lint.lint(label + body + rest)), body


def test_text_before_first_heading_counts():
    rest = "## Background on the churn problem\n\nDetail.\n\n## Approve the fix by Friday\n"
    assert "no-hook" in _codes(story_lint.lint(rest))
    result = story_lint.lint("In today's world, churn is 18%.\n\n" + rest)
    assert _codes(result) == ["filler", "topic-label"]
    assert result["findings"][0]["line"] == 1


def test_bullet_limit_is_configurable():
    deck = CLAIM + "- a\n- b\n- c\n\n" + ASK
    assert _codes(story_lint.lint(deck)) == []
    assert _codes(story_lint.lint(deck, max_bullets=2)) == ["too-many-bullets"]
    assert _run("--strict", "--max-bullets", "2", "-", stdin=deck).returncode == 1


def test_long_headline_and_missing_slide_headline():
    words = " ".join(["Churn fell 18% after we fixed"] * 4)
    assert _codes(story_lint.lint("## " + words + "\n\nApprove it.\n")) == [
        "long-headline"
    ]
    # Appendix headlines are filing: not scored for length either.
    appendix = CLAIM + ASK + "\n## Appendix: " + words + "\n"
    assert _codes(story_lint.lint(appendix)) == []
    slides = "# Churn fell 18% after the fix\n\n---\n\njust text\n\n---\n\n## Approve it now please\n"
    assert _codes(story_lint.lint(slides)) == ["no-headline"]


def test_questions_are_not_counted_as_action_titles():
    deck = "## What if setup took 4 minutes?\n\n" + CLAIM + ASK
    summary = story_lint.lint(deck)["summary"]
    assert (summary["action_titles"], summary["questions"]) == (1, 1)
    assert summary["headlines_scored"] == 2
    assert (
        "1/2 headlines are action titles, 1 question(s)" in _run("-", stdin=deck).stdout
    )


def test_heading_and_inline_markup():
    _, sections, _, _ = story_lint.parse(
        "## C#\n\n## Why C# ##\n\n####### not a heading\n"
    )
    assert [s["headline"] for s in sections] == ["C#", "Why C#"]
    clean = story_lint.clean_headline
    assert clean("Setup takes <5 minutes, down from >20") == (
        "Setup takes <5 minutes, down from >20"
    )
    assert (
        clean("Churn <b>fell</b> 18%<br/> in [Q3](http://x)") == "Churn fell 18% in Q3"
    )


def test_front_matter_is_not_a_slide_break():
    deck = "---\ntitle: x\n---\n\n" + CLAIM + ASK
    assert story_lint.lint(deck)["mode"] == "headings"


def test_empty_and_missing_input_exit_2():
    out = _run("-", stdin="no headings here\n")
    assert out.returncode == 2 and out.stdout == "" and "no headlines" in out.stderr
    assert _run(_fixture("does-not-exist.md")).returncode == 2
    for args, stdin in ((("--json", "-"), ""), (("--json", _fixture("nope.md")), None)):
        out = _run(*args, stdin=stdin)
        assert out.returncode == 2
        error = json.loads(out.stdout)
        assert error["ok"] is False and error["error"], error


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok {name}")
