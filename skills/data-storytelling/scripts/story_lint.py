#!/usr/bin/env python3
"""Lint a markdown outline, deck or script for story structure.

    python3 scripts/story_lint.py deck.md            # human report
    python3 scripts/story_lint.py deck.md --json     # machine-readable
    cat outline.md | python3 scripts/story_lint.py - --strict

Headlines are markdown headings (#, ##, ###) or, when the input has
`---` slide separators (Marp / reveal style), the first heading of each
slide. Per headline it reports topic label vs action title; per section,
filler phrases and bullet overload; per deck, an opening hook, a closing
ask and duplicated headlines.

Slides mode is chosen when the input has two or more `---` separators;
force either reading with --slides or --headings. Setext headings (a line
underlined with === or ---) are not supported: use # headings.

Deterministic and stdlib-only: word lists and regexes, no NLP. It is a
floor, not a grade. Exit 0 by default, 1 with --strict when there is any
finding, 2 on unreadable or empty input.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

# ponytail: verb detection is word lists plus position rules, not a parser.
# Known limits, all on the side of calling a real claim a label:
#   - a verb missing from the lists reads as a noun (add it, with a golden
#     case in tests/, rather than reaching for an NLP library);
#   - a participle right after a plural noun ("Lessons Learned", "Features
#     shipped in Q3") only counts when the headline also has a number or the
#     verb takes an object, so "Customers churned after the rise" is a label;
#   - a noun/verb word between two nouns ("Sales lead generation") is a
#     guess from plural and -s agreement and can go either way;
#   - a digit only counts as a number when the token starts with it (40%,
#     $90k, 10,000) and is not a period, version, date or "Option 2" label,
#     so s3, p95 and gpt-4 are names.

# Verbs that are rarely nouns: base and -s forms count mid-headline, the
# base form counts as an imperative when it opens the headline.
STRONG = """
abandon accept adopt agree allow approve arrive assume avoid become begin
believe belong blame bring buy carry choose collect come complain confirm
consider contain continue create decide deliver depend describe deserve
destroy disappear discover eliminate enable enjoy exceed exist expand expect
explain fail feel find finish follow forget forgive get give go grow halve
happen hate hear ignore improve include introduce invest involve keep kill
know learn listen lose love make migrate outpace outperform perform predict
prefer prevent produce protect prove provide pull push receive recover
reduce refuse reject rely remain remember remove replace require retire
reveal say seem sell send shrink simplify solve stall stay struggle succeed
suffer suggest survive take teach tell tend think underperform understand
wonder worry write
""".split()

# Verbs that are just as often nouns ("quick wins", "budget cuts", "use
# cases", "cloud spend"). Base and -s forms need context: a subject pronoun
# before, an object right after, or subject agreement (see has_verb).
AMBIG = """
add ask beat block break build call cause change churn claim climb close
convert cost cover crash cut decrease delay dip double drive drop earn end
fall fix fund hide hire hit hold increase install interview jump land launch
lead leave let lift look match mean miss move name need notice offer open
pass pay peak pick plan put quit raise reach release repeat return rise run
save scale see serve set ship show sign skip slip slow spend spike start
stop support surge switch test triple try turn use wait want waste win work
""".split()

IRREGULAR_PAST = {
    "become": "became", "begin": "began", "bring": "brought",
    "buy": "bought", "choose": "chose", "come": "came", "find": "found",
    "forget": "forgot", "get": "got", "give": "gave", "go": "went",
    "grow": "grew", "keep": "kept", "know": "knew", "lose": "lost",
    "make": "made", "mean": "meant", "sell": "sold", "send": "sent",
    "shrink": "shrank", "spend": "spent", "take": "took", "tell": "told",
    "think": "thought", "write": "wrote", "beat": "beat", "break": "broke",
    "build": "built", "cost": "cost", "cut": "cut", "drive": "drove",
    "fall": "fell", "hide": "hid", "hit": "hit", "hold": "held",
    "lead": "led", "leave": "", "let": "let", "pay": "paid", "put": "put",
    "quit": "quit", "rise": "rose", "run": "ran", "see": "saw", "set": "set",
    "win": "won", "feel": "felt", "hear": "heard", "say": "said",
    "teach": "taught", "understand": "understood", "forgive": "forgave",
}  # fmt: skip
DOUBLED = {"drop", "ship", "skip", "slip", "stop", "plan", "dip", "prefer"}
# Simple pasts that cannot be read as participles ("fell", never "fallen"),
# and quantity verbs: both are verbs wherever they stand.
ALWAYS_VERB = set(
    """
