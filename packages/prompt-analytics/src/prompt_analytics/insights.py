"""Insight engine: templated comparisons -> ranked, evidence-linked, descriptive (never causal) claims.

Candidates are ranked by |effect| * ln(n) within their chapter (exposure findings outrank everything in
friction by severity: phi > secret > pii). Every chapter gets a headline (rank 1); thin data falls back to a
templated claim. Recommendations map the top negative findings to concrete actions.
"""

from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np
import polars as pl

from .sensitive import ADVICE

CHAPTERS = ["footprint", "time", "funnel", "friction", "works", "recommend"]
NAMES = {"claude_code": "Claude Code", "copilot": "Copilot", "cursor": "Cursor", "opencode": "opencode", "antigravity": "Antigravity"}
MIN_N = 5
MAX_PER_CHAPTER = 4  # 2-4 ranked insights per chapter; thin data yields fewer, never invented ones
B = 500
SEVERITY = {"phi": 3, "secret": 2, "pii": 1}
EXPOSURE_BONUS = 1000.0
INTENT_ACTION = {
    "bugfix": "Add file paths, the error text and the expected behaviour to bugfix prompts.",
    "feature": "State acceptance criteria and name the files or modules a feature should touch.",
    "refactor": "Name the files in scope and say what must not change before asking for a refactor.",
    "explain": "Point at the specific file or function you want explained.",
    "test": "Name the function under test and the edge cases to cover.",
    "docs": "Say who the docs are for and which files they should cover.",
    "devops": "Paste the failing job log and name the environment you are targeting.",
    "data": "Include the table schema and a sample row with the question.",
    "other": "Open prompts with the goal, the files involved and a definition of done.",
}
FEATURE_ACTION = {
    "specificity": "Name files, symbols or the error text in prompts for this topic.",
    "context": "Paste the failing log or a code block when prompting on this topic.",
    "constraints": "State expected behaviour and constraints when prompting on this topic.",
    "length": "Aim for prompts of roughly 40-300 characters on this topic.",
}
FEATURE_PHRASE = {"specificity": "Specific prompts", "context": "Prompts with pasted context",
                  "constraints": "Prompts stating constraints", "length": "Well-sized prompts"}
CAT_TITLE = {"secret": "Stop pasting credentials into prompts", "pii": "Use fake data instead of real personal data",
             "phi": "Keep patient data out of prompts"}
CAT_NOUN = {"phi": "Health", "secret": "Credential", "pii": "Personal"}


def _claim(s: str) -> str:
    w = s.split()
    return " ".join(w[:12])


def _cand(id_: str, chapter: str, claim: str, metric: str, value: float, unit: str, delta: float | None, n: int,
          method: str, score: float, kind: str, drill_filter: dict | None = None, ci: list[float] | None = None,
          meta: dict | None = None) -> dict[str, Any]:
    ev: dict[str, Any] = {"n": int(n), "method": method}
    if ci is not None:
        ev["ci"] = [round(float(ci[0]), 4), round(float(ci[1]), 4)]
    return {"id": id_, "chapter": chapter, "claim": _claim(claim), "metric": metric, "value": round(float(value), 4), "unit": unit,
            "delta": None if delta is None else round(float(delta), 4), "evidence": ev,
            "drill": {"chapter": chapter, "filter": drill_filter or {}}, "score": float(score), "kind": kind, "meta": meta or {}}


def _boot(a: np.ndarray, b: np.ndarray, stat: Callable, eps: float, seed: int) -> tuple[float, float, float]:
    """Point estimate and 95% bootstrap CI of log((stat(a)+eps)/(stat(b)+eps))."""
    rng = np.random.default_rng(seed)
    sa = stat(a[rng.integers(0, len(a), (B, len(a)))], 1)
    sb = stat(b[rng.integers(0, len(b), (B, len(b)))], 1)
    r = np.log((sa + eps) / (sb + eps))
    est = math.log((float(stat(a[None, :], 1)[0]) + eps) / (float(stat(b[None, :], 1)[0]) + eps))
    lo, hi = np.percentile(r, [2.5, 97.5])
    return est, float(lo), float(hi)


