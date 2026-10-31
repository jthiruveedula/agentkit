"""dashboard.json builder (contract: dashboard/src/data/contract.ts) and the export privacy gate."""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import numpy as np
import polars as pl

from .analytics import funnel as fn
from .analytics import metrics as mx
from .config import Config
from .ml import anomaly
from .privacy import Redactor, harden_tree, write_private
from .sensitive import ADVICE

MAX_ANOMALIES = 6  # per metric
MAX_SESSIONS = 5000  # newest first; per-session rows for dashboard drilldowns

SCHEMA = "1.0"
MAX_POINTS = 20000
SNIPPET = 160
PLACEHOLDER = '<script type="application/json" id="pa-data">null</script>'
WEB_INDEX = Path(__file__).resolve().parent / "web" / "index.html"
MIN_HTML = f"<!doctype html><html><head><meta charset=\"utf-8\"><title>prompt-analytics</title></head><body><div id=\"root\"></div>{PLACEHOLDER}</body></html>\n"
INTENTS = ("bugfix", "feature", "refactor", "explain", "test", "docs", "devops", "data", "other")
STATUSES = ("ok", "degraded", "missing", "unsupported")


class ExportBlocked(RuntimeError):
    def __init__(self, kinds: list[str]):
        super().__init__(f"export blocked by privacy gate: {sorted(set(kinds))}")
        self.kinds = sorted(set(kinds))


def core_sections(b: mx.Base, sess: pl.DataFrame, prompts: pl.DataFrame, sm: pl.DataFrame) -> tuple[dict[str, Any], dict[str, Any]]:
    """Contract sections computable from base tables + session_metrics, plus anomaly detail for insights."""
    human = sess.filter(~pl.col("is_subagent"))
    dates = [d for d in human["date"].to_list() + prompts["pdate"].to_list() if d is not None]
    active, longest, current = mx.streaks(dates)
    dmin, dmax = (min(dates), max(dates)) if dates else (date(1970, 1, 1), date(1970, 1, 1))
    totals = {"sessions": human.height, "prompts": prompts.height, "tokens": int(sess["tokens"].sum() or 0),
              "cost_usd": float(sess["cost"].sum() or 0.0), "active_days": active, "longest_streak": longest,
              "current_streak": current, "projects": human["project_id"].drop_nulls().n_unique(),
              "commits_linked": b.outcomes.filter(pl.col("session_id").is_not_null()).height}
    by_source = mx.by_source(sess, prompts)

    daily = mx.daily_frame(sess, prompts).group_by("date").agg(pl.col("cost").sum(), pl.col("prompts").sum()).sort("date")
    anoms, extras = [], []
    for metric, col in (("cost", "cost"), ("prompts", "prompts")):
        rows = anomaly.flagged(anomaly.detect(daily["date"].to_list(), [float(v) for v in daily[col].to_list()]))
        # spikes only, strongest few: a chart with 20 markers says nothing
        rows = sorted((r for r in rows if r["z"] > 0), key=lambda r: -r["z"])[:MAX_ANOMALIES]
        for r in rows:
            anoms.append({"date": r["date"].isoformat(), "metric": metric, "value": r["value"], "z": r["z"]})
            extras.append({"date": r["date"].isoformat(), "metric": metric, "value": r["value"], "z": r["z"], "median": r["median"], "n_prior": r["n_prior"]})

    c = sm.with_columns([(pl.col("reached_stage") >= i).alias(f"c{i}") for i in range(1, 7)])
    present = sorted(set(sm["intent"].drop_nulls().to_list()) | set(), key=INTENTS.index)
    funnel = {"stages": list(fn.STAGES),
              "by_source": fn.counts(c, "source", list(mx.SOURCES)),
              "by_intent": fn.counts(c, "intent", present)}

    t = sm.filter(pl.col("n_turns") > 0)
    rates = []
    for src in mx.SOURCES:
        g = t.filter(pl.col("source") == src)
        if g.height:
            f = lambda e: float(g.select(e.mean()).item())  # noqa: E731
            rates.append({"source": src, "correction": f(pl.col("corrections") > 0), "frustration": f(pl.col("frustrations") > 0),
                          "rephrase": f(pl.col("loops") > 0), "abandoned": f(pl.col("abandoned")), "interrupted": f(pl.col("interrupts") > 0), "n": g.height})
    u = sm.filter(pl.col("n_user") > 0)
    by_intent = [{"intent": i, "friction": float(g["friction"].mean()), "n": g.height}
                 for i in present if (g := u.filter(pl.col("intent") == i)).height]
    hist = u.group_by("loops").agg(pl.len().alias("sessions")).sort("loops")
    sec = {
        "range": {"start": dmin.isoformat(), "end": dmax.isoformat()}, "totals": totals, "by_source": by_source,
        "calendar": mx.calendar(sess, prompts), "hour_week": mx.hour_week(prompts), "cost_river": mx.cost_river(sess),
        "anomalies": anoms, "ttr": mx.ttr_table(sm), "funnel": funnel, "tool_switch": mx.tool_switch(sess),
        "friction": {"rates": rates, "by_intent": by_intent, "loops_hist": [{"loops": r["loops"], "sessions": r["sessions"]} for r in hist.iter_rows(named=True)]},
        "exposure": mx.exposure_summary(b, sess, ADVICE),
    }
    return sec, {"anoms": extras}


