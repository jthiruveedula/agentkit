#!/usr/bin/env python3
"""Deterministic AI-tell detector for the humanizer skill.

Flags stock phrases, em-dash overuse, rule-of-three lists, repeated sentence
openers, uniform sentence length, hedging/filler, emoji bullets, "not X but Y"
contrasts, summary closers and generic headings, plus two cheap grammar
mechanics (doubled words, space before punctuation). English only. Fenced
code blocks, inline code and URLs are skipped.

    python3 detect.py draft.md
    python3 detect.py --slides --json < deck.md

Prints one finding per line (L<line> <rule>: <match>) and a 0-100 score.
Exit 0 below --threshold, 1 at or above it, 2 on bad usage.
"""

import argparse
import bisect
import json
import re
import statistics
import sys
from collections import Counter

# (rule, pattern, weight). Matched case-insensitively per line.
PHRASES = [
    # Stock vocabulary and chat leftovers: strong on one sighting.
    ("stock-phrase", r"\bdelv(e|es|ed|ing)\b", 3),
    ("stock-phrase", r"\btapestr(y|ies)\b", 3),
    ("stock-phrase", r"\btestament to\b", 3),
    ("stock-phrase", r"\bit'?s worth noting\b|\bit is worth noting\b", 3),
    (
        "stock-phrase",
        r"\bin today'?s (fast[- ]paced|digital|ever[- ]changing|modern|rapidly \w+) "
        r"(world|age|landscape|era|environment)\b",
        3,
    ),
    ("stock-phrase", r"\bever[- ](evolving|changing)\b", 3),
    ("stock-phrase", r"\b(navigat\w+|in) the (\w+ )?(landscape|realm)\b", 3),
    ("stock-phrase", r"\brealm of\b", 3),
    ("stock-phrase", r"\b(unlock|harness)\w* the (full )?(power|potential)\b", 3),
    ("stock-phrase", r"\bembark\w* on\b", 3),
    ("stock-phrase", r"\bplays? an? (crucial|pivotal|vital|key|significant) role\b", 3),
    ("stock-phrase", r"\bgame[- ]chang(er|ing)\b", 3),
    ("stock-phrase", r"\bdive (deep(er)? )?into\b|\blet'?s dive in\b", 3),
    ("stock-phrase", r"\bgreat question\b|\bi hope this helps\b|\bas an ai\b", 3),
    ("stock-phrase", r"\bcertainly!|\babsolutely!", 3),
    (
        "stock-phrase",
        r"\b(seamless(ly)?|meticulous(ly)?|bustling|nestled|pivotal|multifaceted)\b",
        2,
    ),
    ("stock-phrase", r"\bunderscor(e|es|ed|ing)\b|\bshowcas(e|es|ed|ing)\b", 2),
    ("stock-phrase", r"\belevat(e|es|ed|ing) (your|the)\b", 2),
    ("soft-phrase", r"\bfoster(s|ed|ing)?\b", 1),
    ("stock-phrase", r"\bparadigm shift\b|\bsynerg(y|ies|istic)\b|\bholistic\b", 2),
    ("soft-phrase", r"\bstands? as an?\b|\bserves? as an?\b", 1),
    ("stock-phrase", r"\bcutting[- ]edge\b|\bintricate\b|\bvibrant\b", 2),
    # Soft vocabulary: fine alone, adds up in bulk.
    (
        "soft-phrase",
        r"\b(robust|leverag\w+|crucial|comprehensive|streamlin\w+|empower\w*"
        r"|transformative|innovative|journey|landscape)\b",
        1,
    ),
    # Hedging and filler.
    ("hedge-filler", r"\bit'?s important to (note|remember|understand)\b", 2),
    ("hedge-filler", r"\bit is important to (note|remember|understand)\b", 2),
    ("hedge-filler", r"\bit should be noted\b|\bneedless to say\b", 2),
    ("hedge-filler", r"\bgenerally speaking\b|\bit could be argued\b", 1),
    ("hedge-filler", r"\b(may|might|could) potentially\b", 1),
    ("hedge-filler", r"\bto some extent\b|\bin many ways\b|\bwhen it comes to\b", 1),
    ("hedge-filler", r"\bat the end of the day\b", 1),
    ("hedge-filler", r"\b(arguably|essentially|truly|incredibly)\b", 1),
    # Contrast formula: names a claim nobody made.
    ("not-x-but-y", r"\bnot (just|only|merely|simply) [^.;:!?]{1,80}?\bbut\b", 3),
    (
        "not-x-but-y",
        r"\b(it'?s|it is|this is|that'?s) not (just |only |merely |simply )?"
        r"[^.;:!?]{1,60}?[,;—–-]+\s*(it'?s|it is|this is|that'?s)\b",
        3,
    ),
    ("not-x-but-y", r"\b(isn'?t|aren'?t|wasn'?t) (just|only|merely|simply)\b", 2),
    (
        "not-x-but-y",
        r"\b(isn'?t|is not|aren'?t|are not)\b[^.!?]{1,60}[.!?]\s+"
        r"(it|this|that|they)('s| is| are|'re)\b",
        3,
    ),
    # Chatty sign-offs anywhere.
    ("summary-closer", r"\blet me know if\b|\bfeel free to\b", 2),
]