def _median(x: np.ndarray, axis: int) -> np.ndarray:
    return np.median(x, axis=axis)


def _mean(x: np.ndarray, axis: int) -> np.ndarray:
    return np.mean(x, axis=axis)


def _rate(x: np.ndarray, axis: int) -> np.ndarray:
    return (x.sum(axis=axis) + 0.5) / (x.shape[axis] + 1)


# (kind, column, stat, eps, higher_is_better, chapter, metric label, unit, scale)
_TOOL_METRICS = [
    ("ttr", "ttr_min", _median, 0.1, False, "time", "median time-to-resolution", "min", 1.0),
    ("loops", "loops", _mean, 0.1, False, "friction", "mean rephrase loops per session", "", 1.0),
    ("applied", "applied", _rate, 0.0, True, "funnel", "share of sessions reaching applied code", "%", 100.0),
]


def _tool_vs_tool(sm: pl.DataFrame) -> list[dict]:
    out = []
    d = sm.filter(pl.col("n_user") > 0).with_columns((pl.col("ttr_s") / 60.0).alias("ttr_min"), pl.col("has_applied").cast(pl.Float64).alias("applied"))
    for intent in sorted(set(d["intent"].drop_nulls().to_list()) - {"other"}):
        di = d.filter(pl.col("intent") == intent)
        for kind, col, stat, eps, hib, chapter, metric, unit, scale in _TOOL_METRICS:
            groups = {}
            for src in sorted(set(di["source"].to_list())):
                v = di.filter(pl.col("source") == src)[col].drop_nulls().to_numpy().astype(float)
                if len(v) >= MIN_N:
                    groups[src] = v
            if len(groups) < 2:
                continue
            val = {s: float(stat(v[None, :], 1)[0]) + eps for s, v in groups.items()}
            best = max(val, key=val.get) if hib else min(val, key=val.get)  # type: ignore[arg-type]
            worst = min(val, key=val.get) if hib else max(val, key=val.get)  # type: ignore[arg-type]
            num, den = (best, worst) if hib else (worst, best)
            est, lo, hi = _boot(groups[num], groups[den], stat, eps, seed=len(out))
            if lo <= 0 or est < math.log(1.25):
                continue
            ratio = math.exp(est)
            n = len(groups[best]) + len(groups[worst])
            b, w = NAMES[best], NAMES[worst]
            claim = {"ttr": f"Your {intent} tasks finish {ratio:.1f}x faster in {b} than {w}",
                     "loops": f"Your {intent} prompts need {ratio:.1f}x fewer retries in {b} than {w}",
                     "applied": f"Your {intent} code lands {ratio:.1f}x more often in {b} than {w}"}[kind]
            out.append(_cand(f"{chapter}.{kind}.{intent}", chapter, claim, metric, (val[best] - eps) * scale, unit,
                             val[best] / val[worst] - 1, n, f"bootstrap ratio, B={B}", est * math.log(n), f"tool_{kind}",
                             {"source": best, "intent": intent}, [math.exp(lo), math.exp(hi)],
                             {"best": best, "worst": worst, "intent": intent, "ratio": ratio}))
    return out


def _friction_hotspots(sm: pl.DataFrame) -> list[dict]:
    out = []
    d = sm.filter(pl.col("n_user") > 0)
    for key, label in (("intent", "intent"), ("source", "source")):
        for g in sorted(set(d[key].drop_nulls().to_list()) - {"other"}):
            a = d.filter(pl.col(key) == g)["friction"].to_numpy().astype(float)
            b = d.filter(pl.col(key) != g)["friction"].to_numpy().astype(float)
            if len(a) < 15 or len(b) < 15:
                continue
            est, lo, hi = _boot(a, b, _mean, 0.02, seed=len(out))
            if lo <= 0 or est < math.log(1.3):
                continue
            ratio = math.exp(est)
            name = NAMES.get(g, g)
            claim = f"Your {name} prompts hit {ratio:.1f}x the friction of other intents"
            if key == "source":
                claim = f"Your {name} sessions hit {ratio:.1f}x the friction of other tools"
            out.append(_cand(f"friction.hotspot.{key}.{g}", "friction", claim, "mean friction score", float(a.mean()), "", ratio - 1,
                             len(a) + len(b), f"bootstrap ratio of means, B={B}", est * math.log(len(a) + len(b)), "hotspot",
                             {key: g}, [math.exp(lo), math.exp(hi)], {"key": key, "group": g, "ratio": ratio}))
    return out


