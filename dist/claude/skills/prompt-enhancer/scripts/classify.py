#!/usr/bin/env python3
"""Deterministic intent classifier for prompt-enhancer.

Prose can't be regression-tested; this can. The skill calls it, reads the
JSON, and picks the rewrite pattern for the winning intent.

    python3 classify.py "why does my login endpoint 500 on refresh"
    python3 classify.py --stdin < prompt.txt
    python3 classify.py --selftest

Exit code is 0 on a classification, 2 on bad usage.
"""
import argparse
import json
import re
import sys
from pathlib import Path

# (pattern, weight). Patterns are matched case-insensitively with word
# boundaries. Weight 3 = near-decisive jargon, 2 = strong, 1 = weak hint.
SIGNALS = {
    "debug": [
        (r"stack ?trace|traceback|core dump", 3), (r"\bregression\b|\bflaky\b", 3),
        (r"\bbug\b|\bcrash(es|ing|ed)?\b|\bhang(s|ing)?\b", 3),
        (r"\berror\b|\bexception\b|\bfail(s|ed|ing|ure)?\b", 2),
        (r"\bbroken\b|not working|doesn'?t work|won'?t \w+", 2),
        (r"\bwhy (does|is|am|do|did)\b|\breproduce\b|\bdiagnose\b", 2),
        (r"\bfix\b|\btroubleshoot\b|\bdebug\b", 2),
        (r"\b[45]\d\d\b|\bnull pointer\b|\bsegfault\b|\btimeout\b", 2),
    ],
    "code-gen": [
        (r"\bimplement\b|\bscaffold\b|\bwrite (a|an|me|some)\b", 3),
        (r"\bbuild (a|an|me)\b|\bcreate (a|an)\b|\badd (a|an)\b", 2),
        (r"\bgenerate\b|\bnew (function|class|module|component|endpoint|script)\b", 2),
        (r"\bendpoint\b|\bcomponent\b|\bcli\b|\bscript\b|\bfeature\b", 1),
        (r"\bfrom scratch\b|\bboilerplate\b|\bstarter\b", 2),
    ],
    "refactor": [
        (r"\brefactor(ing)?\b|\btech debt\b|\bdeduplicat|\bdedupe\b", 3),
        (r"\bclean ?up\b|\bsimplify\b|\btidy\b|\brestructure\b", 2),
        (r"\brename\b|\bextract (a |the )?(method|function|class|module)\b", 2),
        (r"\bsplit (up|this|the)\b|\bmodulari[sz]e\b|\bmoderni[sz]e\b", 2),
        (r"\breadability\b|\bwithout changing behaviou?r\b|\bsame behaviou?r\b", 3),
    ],
    "research": [
        (r"\bcompare\b|\bvs\.?\b|\bversus\b|\btrade[- ]?offs?\b", 3),
        (r"\bpros and cons\b|\bevaluate\b|\bshould (i|we) use\b|\bwhich (one|should|is better)\b", 3),
        (r"\bresearch\b|\bsurvey\b|\blandscape\b|\bstate of the art\b", 3),
        (r"\bbest practice(s)?\b|\bwhat are the options\b|\balternatives?\b", 2),
        (r"\bhow (do|does) \w+ (work|compare)\b|\bexplain the difference\b", 2),
    ],
    "data-sql": [
        (r"\bsql\b|\bjoin\b|\bgroup by\b|\bwindow function\b", 3),
        (r"\bquery\b", 1),
        (r"\bbigquery\b|\bsnowflake\b|\bredshift\b|\bdatabricks\b|\bdbt\b|\bathena\b", 3),
        (r"\bwarehouse\b|\bdata ?(lake|mart|model)\b|\bmedallion\b", 2),
        (r"\betl\b|\belt\b|\bingest(ion)?\b|\bdata pipeline\b", 2),
        (r"\bpandas\b|\bdataframe\b|\bpyspark\b|\bparquet\b", 2),
        (r"\bpartition(ed|ing)?\b|\bschema\b|\btable\b|\bcolumn\b|\brows?\b", 1),
    ],
    "architecture": [
        (r"\bsystem design\b|\barchitect(ure|ing)?\b|\bhld\b|\blld\b", 3),
        (r"\bmicroservices?\b|\bevent[- ]driven\b|\bcqrs\b|\bsaga\b", 3),
        (r"\bshard(ing)?\b|\bcap theorem\b|\bconsistency model\b|\bquorum\b", 3),
        (r"\bscal(e|ing|ability)\b|\bthroughput\b|\bcapacity\b|\bhigh availability\b", 2),
        (r"\bdesign (a|an|the) (system|service|platform)\b|\bmillions? of (users|requests)\b", 3),
        (r"\bp99\b|\bqps\b|\brps\b|\bload balanc", 2),
    ],
    "writing": [
        (r"\bblog post\b|\barticle\b|\bnewsletter\b|\brelease notes\b", 3),
        (r"\bwrite (the |a |an )?(readme|docs?|documentation|email|summary|post)\b", 3),
        (r"\bdraft\b|\bproofread\b|\bcopy ?edit\b|\brephrase\b|\btone\b", 2),
        (r"\bdocumentation\b|\breadme\b|\bchangelog\b", 2),
        (r"\bfor a non[- ]technical\b|\baudience\b|\bexecutive summary\b", 2),
    ],
    "ops-cli": [
        (r"\bkubernetes\b|\bk8s\b|\bterraform\b|\bhelm\b|\bansible\b", 3),
        (r"\bdocker(file)?\b|\bcompose\b|\bsystemd\b|\bnginx\b|\bcron(tab)?\b", 3),
        (r"\bci/?cd\b|\bgithub actions?\b|\bjenkins\b|\bpipeline job\b", 3),
        (r"\bdeploy(ment|ing)?\b|\bprovision\b|\brollback\b|\brunbook\b", 2),
        (r"\bbash\b|\bshell script\b|\bzsh\b|\bssh\b|\bchmod\b|\bawk\b|\bsed\b", 2),
        (r"\biam\b|\bcredentials?\b|\bsecrets? manager\b|\benv(ironment)? var", 2),
    ],
}