fell grew rose went took broke drove chose wrote knew saw ran became began
came gave hid shrank forgot forgave doubled tripled halved
""".split()
)

AUX = set(
    """
is are was were be been has have had will would can could should must
does did do cannot it's that's there's here's let's
""".split()
)
SUBJECT_PRONOUNS = {"we", "you", "they", "i", "it", "he", "she"}
OBJECT_STARTERS = set(
    """
the a an our your their its this that these those every each all us them
you it me him her more less most
""".split()
)
# Words that follow a verb, not a noun: "drops below 100ms", "ship daily".
VERB_FOLLOWERS = set(
    """
to below above under over past from daily weekly monthly yearly faster
slower first last again now today twice
""".split()
)
DETERMINERS = {"the", "a", "an", "our", "this", "that", "every", "each"}
# A verb-shaped word right after one of these is a noun or an adjective.
NOUN_MARKERS = set(
    """
the a an our your their its this that these those of for with in on by
and or new top key quick no
""".split()
)
# A noun/verb word followed by one of these is the noun of a label.
STOP_AFTER = set("and or for of in on with by at per vs vs. versus &".split())
LABEL_NOUNS = set(
    """
overview summary plan plans results review report update updates timeline
roadmap analysis status list options breakdown metrics process
details schedule notes agenda checklist guide template
""".split()
)
NOT_PLURAL = {"sales", "always", "perhaps", "versus"}
COMPARISON = set(
    """
vs vs. versus than up down faster slower fewer more less higher lower
twice half before after instead cheaper bigger smaller better worse
""".split()
)
NUMBER_WORDS = set(
    """
zero two three four five six seven eight nine ten twice half double triple
hundred thousand million billion
""".split()
)
QUESTION_OPENERS = {"how", "what", "why", "when", "where", "who", "which"}

# Period, version, issue and date labels carry a digit but no "so what".
LABEL_TOKEN = re.compile(
    r"^(q[1-4]|h[12]|fy'?\d{2,4}|v\d+(\.\d+)*|\d+\.\d+\.\d+|(19|20)\d\d|#\d+"
    r"|\d{4}-\d{1,2}(-\d{1,2})?|\d{1,2}/\d{1,2}(/\d{2,4})?)$"
)
NUMBER_TOKEN = re.compile(r"^[~<>≈+\-$€£]*\.?\d")
# "Option 2", "Phase 1", "March 3": the digit is part of a name or a date.
DIGIT_LABEL_WORDS = set(
    """