def _long_sessions(sm: pl.DataFrame) -> list[dict]:
    d = sm.filter(pl.col("n_user") > 0)
    if d.height < 20:
        return []
    n_cut = max(6, int(np.percentile(d["n_user"].to_numpy(), 75)))
    rate = (pl.col("corrections") / pl.col("n_user")).alias("r")
    long_ = d.filter(pl.col("n_user") > n_cut).select(rate)["r"].to_numpy()
    short = d.filter(pl.col("n_user") <= n_cut).select(rate)["r"].to_numpy()
    if len(long_) < 10 or len(short) < 10:
        return []
    est, lo, hi = _boot(long_, short, _mean, 0.02, seed=7)
    if lo <= 0 or est < math.log(1.3):
        return []
    ratio = math.exp(est)
    return [_cand("friction.long_sessions", "friction", f"Past {n_cut} prompts, your sessions see {ratio:.1f}x more corrections",
                  "correction rate per prompt", float(long_.mean()), "", ratio - 1, len(long_) + len(short),
                  f"bootstrap ratio of means, B={B}", est * math.log(len(long_) + len(short)), "long_sessions", {},
                  [math.exp(lo), math.exp(hi)], {"n_cut": n_cut, "ratio": ratio})]


def _loops(sm: pl.DataFrame) -> list[dict]:
    d = sm.filter(pl.col("n_user") > 0)
    if d.height < 20:
        return []
    share = float((d["loops"] >= 2).mean())
    if share < 0.05:
        return []
    return [_cand("friction.loops", "friction", f"{share:.0%} of your sessions hit rephrase loops of 2+ retries", "sessions with 2+ rephrases",
                  share * 100, "%", None, d.height, "share of sessions", share * math.log(d.height), "loops", {}, None, {"share": share})]


def _dupes(d: dict | None) -> list[dict]:
    if not d or d["of"] < 50 or d["share"] < 0.05:
        return []
    return [_cand("works.dupes", "works", f"{d['share']:.0%} of your prompts repeat an earlier prompt", "near-duplicate prompts", d["share"] * 100, "%", None, d["of"],
                  "embedding cosine >= 0.95 across sessions", d["share"] * math.log(d["of"]), "dupes", {}, None, {"share": d["share"]})]


def _exposure(exp: dict) -> list[dict]:
    out = []
    kinds = {c["category"]: [k for k in exp["by_kind"] if k["category"] == c["category"]] for c in exp["by_category"]}
    for c in exp["by_category"]:
        top = max(kinds[c["category"]], key=lambda k: (k["sessions"], k["kind"]))["kind"]
        sev = SEVERITY[c["category"]]
        out.append(_cand(f"friction.exposure.{c['category']}", "friction",
                         f"{CAT_NOUN[c['category']]} data pasted in {c['sessions']} of your sessions, mostly {top}",
                         f"sessions with {c['category']} findings", c["sessions"], "", None, c["sessions"],
                         "count of sessions with >=1 finding", EXPOSURE_BONUS * sev, "exposure", {},
                         None, {"category": c["category"], "sessions": c["sessions"], "share": exp["share"]}))
    return out