CLOSER_START = re.compile(
    r"^(in conclusion|in summary|to sum up|to summari[sz]e|all in all|overall"
    r"|ultimately|in short|in essence|the bottom line)\b",
    re.I,
)
GENERIC_HEADING = re.compile(
    r"^(key takeaways?|final thoughts|closing thoughts|the bottom line"
    r"|why (it|this) matters|the power of .+|unlocking .+|embracing .+"
    r"|harnessing .+|navigating .+|the future of .+|a deep dive into .+)$",
    re.I,
)
# Standard doc section titles; only a tell as a slide title.
TOPIC_HEADING = re.compile(r"^(introduction|overview|conclusion|summary)$", re.I)
# Pictographs only: check marks and ballot boxes in support matrices are fine.
EMOJI = "[\U0001f300-\U0001faff☀-☏☓-⛿✅✨❌➡⭐⬆]"
EMOJI_BULLET = re.compile(r"^\s*(?:[-*+]\s*|\d+[.)]\s*)?" + EMOJI)
BOLD_LABEL = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+\*\*[^*]{1,40}\*\*")
BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
HEADING = re.compile(r"^\s*#{1,6}\s+")
FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})(.*)$")
DASH = re.compile(r"—|\s--\s|\s–\s")
TRIAD = re.compile(
    r"\b[A-Za-z]+(?: [A-Za-z]+)?, [A-Za-z]+(?: [A-Za-z]+)?,? and [A-Za-z]+\b"
)
DOUBLED = re.compile(r"\b([A-Za-z]+)\s+\1\b", re.I)
SPACE_PUNCT = re.compile(r"[A-Za-z]\s+[,.;:!?](?=\s|$)")
INLINE_CODE = re.compile(r"`[^`]*`|https?://\S+")
SENTENCE_END = re.compile(
    r"(?<!\be\.g\.)(?<!\bi\.e\.)(?<!\bvs\.)(?<!\betc\.)(?<!\bDr\.)(?<!\bMr\.)"
    r"(?<!\bMs\.)(?<=[.!?])[\"')\]]*\s+(?=[\"'(\[]?[A-Z0-9])"
)
WORD = re.compile(r"[A-Za-z0-9']+")

# Score = weighted points per 100 words, doubled, capped at 100. Calibrated
# on tests/fixtures: the AI sample lands near 70, the human sample at 0.
SCALE = 2
DEFAULT_THRESHOLD = 35


def classify_lines(text):
    """Label each line code/front/table/prose; return (lines, kinds, blocks).

    A fence closes only on the same marker, at least as long, with nothing
    after it; an unclosed fence runs to the end (CommonMark). Leading YAML
    front matter counts as a block. Indented code is read as prose, since
    list continuations are far more common in docs.
    """
    lines = text.splitlines()
    kinds = ["prose"] * len(lines)
    blocks, fence, start = [], None, 0
    if lines and lines[0].strip() == "---":
        end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), 0)
        if end:
            kinds[: end + 1] = ["front"] * (end + 1)
            blocks.append("\n".join(lines[: end + 1]))
    for i, line in enumerate(lines):
        if kinds[i] == "front":
            continue
        m = FENCE.match(line)
        if fence:
            kinds[i] = "code"
            if (
                m
                and m.group(1)[0] == fence[0]
                and len(m.group(1)) >= len(fence)
                and not m.group(2).strip()
            ):
                blocks.append("\n".join(lines[start : i + 1]))
                fence = None
        elif m:
            kinds[i], fence, start = "code", m.group(1), i
        elif line.lstrip().startswith("|"):
            kinds[i] = "table"
    if fence:
        blocks.append("\n".join(lines[start:]))
    return lines, kinds, blocks


