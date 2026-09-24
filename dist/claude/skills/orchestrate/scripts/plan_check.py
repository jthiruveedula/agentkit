#!/usr/bin/env python3
"""plan_check.py — validate an orchestration plan and print execution waves.

    python3 scripts/plan_check.py .agentkit/plan.json
    python3 scripts/plan_check.py plan.json --max-parallel 3 --json
    python3 scripts/plan_check.py plan.json --owners researcher,implementer

Exit 0 = valid (waves printed), 1 = invalid (errors on stderr). Stdlib only.
"""

import argparse
import json
import sys

ROSTER = {
    "researcher",
    "implementer",
    "reviewer",
    "test-writer",
    "doc-writer",
    "verifier",
    "data-platform-architect",
    "pipeline-engineer",
    "data-quality-engineer",
    "ml-engineer",
}


def check(plan, owners=ROSTER, max_parallel=5):
    """Return (errors, waves). Waves are lists of task ids in run order."""
    errors = []
    tasks = plan.get("tasks") or []
    if not tasks:
        return ["plan has no tasks"], []
    ids = [t.get("id") for t in tasks]
    seen = set()
    for t in tasks:
        tid = t.get("id")
        if not tid:
            errors.append("task without id")
            continue
        if tid in seen:
            errors.append("duplicate id: %s" % tid)
        seen.add(tid)
        if t.get("owner") not in owners:
            errors.append("%s: unknown owner %r" % (tid, t.get("owner")))
        for field in ("objective", "output"):
            if not str(t.get(field, "")).strip():
                errors.append("%s: empty %s" % (tid, field))
        for d in t.get("deps", []):
            if d not in ids:
                errors.append("%s: unknown dep %r" % (tid, d))
    if errors:
        return errors, []

    deps = {t["id"]: set(t.get("deps", [])) for t in tasks}
    done, waves = set(), []
    while len(done) < len(deps):
        wave = sorted(t for t, d in deps.items() if t not in done and d <= done)
        if not wave:
            stuck = sorted(set(deps) - done)
            return ["dependency cycle among: %s" % ", ".join(stuck)], []
        if len(wave) > max_parallel:
            errors.append(
                "wave %d has %d tasks (max %d): %s"
                % (len(waves) + 1, len(wave), max_parallel, ", ".join(wave))
            )
        waves.append(wave)
        done.update(wave)
    return errors, waves


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("plan")
    ap.add_argument("--max-parallel", type=int, default=5)
    ap.add_argument("--owners", help="comma-separated allowed owners (default: roster)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    with open(a.plan, encoding="utf-8") as fh:
        plan = json.load(fh)
    owners = set(a.owners.split(",")) if a.owners else ROSTER
    errors, waves = check(plan, owners, a.max_parallel)
    if errors:
        for e in errors:
            print("plan_check: " + e, file=sys.stderr)
        return 1
    if a.json:
        print(json.dumps({"waves": waves}))
    else:
        for i, w in enumerate(waves, 1):
            print("wave %d: %s" % (i, ", ".join(w)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