INTENTS = sorted(SIGNALS) + ["ambiguous"]

# Below this total evidence the text is too thin to trust any label.
MIN_EVIDENCE = 2.0
# Below this share-of-evidence the top intent isn't separated from the pack.
MIN_SHARE = 0.34
HIGH, MEDIUM = 0.62, 0.42


def score(text):
    out = {}
    for intent, sigs in SIGNALS.items():
        hits, total = [], 0.0
        for pat, weight in sigs:
            if re.search(pat, text, re.IGNORECASE):
                total += weight
                hits.append(pat)
        if total:
            out[intent] = {"score": total, "matched": hits}
    return out


def classify(text):
    text = (text or "").strip()
    scores = score(text)
    total = sum(v["score"] for v in scores.values())
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1]["score"], kv[0]))

    if not ranked or total < MIN_EVIDENCE:
        return _result("ambiguous", 0.2 if ranked else 0.0, ranked, total,
                       "not enough signal in the prompt to pick an intent")

    top_name, top = ranked[0]
    share = top["score"] / total
    runner = ranked[1][1]["score"] if len(ranked) > 1 else 0.0
    margin = (top["score"] - runner) / top["score"]

    if share < MIN_SHARE:
        return _result("ambiguous", round(share, 2), ranked, total,
                       "multiple intents scored comparably; ask before rewriting")

    # confidence blends "how much of the evidence points here" with "how far
    # clear of the runner-up" -- either alone mislabels short prompts.
    confidence = round(min(0.97, 0.55 * share + 0.45 * margin + 0.10), 2)
    return _result(top_name, confidence, ranked, total, None)


def _result(intent, confidence, ranked, total, note):
    band = "high" if confidence >= HIGH else "medium" if confidence >= MEDIUM else "low"
    return {
        "intent": intent,
        "confidence": confidence,
        "band": band,
        "ask_clarifying": band == "low",
        "evidence": round(total, 1),
        "runners_up": [{"intent": n, "score": v["score"]} for n, v in ranked[1:4]],
        "note": note,
    }


GOLDEN = Path(__file__).resolve().parent.parent / "tests" / "golden.json"


def selftest():
    cases = json.loads(GOLDEN.read_text(encoding="utf-8"))
    bad = []
    for c in cases:
        got = classify(c["prompt"])
        if got["intent"] != c["expect_intent"]:
            bad.append("%-28s expected %-13s got %-13s (%.2f)"
                       % (c["id"], c["expect_intent"], got["intent"], got["confidence"]))
        elif "expect_band" in c and got["band"] != c["expect_band"]:
            bad.append("%-28s intent ok, expected band %s got %s (%.2f)"
                       % (c["id"], c["expect_band"], got["band"], got["confidence"]))
    for line in bad:
        print("FAIL " + line, file=sys.stderr)
    print("%d/%d golden intent cases passed" % (len(cases) - len(bad), len(cases)))
    return 1 if bad else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("prompt", nargs="*", help="the raw prompt text")
    ap.add_argument("--stdin", action="store_true", help="read the prompt from stdin")
    ap.add_argument("--selftest", action="store_true", help="run the golden intent cases")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()
    text = sys.stdin.read() if args.stdin else " ".join(args.prompt)
    if not text.strip():
        ap.error("no prompt given (pass text, or --stdin)")
    print(json.dumps(classify(text), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