def _anomalies(anoms: list[dict]) -> list[dict]:
    out = []
    for a in anoms:
        if a["z"] <= 0:
            continue
        v = f"${a['value']:.0f}" if a["metric"] == "cost" else f"{a['value']:.0f}"
        out.append(_cand(f"time.anomaly.{a['metric']}.{a['date']}", "time", f"Your daily {a['metric']} spiked to {v} on {a['date']}",
                         f"daily {a['metric']}", a["value"], "USD" if a["metric"] == "cost" else "", a["value"] / a["median"] - 1 if a["median"] else None,
                         a["n_prior"], "rolling median/MAD robust z, 28d", min(abs(a["z"]), 20) / 4 * math.log(max(a["n_prior"], 2)),
                         "anomaly", {}, None, {"metric": a["metric"], "date": a["date"], "value": a["value"]}))
    return sorted(out, key=lambda c: -c["score"])[:3]


def _footprint(sec: dict) -> list[dict]:
    out = []
    t = sec["totals"]
    rows = [r for r in sec["by_source"] if r["sessions"] > 0]
    if t["sessions"] and rows:
        top = max(rows, key=lambda r: (r["sessions"], r["source"]))
        share = top["sessions"] / t["sessions"]
        out.append(_cand("footprint.top_source", "footprint", f"{NAMES[top['source']]} handles {share:.0%} of your sessions", "session share",
                         share * 100, "%", None, t["sessions"], "share of sessions", share * math.log(t["sessions"]), "share", {"source": top["source"]}))
    if t["cost_usd"] > 0:
        top = max(sec["by_source"], key=lambda r: (r["cost_usd"], r["source"]))
        share = top["cost_usd"] / t["cost_usd"]
        out.append(_cand("footprint.cost_source", "footprint", f"{NAMES[top['source']]} drives {share:.0%} of your spend", "cost share",
                         share * 100, "%", None, t["sessions"], "share of cost", share * math.log(max(t["sessions"], 2)), "share", {"source": top["source"]}))
    if t["longest_streak"] >= 2:
        out.append(_cand("footprint.streak", "footprint", f"Your longest streak is {t['longest_streak']} days in a row", "longest streak",
                         t["longest_streak"], "", None, t["active_days"], "consecutive active days",
                         math.log(1 + t["longest_streak"] / 7) * math.log(max(t["active_days"], 2)), "streak"))
    return out


def _time(sec: dict, sm: pl.DataFrame) -> list[dict]:
    out = []
    t = sm["ttr_s"].drop_nulls()
    if t.len() >= MIN_N:
        med = float(t.median()) / 60
        out.append(_cand("time.median_ttr", "time", f"Your median time to applied code is {med:.0f} minutes", "median time-to-resolution", med, "min",
                         None, t.len(), "median over sessions reaching applied code", 0.2 * math.log(t.len()), "ttr"))
    hw = sec["hour_week"]
    tot = sum(r["prompts"] for r in hw)
    if tot >= 20:
        peak = max(hw, key=lambda r: (r["prompts"], -r["dow"], -r["hour"]))
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        share = peak["prompts"] / tot
        out.append(_cand("time.peak_hour", "time", f"You prompt most on {days[peak['dow']]}s around {peak['hour']:02d}:00 UTC", "prompts in peak hour",
                         share * 100, "%", None, tot, "share of prompts", share * math.log(tot), "peak"))
    return out


def _funnel(sec: dict) -> list[dict]:
    st = sec["funnel"]["stages"]
    tot = [sum(r["counts"][i] for r in sec["funnel"]["by_source"]) for i in range(6)]
    out = []
    drops = [(1 - tot[i + 1] / tot[i], i) for i in range(5) if tot[i] > 0]
    if drops:
        drop, i = max(drops)
        out.append(_cand("funnel.biggest_drop", "funnel", f"{drop:.0%} of your sessions drop between {st[i]} and {st[i + 1]}",
                         f"drop-off {st[i]} to {st[i + 1]}", drop * 100, "%", None, tot[i], "share of sessions at the prior stage",
                         drop * math.log(max(tot[i], 2)), "drop", {}, None, {"from": st[i], "to": st[i + 1], "drop": drop}))
        out.append(_cand("funnel.outcome_rate", "funnel", f"{tot[5] / tot[0]:.0%} of your sessions end in a linked commit", "share reaching outcome",
                         tot[5] / tot[0] * 100, "%", None, tot[0], "share of sessions", 0.3 * math.log(max(tot[0], 2)), "outcome"))
    return out