def _clean(o: Any) -> Any:
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not math.isfinite(float(o)) else round(float(o), 6)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    return o


def _snippet(red: Redactor, text: str | None) -> str | None:
    if not text:
        return None
    s = red.redact(" ".join(text.split())) or ""
    return s[:SNIPPET]


def _galaxy(con: duckdb.DuckDBPyConnection, red: Redactor) -> dict[str, Any]:
    pts = mx.fetch(con, "SELECT cluster_id, x, y, quality FROM prompt_features WHERE x IS NOT NULL ORDER BY turn_id",
                   {"cluster_id": pl.Int64, "x": pl.Float64, "y": pl.Float64, "quality": pl.Float64})
    cl = mx.fetch(con, "SELECT cluster_id, label, size, exemplar, intent, success FROM clusters ORDER BY cluster_id",
                  {"cluster_id": pl.Int64, "label": pl.Utf8, "size": pl.Int64, "exemplar": pl.Utf8, "intent": pl.Utf8, "success": pl.Float64})
    if not pts.height:  # basic tier: intent groups, no point map
        return {"clusters": [{"id": r["cluster_id"], "label": red.redact(r["label"]) or "", "size": r["size"], "intent": r["intent"], "success": r["success"],
                              "cx": 0.5, "cy": 0.5} for r in cl.iter_rows(named=True)], "points": {"x": [], "y": [], "c": [], "q": []}}
    x, y = pts["x"].to_numpy(), pts["y"].to_numpy()
    norm = lambda v: (v - v.min()) / (v.max() - v.min()) if v.max() > v.min() else np.full_like(v, 0.5)  # noqa: E731
    nx, ny, c, q = norm(x), norm(y), pts["cluster_id"].to_numpy(), pts["quality"].fill_null(0).to_numpy()
    clusters = []
    for r in cl.iter_rows(named=True):
        m = c == r["cluster_id"]
        clusters.append({"id": r["cluster_id"], "label": red.redact(r["label"]) or "", "size": r["size"], "intent": r["intent"],
                         "success": r["success"], "cx": float(nx[m].mean()) if m.any() else 0.5, "cy": float(ny[m].mean()) if m.any() else 0.5,
                         **({"exemplar": s} if (s := _snippet(red, r["exemplar"])) else {})})
    idx = np.arange(len(c))
    if len(c) > MAX_POINTS:
        idx = np.sort(np.random.default_rng(0).choice(len(c), MAX_POINTS, replace=False))
    return {"clusters": clusters, "points": {"x": np.round(nx[idx], 4).tolist(), "y": np.round(ny[idx], 4).tolist(),
                                              "c": c[idx].tolist(), "q": np.round(q[idx], 1).tolist()}}


def _sources(b: mx.Base, by_source: list[dict], red: Redactor) -> list[dict]:
    health = {r["source"]: r for r in b.source_health.iter_rows(named=True)}
    out = []
    for r in by_source:
        h = health.get(r["source"])
        status = (h["status"] if h and h["status"] in STATUSES else "degraded") if h else ("ok" if r["sessions"] else "missing")
        row: dict[str, Any] = {"source": r["source"], "status": status, "sessions": r["sessions"]}
        if h and h["warnings"]:
            try:
                w = json.loads(h["warnings"])
                note = w[0] if isinstance(w, list) and w else (w if isinstance(w, str) else "")
            except ValueError:
                note = h["warnings"]
            if note:
                row["note"] = (red.redact(str(note)) or "")[:120]
        out.append(row)
    return out