def heading_text(line, slides):
    if HEADING.match(line):
        return HEADING.sub("", line)
    if slides and line.strip() and not BULLET.match(line):
        words = WORD.findall(line)
        if 0 < len(words) <= 8 and not line.rstrip().endswith((".", "!", "?")):
            return line
    return None


def paragraphs(lines, slides):
    """Group (lineno, line) into (kind, [(lineno, line)]) blocks.

    Kind is heading, bullet (with its wrapped continuation lines) or prose.
    """
    out, cur = [], None
    for n, line in lines:
        if not line.strip():
            cur = None
        elif heading_text(line, slides) is not None:
            out.append(("heading", [(n, line)]))
            cur = None
        elif BULLET.match(line):
            cur = ("bullet", [(n, line)])
            out.append(cur)
        elif cur is None:
            cur = ("prose", [(n, line)])
            out.append(cur)
        else:
            cur[1].append((n, line))
    return out


def joined(para):
    """Paragraph text joined with spaces, plus a function offset -> lineno."""
    starts, text = [], ""
    for _, t in para:
        starts.append(len(text))
        text += t.strip() + " "

    def line_at(idx):
        return para[bisect.bisect_right(starts, idx) - 1][0]

    return text, line_at


def detect(text, slides=False):
    raw, kinds, _ = classify_lines(text)
    lines = [
        (i + 1, INLINE_CODE.sub(_blank, raw[i]))
        for i in range(len(raw))
        if kinds[i] == "prose"
    ]
    findings = []

    def add(n, rule, match, weight, category="ai"):
        findings.append(
            {
                "line": n,
                "rule": rule,
                "category": category,
                "match": match.strip()[:80],
                "weight": weight,
            }
        )

    sents = []  # (lineno, sentence) from prose paragraphs, for rhythm rules
    for kind, para in paragraphs(lines, slides):
        body, line_at = joined(para)
        # Phrase rules run on the joined paragraph so hard wraps hide nothing.
        for rule, pat, w in PHRASES:
            for m in re.finditer(pat, body, re.I):
                add(line_at(m.start()), rule, m.group(0), w)
        for m in DOUBLED.finditer(body):
            if m.group(1).lower() not in {"that", "had"}:
                add(line_at(m.start()), "doubled-word", m.group(0), 0, "grammar")
        n0, first = para[0]
        if kind == "heading":
            clean = re.sub(EMOJI + r"|[*_:.!?#]", "", heading_text(first, slides))
            clean = clean.strip()
            if GENERIC_HEADING.match(clean) or (slides and TOPIC_HEADING.match(clean)):
                add(n0, "generic-heading", clean, 2)
        if EMOJI_BULLET.match(first):
            add(n0, "emoji-bullet", re.search(EMOJI, first).group(0), 2)
        if kind == "bullet":
            item = BULLET.sub("", body).lstrip("*_ ")
            m = CLOSER_START.match(item)
            if m:
                add(n0, "summary-closer", m.group(0), 2)
            if slides and len(WORD.findall(body)) > 12:
                add(n0, "long-bullet", "%d words" % len(WORD.findall(body)), 1)
        if kind != "prose":
            continue
        pos, run, prev = 0, 1, None
        for piece in SENTENCE_END.split(body):
            idx = body.find(piece, pos)
            pos = idx + len(piece)
            if not piece.strip():
                continue
            n = line_at(idx)
            sents.append((n, piece))
            m = CLOSER_START.match(piece.lstrip("*_ "))
            if m:
                add(n, "summary-closer", m.group(0), 2)
            word = (WORD.findall(piece) or [""])[0].lower()
            run = run + 1 if word and word == prev else 1
            prev = word
            if run == 3:
                add(n, "repeated-opener", word, 2)

    for n, _ in lines:
        # Collapse code spans so "the `x`;" is not read as "the ;".
        for m in SPACE_PUNCT.finditer(INLINE_CODE.sub("x", raw[n - 1])):
            add(n, "space-before-punct", m.group(0), 0, "grammar")

    words = sum(len(WORD.findall(line)) for _, line in lines)

    # Pattern-level rules: only fire when the habit repeats.
    bold = [(n, line) for n, line in lines if BOLD_LABEL.match(line)]
    if len(bold) >= 3:
        for n, line in bold:
            add(n, "bold-label", line.strip()[:40], 1)
    triads = [(n, m.group(0)) for n, line in lines for m in TRIAD.finditer(line)]
    if len(triads) >= 3:
        for n, t in triads:
            add(n, "rule-of-three", t, 1)
    dashes = [(n, m.group(0)) for n, line in lines for m in DASH.finditer(line)]
    if len(dashes) >= 3 and len(dashes) * 100 / max(words, 1) >= 0.75:
        for n, d in dashes:
            add(n, "em-dash", d, 1)

    lengths = [len(WORD.findall(s)) for _, s in sents if len(WORD.findall(s)) > 2]
    if len(lengths) >= 6:
        cv = statistics.pstdev(lengths) / statistics.mean(lengths)
        if cv < 0.3:
            add(sents[0][0], "uniform-length", "cv=%.2f" % cv, 4)

    findings.sort(key=lambda f: (f["line"], f["rule"]))
    points = sum(f["weight"] for f in findings)
    score = min(100, round(points * 100 * SCALE / max(words, 80)))
    return {"score": score, "words": words, "findings": findings}