def _works(ww: list[dict], labels: dict[int, str], val: dict) -> list[dict]:
    out = []
    for r in ww:
        topic = " ".join(labels.get(r["cluster"], f"topic {r['cluster']}").split(", ")[:2])
        verb = "do better" if r["direction"] == "helps" else "do worse"
        rate = r.get("rate")
        out.append(_cand(f"works.effect.{r['cluster']}.{r['feature']}", "works", f"Your {FEATURE_PHRASE[r['feature']][0].lower() + FEATURE_PHRASE[r['feature']][1:]} {verb} in '{topic}' topics",
                         f"{r['feature']} effect ({'applied-rate difference' if rate else 'Cliffs delta'})", r["effect"], "", None, r["n"],
                         "applied-rate difference, Newcombe-Wilson CI" if rate else "cliffs delta, bootstrap CI, BH-FDR q=0.1",
                         abs(r["effect"]) * math.log(r["n"]), "effect", {"cluster": r["cluster"]}, r["ci"],
                         {"feature": r["feature"], "direction": r["direction"], "cluster": r["cluster"], "topic": topic}))
    rho = val.get("spearman")
    if rho is not None and abs(rho) >= 0.1:
        out.append(_cand("works.quality_rho", "works", f"Your higher-quality prompts get {'fewer' if rho < 0 else 'more'} follow-ups (rho {rho:+.2f})", "within-intent Spearman",
                         rho, "", None, val["n"], "spearman within intent, weighted", abs(rho) * math.log(max(val["n"], 2)), "quality"))
    return out


def _mon(m: str) -> str:
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(m[5:7]) - 1]


def _hour_label(h: int) -> str:
    return f"{h % 12 or 12}{'am' if h < 12 else 'pm'}"


def _costliest_hour(sess: pl.DataFrame) -> list[dict]:
    d = sess.filter(~pl.col("is_subagent") & pl.col("started").is_not_null() & (pl.col("cost") > 0))
    if d.height < 20:
        return []
    g = d.group_by(pl.col("started").dt.weekday().alias("dow"), pl.col("started").dt.hour().alias("hour")).agg(
        pl.col("cost").sum().alias("cost"), pl.len().alias("n")).filter(pl.col("n") >= 3)
    if not g.height:
        return []
    top = g.sort("cost", "dow", "hour", descending=[True, False, False]).row(0, named=True)
    share = top["cost"] / float(d["cost"].sum())
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return [_cand("time.costliest_hour", "time", f"{days[top['dow'] - 1]} {_hour_label(top['hour'])} is your costliest hour", "spend in peak hour (UTC)",
                  share * 100, "%", None, top["n"], "share of spend by session start hour", share * math.log(d.height) * 2, "costliest_hour",
                  {}, None, {"cost": top["cost"]})]