def build(con: duckdb.DuckDBPyConnection, cfg: Config) -> dict[str, Any]:
    """Assemble DashboardData from base + derived tables. Aggregates only, snippets re-redacted."""
    if not con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = 'analysis_meta'").fetchall()[0][0]:
        raise RuntimeError("derived tables missing: run analyze first")
    red = Redactor(cfg.redact, style="kind")
    b = mx.load_base(con)
    sess = mx.session_frame(b)
    prompts = mx.prompt_frame(b, sess)
    sm = mx.fetch(con, """SELECT session_id, source, intent, n_user, n_turns, corrections, frustrations, loops, interrupts, abandoned,
                          friction, has_applied, has_outcome, ttr_s, reached_stage FROM session_metrics ORDER BY session_id""",
                  {"session_id": pl.Utf8, "source": pl.Utf8, "intent": pl.Utf8, "n_user": pl.Int64, "n_turns": pl.Int64, "corrections": pl.Int64,
                   "frustrations": pl.Int64, "loops": pl.Int64, "interrupts": pl.Int64, "abandoned": pl.Boolean, "friction": pl.Float64,
                   "has_applied": pl.Boolean, "has_outcome": pl.Boolean, "ttr_s": pl.Float64, "reached_stage": pl.Int64})
    sec, _ = core_sections(b, sess, prompts, sm)
    meta = dict(con.execute("SELECT key, value FROM analysis_meta").fetchall())
    qs = {r[0]: r[1:] for r in con.execute("SELECT scope, specificity, context, constraints, length FROM quality_summary").fetchall()}
    zero = (0.0, 0.0, 0.0, 0.0)
    ww = [{"cluster": r[0], "feature": r[1], "effect": r[2], "ci": [r[3], r[4]], "n": r[5], "direction": r[6]} for r in con.execute(
        "SELECT cluster, feature, effect, ci_lo, ci_hi, n, direction FROM what_works ORDER BY abs(effect) DESC, cluster, feature").fetchall()]
    ins = [{"id": r[0], "chapter": r[1], "rank": r[2], "claim": r[3], "metric": r[4], "value": r[5], "unit": r[6], "delta": r[7],
            "evidence": json.loads(r[8]), "drill": json.loads(r[9])} for r in con.execute(
        "SELECT id, chapter, rank, claim, metric, value, unit, delta, evidence, drill FROM insights ORDER BY chapter, rank").fetchall()]
    recs = [dict(zip(("id", "title", "action", "impact", "evidence_insight"), r)) for r in con.execute(
        "SELECT id, title, action, impact, evidence_insight FROM recommendations ORDER BY rank").fetchall()]
    rho = meta.get("spearman")
    data = {
        "schema": SCHEMA, "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "range": sec["range"],
        "engine": _engine(meta), "sources": _sources(b, sec["by_source"], red),
        "totals": sec["totals"], "by_source": sec["by_source"],
        "calendar": sec["calendar"], "hour_week": sec["hour_week"], "cost_river": sec["cost_river"], "anomalies": sec["anomalies"], "ttr": sec["ttr"],
        "funnel": sec["funnel"], "tool_switch": sec["tool_switch"], "friction": sec["friction"],
        "galaxy": _galaxy(con, red),
        "quality": {"axes": ["specificity", "context", "constraints", "length"], "you": list(qs.get("you", zero)), "top": list(qs.get("top", zero)),
                    "by_source": [{"source": s, "values": list(qs[f"src:{s}"])} for s in mx.SOURCES if f"src:{s}" in qs],
                    "validation": {"spearman": float(rho) if rho not in (None, "") else None, "n": int(float(meta.get("spearman_n", 0)))}},
        "what_works": ww, "sessions": _sessions(con, b, sess, sm, red), "exposure": {**sec["exposure"], "items": _exposure_items(b, sess, red)}, "insights": ins, "recommendations": recs,
    }
    return _clean(data)