def _blank(m):
    return " " * len(m.group(0))


# Dates, ranges, versions and signed values stay one token: 2024-01-15,
# 10-20, 1.2.3 (from v1.2.3), -5. Thousands separators are normalised.
NUMBER = re.compile(r"(?:(?<![\w-])[-+])?(?<![\d.,])\d(?:[\d,.:/%-]*\d)?%?")
SPAN = re.compile(r"`[^`]+`|https?://[^\s)>\]]+|\]\(([^)\s]+)")


def protected(text):
    """Counter of tokens a rewrite must keep: code blocks, front matter,
    inline code, URLs, link targets, numbers."""
    raw, kinds, blocks = classify_lines(text)
    rest = "\n".join(raw[i] for i in range(len(raw)) if kinds[i] in ("prose", "table"))
    spans = [(m.group(1) or m.group(0)).rstrip(".,;:!?") for m in SPAN.finditer(rest)]
    plain = SPAN.sub(lambda m: " " * len(m.group(0)), rest)
    nums = [re.sub(r"(?<=\d),(?=\d{3}\b)", "", n) for n in NUMBER.findall(plain)]
    return Counter(blocks) + Counter(spans) + Counter(nums)


def compare(original, rewrite):
    """Protected tokens lost or newly introduced by a rewrite (with counts)."""
    old, new = protected(original), protected(rewrite)
    return {
        "lost": sorted((old - new).elements()),
        "added": sorted((new - old).elements()),
    }


def _read(ap, path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except (OSError, UnicodeDecodeError) as e:
        ap.error("cannot read %s: %s" % (path, e))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("file", nargs="?", help="text/markdown file (default: stdin)")
    ap.add_argument("--slides", action="store_true", help="slide/deck text rules")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD)
    ap.add_argument(
        "--against",
        metavar="ORIGINAL",
        help="fact guard: list code/URLs/numbers the rewrite lost or added",
    )
    args = ap.parse_args(argv)

    text = _read(ap, args.file) if args.file else sys.stdin.read()
    if not text.strip():
        ap.error("no text given (pass a file or pipe stdin)")

    if args.against:
        diff = compare(_read(ap, args.against), text)
        if args.json:
            print(json.dumps(diff, indent=2, ensure_ascii=False))
        else:
            for kind in ("lost", "added"):
                for tok in diff[kind]:
                    print("%-5s %s" % (kind, tok.strip()[:80]))
            print("fact guard: %d lost, %d added" % tuple(map(len, diff.values())))
        return 1 if diff["lost"] or diff["added"] else 0

    result = detect(text, slides=args.slides)
    result["threshold"] = args.threshold
    result["verdict"] = "ai-ish" if result["score"] >= args.threshold else "ok"
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        for f in result["findings"]:
            rule = f["rule"] + (" (grammar)" if f["category"] == "grammar" else "")
            print("L%-4d %-30s %s" % (f["line"], rule, f["match"]))
        print(
            "score %d/100 (%s, threshold %d); %d findings, %d words"
            % (
                result["score"],
                result["verdict"],
                args.threshold,
                len(result["findings"]),
                result["words"],
            )
        )
    return 1 if result["verdict"] == "ai-ish" else 0


if __name__ == "__main__":
    sys.exit(main())