def _months(sm: pl.DataFrame, sess: pl.DataFrame) -> list[dict]:
    """You vs your best month. ponytail: 'applied edit' = session with applied code; months need >=10 sessions."""
    d = sm.filter(pl.col("n_user") > 0).join(sess.select("session_id", "date", "cost"), on="session_id", how="left").filter(pl.col("date").is_not_null())
    d = d.with_columns(pl.col("date").dt.strftime("%Y-%m").alias("month"))
    m = d.group_by("month").agg(pl.len().alias("n"), pl.col("has_applied").sum().alias("applied"), pl.col("cost").sum().alias("cost")).filter(pl.col("n") >= 10).sort("month")
    if m.height < 2:
        return []
    rows = m.with_columns((pl.col("applied") / pl.col("n")).alias("rate")).to_dicts()
    cur = rows[-1]
    out = []
    best = max(rows, key=lambda r: (r["rate"], r["month"]))
    gap = (best["rate"] - cur["rate"]) * 100
    base = dict(n=cur["n"] + best["n"], method="monthly applied-rate, months with >=10 sessions")
    if best is cur:
        out.append(_cand("funnel.best_month", "funnel", f"{_mon(cur['month'])} is your best month for applied code", "applied rate", cur["rate"] * 100, "%", None,
                         base["n"], base["method"], 1.0 * math.log(cur["n"]), "best_month", {}, None, {"month": cur["month"]}))
    elif gap >= 5:
        out.append(_cand("funnel.vs_best_month", "funnel", f"Your {_mon(cur['month'])} applied rate is {gap:.0f} points below {_mon(best['month'])}",
                         "applied rate vs best month", cur["rate"] * 100, "%", -gap / 100, base["n"], base["method"], gap / 20 * math.log(base["n"]),
                         "vs_best_month", {}, None, {"best": best["month"], "current": cur["month"], "gap": gap}))
    paid = [r for r in rows if r["applied"] >= 3 and r["cost"] > 0]  # unpriced months would divide by zero
    if len(paid) >= 2 and paid[-1] is cur:
        for r in paid:
            r["cpa"] = r["cost"] / r["applied"]
        bc = min(paid, key=lambda r: (r["cpa"], r["month"]))
        if bc is cur:
            out.append(_cand("footprint.cheapest_month", "footprint", f"{_mon(cur['month'])} is your cheapest month per applied session", "cost per applied session",
                             cur["cpa"], "USD", None, cur["applied"], "monthly spend / applied sessions", 0.8 * math.log(cur["applied"] + 1), "cheapest_month"))
        elif cur["cpa"] / bc["cpa"] >= 1.25:
            r_ = cur["cpa"] / bc["cpa"]
            out.append(_cand("footprint.vs_best_cost", "footprint", f"Your {_mon(cur['month'])} spend per applied session is {r_:.1f}x {_mon(bc['month'])}'s",
                             "cost per applied session", cur["cpa"], "USD", r_ - 1, cur["applied"] + bc["applied"], "monthly spend / applied sessions",
                             math.log(r_) * math.log(cur["applied"] + bc["applied"] + 1), "vs_best_cost", {}, None, {"best": bc["month"], "current": cur["month"], "ratio": r_}))
    return out


def _specific_prompts(sm: pl.DataFrame) -> list[dict]:
    d = sm.filter(pl.col("first_quality").is_not_null() & (pl.col("n_user") > 0))
    if d.height < 30:
        return []
    cut = float(d["first_quality"].median())
    hi = d.filter(pl.col("first_quality") >= cut)["has_applied"].cast(pl.Float64).to_numpy()
    lo = d.filter(pl.col("first_quality") < cut)["has_applied"].cast(pl.Float64).to_numpy()
    if len(hi) < MIN_N or len(lo) < MIN_N:
        return []
    est, l, h = _boot(hi, lo, _rate, 0.0, seed=11)
    if l <= 0 or est < math.log(1.1):
        return []
    ratio = math.exp(est)
    return [_cand("works.specific_prompts", "works", f"Your detailed opening prompts succeed {(ratio - 1) * 100:.0f}% more often", "applied-rate ratio, top vs bottom half by quality",
                  ratio, "x", ratio - 1, d.height, f"bootstrap ratio, B={B}", est * math.log(d.height), "specific", {}, [math.exp(l), math.exp(h)], {"ratio": ratio})]


def _intent_mix(sm: pl.DataFrame) -> list[dict]:
    d = sm.filter(pl.col("intent").is_not_null() & (pl.col("intent") != "other"))
    if d.height < 20:
        return []
    top, n = max(d["intent"].value_counts().iter_rows(), key=lambda r: (r[1], r[0]))
    share = n / sm.filter(pl.col("n_user") > 0).height
    return [_cand("footprint.top_intent", "footprint", f"{top.capitalize()} is your most common task, {share:.0%} of sessions", "intent share", share * 100, "%", None,
                  d.height, "share of sessions by first-prompt intent", share * math.log(d.height), "share", {"intent": top})]


