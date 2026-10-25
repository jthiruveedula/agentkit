"""Every skills/*/evals/evals.json follows Anthropic's eval shape."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_evals_shape():
    files = sorted(ROOT.glob("skills/*/evals/evals.json"))
    assert files
    for p in files:
        evals = json.loads(p.read_text())
        assert isinstance(evals, list) and len(evals) >= 3, p
        for e in evals:
            assert isinstance(e["query"], str) and e["query"].strip(), p
            assert isinstance(e.get("files", []), list), p
            b = e["expected_behavior"]
            assert (
                isinstance(b, list)
                and b
                and all(isinstance(x, str) and x.strip() for x in b)
            ), p
