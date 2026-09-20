#!/usr/bin/env python3
"""Deterministic cloud/platform classifier for data-eng-router.

Same pattern as prompt-enhancer's classify.py: a data-engineering task
names its platform through its vocabulary (BigQuery vs. Redshift vs. Delta
Lake vs. Synapse) more reliably than a model guessing from vibes alone.

    python3 classify.py "load this into bigquery and schedule with composer"
    python3 classify.py --selftest
"""
import argparse
import json
import re
import sys
from pathlib import Path

SIGNALS = {
    "gcp": [
        (r"\bbigquery\b|\bbq\b", 3), (r"\bvertex ?ai\b", 3),
        (r"\bdataflow\b|\bdataproc\b|\bcloud composer\b|\bairflow\b.*\bgcp\b", 3),
        (r"\bpub/?sub\b|\bcloud storage\b|\bgcs\b|\bgke\b", 2),
        (r"\bgoogle cloud\b|\bgcp\b", 2),
    ],
    "aws": [
        (r"\bredshift\b|\bathena\b|\bglue\b|\bemr\b", 3),
        (r"\bkinesis\b|\bsagemaker\b|\blambda\b.*\bdata\b|\bstep functions?\b", 2),
        (r"\bs3\b|\baws\b|\bamazon web services\b", 2),
    ],
    "azure": [
        (r"\bsynapse\b|\bdata factory\b|\badf\b", 3),
        (r"\bazure data lake\b|\badls\b|\bcosmos ?db\b|\bevent hubs?\b", 2),
        (r"\bazure\b", 2),
    ],
    "databricks": [
        (r"\bdatabricks\b|\bdelta lake\b|\bunity catalog\b", 3),
        (r"\bdbx\b|\bdelta table\b|\bspark job\b", 2),
    ],
}

INTENTS = sorted(SIGNALS) + ["ambiguous"]
MIN_EVIDENCE = 2.0
MIN_SHARE = 0.34
HIGH, MEDIUM = 0.62, 0.42

ROUTES = {
    "gcp": "ext-gcp",
    "aws": "ext-aws",
    "azure": "ext-azure",
    "databricks": "ext-databricks",
}


def score(text):
    out = {}
    for platform, sigs in SIGNALS.items():
        hits, total = [], 0.0
        for pat, weight in sigs:
            if re.search(pat, text, re.IGNORECASE):
                total += weight
                hits.append(pat)
        if total:
            out[platform] = {"score": total, "matched": hits}
    return out


def classify(text):
    text = (text or "").strip()
    scores = score(text)
    total = sum(v["score"] for v in scores.values())
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1]["score"], kv[0]))

    if not ranked or total < MIN_EVIDENCE:
        return _result("ambiguous", 0.2 if ranked else 0.0, ranked, total,
                       "no platform-specific vocabulary found")

    top_name, top = ranked[0]
    share = top["score"] / total
    runner = ranked[1][1]["score"] if len(ranked) > 1 else 0.0
    margin = (top["score"] - runner) / top["score"]

    if share < MIN_SHARE:
        return _result("ambiguous", round(share, 2), ranked, total,
                       "multiple platforms scored comparably; ask which one")

    confidence = round(min(0.97, 0.55 * share + 0.45 * margin + 0.10), 2)
    return _result(top_name, confidence, ranked, total, None)


def _result(platform, confidence, ranked, total, note):
    band = "high" if confidence >= HIGH else "medium" if confidence >= MEDIUM else "low"
    return {
        "platform": platform,
        "route_to": ROUTES.get(platform),
        "confidence": confidence,
        "band": band,
        "ask_clarifying": band == "low",
        "evidence": round(total, 1),
        "runners_up": [{"platform": n, "score": v["score"]} for n, v in ranked[1:3]],
        "note": note,
    }


GOLDEN = Path(__file__).resolve().parent.parent / "tests" / "golden.json"


def selftest():
    cases = json.loads(GOLDEN.read_text(encoding="utf-8"))
    bad = []
    for c in cases:
        got = classify(c["prompt"])
        if got["platform"] != c["expect_platform"]:
            bad.append("%-28s expected %-12s got %-12s (%.2f)"
                       % (c["id"], c["expect_platform"], got["platform"], got["confidence"]))
    for line in bad:
        print("FAIL " + line, file=sys.stderr)
    print("%d/%d golden platform cases passed" % (len(cases) - len(bad), len(cases)))
    return 1 if bad else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("prompt", nargs="*")
    ap.add_argument("--stdin", action="store_true")
    ap.add_argument("--selftest", action="store_true")
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