def _summary(sec: dict, sm: pl.DataFrame) -> list[dict]:
    """Five 'year in review' stats (chapter recommend, metric prefix summary:)."""
    t = sec["totals"]
    rows = [r for r in sec["by_source"] if r["sessions"] > 0]
    out = []

    def add(key: str, claim: str, v: float, unit: str, n: int, order: int) -> None:
        out.append(_cand(f"recommend.summary.{key}", "recommend", claim, f"summary:{key}", v, unit, None, n, "year-in-review stat", 50.0 - order, "summary"))

    if t["sessions"] and rows:
        add("sessions", f"You ran {t['sessions']} sessions across {len(rows)} tools", t["sessions"], "", t["sessions"], 0)
        top = max(rows, key=lambda r: (r["sessions"], r["source"]))
        add("top_tool", f"{NAMES[top['source']]} was your go-to, {top['sessions'] / t['sessions']:.0%} of sessions", top["sessions"] / t["sessions"] * 100, "%", t["sessions"], 1)
    if t["longest_streak"] >= 2:
        add("streak", f"Your longest streak ran {t['longest_streak']} days", t["longest_streak"], "", t["active_days"], 2)
    tot = [sum(r["counts"][i] for r in sec["funnel"]["by_source"]) for i in (0, 4)]
    if tot[0] >= MIN_N:
        add("applied_rate", f"{tot[1] / tot[0]:.0%} of your sessions ended in applied code", tot[1] / tot[0] * 100, "%", tot[0], 3)
    if t["cost_usd"] > 0:
        top = max(sec["by_source"], key=lambda r: (r["cost_usd"], r["source"]))
        add("spend", f"You spent ${t['cost_usd']:.0f}, mostly on {NAMES[top['source']]}", t["cost_usd"], "USD", t["sessions"], 4)
    return out


def _fallbacks(sec: dict, ww_n: int) -> dict[str, dict]:
    t = sec["totals"]
    tot0 = sum(r["counts"][0] for r in sec["funnel"]["by_source"])
    tot4 = sum(r["counts"][4] for r in sec["funnel"]["by_source"])
    nfr = sum(r["n"] for r in sec["friction"]["rates"])
    corr = sum(r["correction"] * r["n"] for r in sec["friction"]["rates"]) / nfr if nfr else 0.0
    mk = lambda ch, claim, metric, v, unit, n: _cand(f"{ch}.headline", ch, claim, metric, v, unit, None, n, "templated fallback", 0.0, "fallback")  # noqa: E731
    return {
        "footprint": mk("footprint", f"{t['sessions']} sessions across {sum(1 for r in sec['by_source'] if r['sessions'])} tools", "sessions", t["sessions"], "", t["sessions"]),
        "time": mk("time", f"{t['active_days']} active days of AI-assisted work", "active days", t["active_days"], "", t["active_days"]),
        "funnel": mk("funnel", f"{(tot4 / tot0 if tot0 else 0):.0%} of your sessions reach applied code", "applied rate", (tot4 / tot0 * 100) if tot0 else 0.0, "%", tot0),
        "friction": mk("friction", f"{corr:.0%} of your sessions include a correction", "correction incidence", corr * 100, "%", nfr),
        "works": mk("works", "Not enough sessions yet to rank what works", "sessions", t["sessions"], "", t["sessions"]),
    }