option phase part step section chapter slide act version release sprint
week day quarter tier level stage round wave figure table item group type
appendix jan feb mar apr may jun jul aug sep sept oct nov dec january
february march april june july august september october november december
""".split()
)
# "3." always; "Step 2:" only with its separator, so "Phase 2 doubles
# capacity" keeps its subject.
ENUMERATOR = re.compile(
    r"^\s*(\d+[.)]\s+"
    r"|(step|part|slide|section|chapter|phase|act)\s+\d+\s*[:.)\-–—]\s+)",
    re.I,
)

FILLER = [
    "in today's world",
    "in today's digital",
    "in today's competitive",
    "today's fast-paced",
    "fast-paced",
    "ever-evolving",
    "ever-changing",
    "delve",
    "delves",
    "delving",
    "game-changer",
    "game-changers",
    "game-changing",
    "cutting-edge",
    "state-of-the-art",
    "best-in-class",
    "world-class",
    "next-generation",
    "revolutionary",
    "revolutionize",
    "revolutionizes",
    "seamless",
    "seamlessly",
    "synergy",
    "synergies",
    "holistic",
    "paradigm shift",
    "unlock the power",
    "unleash",
    "unleashes",
    "supercharge",
    "supercharges",
    "supercharged",
    "to the next level",
    "at the end of the day",
    "it's worth noting",
    "it is worth noting",
    "it is important to note",
    "needless to say",
    "without further ado",
    "let's dive in",
    "in conclusion",
    "testament to",
    "tapestry",
    "look no further",
    "when it comes to",
]
# "more than just 3 dashboards" is a count, not a tic.
FILLER_RE = re.compile(
    r"(?<![a-z])("
    + "|".join(re.escape(p) for p in sorted(FILLER, key=len, reverse=True))
    + r"|more than just(?!\s*[\d$])"
    + r")\b",
    re.I,
)

ASK_RE = re.compile(
    r"\b("
    r"approv(e|al)|decide|decision|the ask|we ask|ask(ing)? (you|for)|"
    r"next steps?|we need|need(ed)? from you|recommend(ation|ed|s)?|"
    r"sign[- ]off|call to action|go/no-go|greenlight|commit to|"
    r"get started|try (it|this)|sign up|download|"
    r"start (with|by|here|today|now)|do this (next|now|first)|"
    r"by (monday|tuesday|wednesday|thursday|friday|eod|end of)"
    r")\b",
    re.I,
)
# Only a whole-keyword headline ends the story: "Appendix", "Appendix B:
# cohorts", "Sources". "Sources of churn" and "Notes from the field" do not.
APPENDIX_RE = re.compile(
    r"^(appendix(\s+[a-z0-9]{1,2})?|backup(\s+slides)?|references?|sources?"
    r"|footnotes?|notes)\s*([:\-–—].*)?$",
    re.I,
)

# Closing hashes need a space before them, so "C#" keeps its hash.
HEADING_RE = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$")
BULLET_RE = re.compile(r"^\s*([-*+]|\d+[.)])\s+\S")
FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
SEPARATOR_RE = re.compile(r"^\s*(---+|\*\*\*+|___+)\s*$")
FRONT_MATTER_LINE = re.compile(r"^([\w-]+\s*:|\s+\S|\s*-\s)")
HTML_TAG = re.compile(r"</?[A-Za-z][\w-]*(\s[^<>]*)?/?>")


def _inflect():
    strong, ambig, past = set(STRONG), set(AMBIG), set()
    for verb in STRONG + AMBIG:
        tier = strong if verb in strong else ambig
        if verb.endswith(("s", "x", "z", "ch", "sh", "o")):
            tier.add(verb + "es")
        elif verb.endswith("y") and verb[-2] not in "aeiou":
            tier.add(verb[:-1] + "ies")
        else:
            tier.add(verb + "s")
        if verb in IRREGULAR_PAST:
            form = IRREGULAR_PAST[verb]
            # Same form as the base ("cut", "hit") stays in its tier.
            if form and form != verb:
                past.add(form)
        elif verb.endswith("e"):
            past.add(verb + "d")
        elif verb.endswith("y") and verb[-2] not in "aeiou":
            past.add(verb[:-1] + "ied")
        elif verb in DOUBLED:
            past.add(verb + verb[-1] + "ed")
        else:
            past.add(verb + "ed")
    return strong, ambig, past - ALWAYS_VERB


STRONG_FORMS, AMBIG_FORMS, PAST_FORMS = _inflect()
AMBIG_BASE = set(AMBIG)


def clean_headline(text):
    """Strip markdown decoration and a leading enumerator ("3.", "Step 2:")."""
    text = text.replace("’", "'").replace("‘", "'")
    text = HTML_TAG.sub("", text)
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`]", "", text)
    return ENUMERATOR.sub("", text).strip()


def tokenize(text):
    out = []
    for raw in text.split():
        tok = raw.strip(".,;:!?()[]\"'").lower()
        if re.search(r"[a-z0-9]", tok):
            out.append(tok)
    return out


def has_number(tokens):
    for i, tok in enumerate(tokens):
        if tok in NUMBER_WORDS:
            return True
        if not NUMBER_TOKEN.match(tok) or LABEL_TOKEN.match(tok):
            continue
        if tok.isdigit() and i and tokens[i - 1] in DIGIT_LABEL_WORDS:
            continue
        return True
    return False


def has_comparison(text, tokens):
    if re.search(r"->|→|=>", text):
        return True
    if "from" in tokens and "to" in tokens[tokens.index("from") :]:
        return True
    return any(t in COMPARISON for t in tokens)


def _plural(tok):
    return (
        len(tok) > 3
        and tok.endswith("s")
        and not tok.endswith(("ss", "us", "is", "ics"))
        and tok not in NOT_PLURAL
    )


def has_verb(tokens, number=False):
    for i, tok in enumerate(tokens):
        prev = tokens[i - 1] if i else ""
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if tok in AUX or tok.endswith(("n't", "'re", "'ll", "'ve")):
            if i or tok == "let's":
                return True
            continue
        if prev in SUBJECT_PRONOUNS and (
            tok in STRONG_FORMS
            or tok in AMBIG_FORMS
            or tok in PAST_FORMS
            or tok in ALWAYS_VERB
        ):
            return True
        if i == 0:
            # Imperative: "Approve the migration", "Cut the free tier".
            # Subjectless feature line: "Finds the failing row in 10 seconds".
            if tok in STRONG_FORMS or (tok in AMBIG_FORMS and nxt in OBJECT_STARTERS):
                return True
            continue
        if prev in NOUN_MARKERS:
            continue
        if tok in STRONG_FORMS or tok in ALWAYS_VERB:
            return True
        takes_object = (
            nxt in OBJECT_STARTERS
            or has_number(tokens[i + 1 : i + 2])
            or (nxt == "by" and has_number(tokens[i + 2 : i + 3]))
        )
        if tok in PAST_FORMS:
            # "Lessons Learned from the Migration" is a label; "Tickets
            # dropped 40%" and "Two teams shipped this" are claims.
            if not _plural(prev) or number or takes_object:
                return True
            continue
        if tok not in AMBIG_FORMS:
            continue
        if takes_object or nxt in VERB_FOLLOWERS:
            return True
        if not nxt or nxt in STOP_AFTER or nxt in LABEL_NOUNS:
            continue
        # "The planner switches strategy", not "The budget cuts and plan".
        if i >= 2 and tokens[i - 2] in DETERMINERS and nxt not in NOUN_MARKERS:
            return True
        # Subject agreement: "agents quit setup" (plural + base form) or
        # "the first screen asks users" (singular + -s form, from word 3).
        if tok in AMBIG_BASE:
            if _plural(prev):
                return True
        elif i >= 2 and not _plural(prev):
            return True
    return False


def classify(headline, max_words=15):
    """Classify one headline. Returns kind, signals and a reason."""
    text = clean_headline(headline)
    tokens = tokenize(text)
    number = has_number(tokens)
    info = {
        "headline": text,
        "words": len(tokens),
        "verb": has_verb(tokens, number),
        "number": number,
        "comparison": has_comparison(text, tokens),
        "long": len(tokens) > max_words,
    }
    claim = info["verb"] and (len(tokens) >= 4 or number)
    if text.endswith("?") and len(tokens) >= 3:
        kind, reason = "question", "question headline"
    elif tokens and tokens[0] in QUESTION_OPENERS:
        # "How we cut churn 18% in one quarter" answers itself; "How it
        # works" and "What we learned in Q3" only name the question.
        if claim and number:
            kind, reason = "action", "full-sentence claim"
        else:
            kind, reason = "topic-label", "names a question without answering it"
    elif len(tokens) < 3:
        kind, reason = "topic-label", "too short to make a claim"
    elif claim:
        kind, reason = "action", "full-sentence claim"
    elif number and info["comparison"]:
        kind, reason = "action", "number with a comparison"
    elif info["verb"]:
        kind, reason = "topic-label", "claim too thin: add the number or the so-what"
    else:
        kind, reason = "topic-label", "no verb: a noun phrase names a topic"
    info["kind"], info["reason"] = kind, reason
    return info


def _strip_front_matter(lines):
    """Blank out a leading YAML block so its `---` is not a slide break."""
    first = next((i for i, ln in enumerate(lines) if ln.strip()), None)
    if first is None or lines[first].strip() != "---":
        return lines
    for end in range(first + 1, len(lines)):
        if lines[end].strip() == "---":
            block = [ln for ln in lines[first + 1 : end] if ln.strip()]
            if block and all(FRONT_MATTER_LINE.match(ln) for ln in block):
                return [""] * (end + 1) + lines[end + 1 :]
            return lines
    return lines


def _fences(lines):
    """Indexes of fenced-code lines, and line numbers of unclosed fences.

    A fence closes only on the same character, at least as long, with no
    info string. An unclosed fence hides nothing: its opener is skipped and
    the rest of the file is still linted.
    """
    skip, unclosed, i = set(), [], 0
    while i < len(lines):
        m = FENCE_OPEN.match(lines[i])
        if m and not (m.group(1)[0] == "`" and "`" in m.group(2)):
            ch, n = m.group(1)[0], len(m.group(1))
            close = re.compile(r"^ {0,3}%s{%d,}\s*$" % (re.escape(ch), n))
            end = next(
                (k for k in range(i + 1, len(lines)) if close.match(lines[k])), None
            )
            if end is None:
                skip.add(i)
                unclosed.append(i + 1)
            else:
                skip.update(range(i, end + 1))
                i = end
        i += 1
    return skip, unclosed


def parse(text, mode=None):
    """Split markdown into sections.

    Returns (mode, sections, preamble, unclosed_fence_lines). `mode` forces
    "slides" or "headings"; by default two or more separators mean slides,
    so one horizontal rule in a document does not turn it into a deck.
    """
    text = text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    lines = _strip_front_matter(text.split("\n"))
    skip, unclosed = _fences(lines)
    rows = []  # (line_no, kind, payload); kind: sep | heading | text
    for no, line in enumerate(lines, 1):
        if no - 1 in skip:
            continue
        prev_blank = no == 1 or not lines[no - 2].strip()
        if SEPARATOR_RE.match(line) and prev_blank:
            rows.append((no, "sep", None))
            continue
        m = HEADING_RE.match(line)
        if m:
            rows.append((no, "heading", (len(m.group(1)), m.group(2))))
        elif line.strip():
            rows.append((no, "text", line))

    if mode is None:
        seps = sum(1 for _, kind, _ in rows if kind == "sep")
        mode = "slides" if seps >= 2 else "headings"
    slides = mode == "slides"
    sections, preamble, cur = [], [], None

    def new(no, level=None, headline=None):
        sec = {"line": no, "level": level, "headline": headline, "body": []}
        sections.append(sec)
        return sec

    for no, kind, payload in rows:
        if kind == "sep":
            if slides:
                cur = None
        elif kind == "heading" and slides:
            if cur is None:
                cur = new(no)
            if cur["headline"] is None:
                cur["line"], cur["level"], cur["headline"] = no, *payload
            else:
                cur["body"].append((no, payload[1]))
        elif kind == "heading" and payload[0] <= 3:
            cur = new(no, *payload)
        elif kind == "heading":
            if cur is not None:
                cur["body"].append((no, payload[1]))
        elif slides:
            if cur is None:
                cur = new(no)
            cur["body"].append((no, payload))
        elif cur is None:  # text before the first heading
            preamble.append((no, payload))
        else:
            cur["body"].append((no, payload))
    return mode, sections, preamble, unclosed


def lint(text, max_bullets=5, max_words=15, mode=None):
    mode, sections, preamble, unclosed = parse(text, mode)
    findings = []

    def add(code, line, message, headline=None):
        findings.append(
            {"code": code, "line": line, "message": message, "headline": headline}
        )

    def add_filler(no, line):
        for m in FILLER_RE.finditer(line.replace("’", "'")):
            add("filler", no, f'filler phrase "{m.group(1).lower()}"; cut it')

    for no in unclosed:
        add("unclosed-fence", no, "code fence never closes; close it")
    for no, ln in preamble:
        add_filler(no, ln)

    # The title is the first slide, or a heading that outranks every other.
    title_idx = None
    if len(sections) > 1 and sections[0]["headline"]:
        if mode == "slides" or all(
            s["level"] > sections[0]["level"] for s in sections[1:]
        ):
            title_idx = 0

    # Sections from the first appendix-style headline on are reference
    # material: not scored as headlines, and not where the story ends.
    cut = next(
        (
            i
            for i, s in enumerate(sections)
            if s["headline"] and APPENDIX_RE.match(clean_headline(s["headline"]))
        ),
        len(sections),
    )

    report = []
    for idx, sec in enumerate(sections):
        head = sec["headline"]
        bullets = sum(1 for _, ln in sec["body"] if BULLET_RE.match(ln))
        if head is None:
            info = {"headline": None, "kind": "missing", "words": 0}
            add("no-headline", sec["line"], "slide has no headline")
        else:
            info = classify(head, max_words)
            shown = info["headline"]
            too_long = info.pop("long")
            if idx >= cut:
                info["kind"] = "appendix"
            else:
                if info["kind"] == "topic-label" and idx == title_idx:
                    info["kind"] = "title"
                elif info["kind"] == "topic-label":
                    add(
                        "topic-label",
                        sec["line"],
                        f"topic label ({info['reason']}); "
                        "state the claim and its so-what",
                        shown,
                    )
                if too_long:
                    add(
                        "long-headline",
                        sec["line"],
                        f"{info['words']} words (max {max_words}); cut to one claim",
                        shown,
                    )
        if bullets > max_bullets:
            add(
                "too-many-bullets",
                sec["line"],
                f"{bullets} bullets (max {max_bullets}); split the section or cut",
                info["headline"],
            )
        for no, ln in [(sec["line"], head or "")] + sec["body"]:
            add_filler(no, ln)
        info.update(line=sec["line"], bullets=bullets)
        report.append(info)

    def text_of(secs):
        return " ".join(
            [s["headline"] or "" for s in secs]
            + [ln for s in secs for _, ln in s["body"]]
        )

    if sections:
        opening = sections[: 2 if title_idx == 0 else 1]
        opening_kinds = [r["kind"] for r in report[: len(opening)]]
        body = " ".join(
            [ln for _, ln in preamble] + [ln for s in opening for _, ln in s["body"]]
        )
        if not (
            {"action", "question"} & set(opening_kinds)
            or has_number(tokenize(body)[:80])
            or "?" in body
        ):
            add(
                "no-hook",
                opening[-1]["line"],
                "opening has no big idea: lead with the claim, a number or a question",
            )

        main = sections[:cut] or sections
        if not ASK_RE.search(text_of(main[-1:])):
            add(
                "no-ask",
                main[-1]["line"],
                "ending has no ask: close on the decision, owner and next step",
            )

        seen = {}
        for sec in sections:
            if not sec["headline"]:
                continue
            key = " ".join(tokenize(clean_headline(sec["headline"])))
            if key in seen:
                add(
                    "duplicate-headline",
                    sec["line"],
                    f"same headline as line {seen[key]}; "
                    "each section needs its own claim",
                    clean_headline(sec["headline"]),
                )
            else:
                seen[key] = sec["line"]

    findings.sort(key=lambda f: (f["line"], f["code"]))
    kinds = [r["kind"] for r in report]
    return {
        "mode": mode,
        "sections": report,
        "findings": findings,
        "summary": {
            "sections": len(report),
            "headlines_scored": sum(
                kinds.count(k) for k in ("action", "question", "topic-label")
            ),
            "action_titles": kinds.count("action"),
            "questions": kinds.count("question"),
            "findings": len(findings),
        },
        "ok": not findings,
    }


def render(result, source):
    s = result["summary"]
    out = [f"story-lint: {source} ({result['mode']} mode, {s['sections']} sections)"]
    for f in result["findings"]:
        head = f' "{f["headline"]}"' if f["headline"] else ""
        out.append(f"  L{f['line']:<4} {f['code']:<18}{head} -- {f['message']}")
    questions = f", {s['questions']} question(s)" if s["questions"] else ""
    out.append(
        f"{s['action_titles']}/{s['headlines_scored']} headlines are action titles"
        f"{questions}; {s['findings']} finding(s)"
        + ("" if s["findings"] else ", story holds")
    )
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument(
        "path", nargs="?", default="-", help="markdown file, or - for stdin"
    )
    ap.add_argument("--json", action="store_true", help="emit JSON")
    ap.add_argument("--strict", action="store_true", help="exit 1 on any finding")
    ap.add_argument("--max-bullets", type=int, default=5, help="bullets per section")
    ap.add_argument("--max-words", type=int, default=15, help="words per headline")
    force = ap.add_mutually_exclusive_group()
    force.add_argument(
        "--slides",
        dest="mode",
        action="store_const",
        const="slides",
        help="treat every --- as a slide break",
    )
    force.add_argument(
        "--headings",
        dest="mode",
        action="store_const",
        const="headings",
        help="sections are headings; ignore --- rules",
    )
    args = ap.parse_args(argv)
    source = "<stdin>" if args.path == "-" else args.path

    def fail(message):
        if args.json:
            print(json.dumps({"ok": False, "source": source, "error": message}))
        else:
            print(f"story-lint: {message}", file=sys.stderr)
        return 2

    try:
        if args.path == "-":
            raw = sys.stdin.buffer.read()
        else:
            with open(args.path, "rb") as fh:
                raw = fh.read()
    except OSError as exc:
        return fail(f"cannot read {source}: {exc.strerror}")

    result = lint(
        raw.decode("utf-8-sig", "replace"), args.max_bullets, args.max_words, args.mode
    )
    if not result["sections"]:
        return fail(f"no headlines or slides found in {source}")
    result["source"] = source
    print(json.dumps(result, indent=2) if args.json else render(result, source))
    return 1 if args.strict and result["findings"] else 0


if __name__ == "__main__":
    sys.exit(main())