def _sessions(con: duckdb.DuckDBPyConnection, b: mx.Base, sess: pl.DataFrame, sm: pl.DataFrame, red: Redactor) -> list[dict[str, Any]]:
    """One row per non-subagent session, newest first, capped. Titles are redacted snippets; no prompt text.
    cost_usd is null for sources that never record a price (so the UI says "not priced" instead of plotting $0)."""
    human = sess.filter(~pl.col("is_subagent"))
    priced = {r["source"] for r in human.group_by("source").agg(pl.col("cost").sum().alias("c")).iter_rows(named=True) if (r["c"] or 0) > 0}
    names = {r[0]: r[1] for r in con.execute("SELECT project_id, name FROM projects").fetchall()}
    titles = dict(b.titles.iter_rows())
    pf = mx.fetch(con, "SELECT turn_id, cluster_id FROM prompt_features WHERE cluster_id IS NOT NULL", {"turn_id": pl.Utf8, "cluster_id": pl.Int64})
    top = (b.turns.select("turn_id", "session_id").join(pf, on="turn_id", how="inner").group_by("session_id", "cluster_id").agg(pl.len().alias("n"))
           .sort(["session_id", "n", "cluster_id"], descending=[False, True, False]).group_by("session_id", maintain_order=True).first())
    cl = dict(zip(top["session_id"].to_list(), top["cluster_id"].to_list()))
    m = {r["session_id"]: r for r in sm.iter_rows(named=True)}
    rows = human.sort(["date", "session_id"], descending=[True, True], nulls_last=True).head(MAX_SESSIONS)
    out = []
    for r in rows.iter_rows(named=True):
        x = m.get(r["session_id"], {})
        t = titles.get(r["session_id"])
        name = names.get(r["project_id"])
        out.append({"id": r["session_id"], "source": r["source"], "date": r["date"].isoformat() if r["date"] else "",
                    "project": (red.redact(name) or "")[:60] if name else "", "intent": x.get("intent") or "other",
                    "prompts": int(x.get("n_user") or 0), "tokens": int(r["tokens"] or 0),
                    "cost_usd": float(r["cost"] or 0.0) if r["source"] in priced else None,
                    "reached_stage": int(x.get("reached_stage") or 0), "applied": bool(x.get("has_applied")),
                    "loops": int(x.get("loops") or 0), "friction": float(x.get("friction") or 0.0),
                    "cluster": int(cl.get(r["session_id"], -1)), "title": (red.redact(" ".join(t.split())) or "")[:SNIPPET] if t else ""})
    return out


def _engine(meta: dict[str, str]) -> dict[str, Any]:
    if meta.get("engine"):
        return json.loads(meta["engine"])
    return {"mode": "basic", "requested": "auto", "available": ["basic"], "libs": {}, "accel": "cpu", "reason": "not analyzed yet", "upgrade": None, "methods": {}}


def _exposure_items(b: mx.Base, sess: pl.DataFrame, red: Redactor) -> list[dict[str, Any]]:
    """Review queue: one item per flagged user turn of a human session, newest first, capped at 300."""
    out = []
    for r in mx.exposure_items(b, sess)[:300]:
        title = (red.redact(r["title"]) or "")[:SNIPPET] if r["title"] else None
        out.append({"id": r["turn_id"], "session": r["session_id"], "source": r["source"], "date": r["date"].isoformat() if r["date"] else "", "session_title": title,
                    "category": r["category"], "kinds": r["kinds"], "preview": _snippet(red, r["preview"]), "status": r["status"]})
    return out


def serialize(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=True, separators=(",", ":"), allow_nan=False)


def _strings(o: Any):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):  # keys are fixed contract names ("secret", "tokens"); scanning them trips key=value rules
        for v in o.values():
            yield from _strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from _strings(v)


def write(cfg: Config, data: dict[str, Any], out_dir: Path) -> Path:
    """Gate, then write index.html (data inlined) and dashboard.json, both 0600. Returns index.html."""
    payload = serialize(data)
    leaks = Redactor(cfg.redact).find_leaks("\n".join(_strings(data)))
    if leaks:
        raise ExportBlocked(leaks)
    html = WEB_INDEX.read_text(encoding="utf-8") if WEB_INDEX.is_file() else MIN_HTML
    if PLACEHOLDER not in html:
        raise ValueError("web/index.html is missing the pa-data placeholder")
    out_dir = Path(out_dir)
    index = out_dir / "index.html"
    write_private(index, html.replace(PLACEHOLDER, PLACEHOLDER.replace("null", payload.replace("</", "<\\/").replace("<!--", "<\\u0021--")), 1))
    write_private(out_dir / "dashboard.json", payload)
    harden_tree(out_dir)
    return index