def _recommend(items: list[dict], sec: dict) -> list[dict]:
    """Top negative findings -> concrete actions, each linked to a retained insight."""
    recs = []

    def add(rank: float, cand: dict, title: str, action: str, impact: str) -> None:
        recs.append({"rank": rank, "title": title, "action": action, "impact": impact, "evidence_insight": cand["id"]})

    for c in items:
        m, k = c["meta"], c["kind"]
        if k == "exposure":
            cat = m["category"]
            # phi > secret > pii, all above every productivity recommendation (scores there stay < 100)
            add({"phi": 3.0, "secret": 2.0, "pii": 1.5}[cat] * EXPOSURE_BONUS, c, CAT_TITLE[cat], ADVICE[cat],
                f"{m['sessions']} sessions ({m['share']:.0%} of all) had {cat} findings")
        elif k == "hotspot" and m["key"] == "intent":
            add(c["score"], c, f"Tighten {m['group']} prompts", INTENT_ACTION[m["group"]], f"{m['group']} sessions run {m['ratio']:.1f}x the friction of other intents")
        elif k == "long_sessions":
            add(c["score"], c, "Reset context between tasks", f"Use /clear or start a new session once a session passes {m['n_cut']} prompts.",
                f"Longer sessions show {m['ratio']:.1f}x the correction rate")
        elif k == "loops":
            add(c["score"], c, "Break rephrase loops early", "After two rephrases, add an example or the error text, or switch approach instead of retrying.",
                f"{m['share']:.0%} of sessions hit loops of 2+ retries")
        elif k == "dupes":
            add(c["score"], c, "Save repeated prompts", "Turn your most repeated prompts into a slash command or a CLAUDE.md rule.",
                f"{m['share']:.0%} of prompts are near-duplicates of earlier ones")
        elif k in ("tool_ttr", "tool_applied", "tool_loops"):
            what = {"tool_ttr": "resolves faster", "tool_applied": "lands code more often", "tool_loops": "needs fewer retries"}[k]
            add(c["score"], c, f"Try {NAMES[m['best']]} first for {m['intent']}", f"Start {m['intent']} tasks in {NAMES[m['best']]}; it {what} than {NAMES[m['worst']]} in your history.",
                f"{m['ratio']:.1f}x gap (descriptive, not causal)")
        elif k == "anomaly" and m["metric"] == "cost":
            add(c["score"], c, "Set a daily spend alert", f"Review {m['date']} (cost ${m['value']:.0f}) and set an alert above your normal daily range.",
                "A single day far outside the trailing 28-day range")
        elif k == "effect" and m["direction"] == "helps":
            add(c["score"], c, f"Lean on {m['feature']} in '{m['topic']}' prompts", FEATURE_ACTION[m["feature"]],
                f"Effect {c['value']:+.2f} (descriptive)")
    return sorted(recs, key=lambda r: (-r["rank"], r["evidence_insight"]))[:8]


def generate(inp: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    """Returns (insights in contract shape incl. ``unit``, recommendations in contract shape)."""
    sm, sec = inp["sm"], inp["sec"]
    cands = (_footprint(sec) + _time(sec, sm) + _funnel(sec) + _tool_vs_tool(sm) + _friction_hotspots(sm) + _long_sessions(sm)
             + _loops(sm) + _dupes(inp.get("dupes")) + _exposure(inp["exposure"]) + _anomalies(inp["anoms"]) + _works(inp["what_works"], inp["labels"], inp["validation"])
             + _costliest_hour(inp["sess"]) + _months(sm, inp["sess"]) + _specific_prompts(sm) + _intent_mix(sm))
    fall = _fallbacks(sec, len(inp["what_works"]))
    kept: list[dict] = []
    for ch in CHAPTERS[:-1]:
        mine = sorted((c for c in cands if c["chapter"] == ch), key=lambda c: (-c["score"], c["id"]))[:MAX_PER_CHAPTER]
        kept.extend(mine or [fall[ch]])
    recs = _recommend(kept, sec)
    head = _cand("recommend.headline", "recommend",
                 f"{len(recs)} evidence-backed changes to try next" if recs else "Not enough evidence for recommendations yet",
                 "recommendations", len(recs), "", None, len(recs), "templated from top findings", 0.0, "headline")
    kept.append(head | {"score": 100.0})
    kept.extend(_summary(sec, sm))
    out = []
    for ch in CHAPTERS:
        for i, c in enumerate(sorted((c for c in kept if c["chapter"] == ch), key=lambda c: (-c["score"], c["id"])), 1):
            out.append({k: c[k] for k in ("id", "chapter", "claim", "metric", "value", "unit", "delta", "evidence", "drill")} | {"rank": i})
    return out, [{"id": f"rec.{i}", **{k: r[k] for k in ("title", "action", "impact", "evidence_insight")}} for i, r in enumerate(recs, 1)]
