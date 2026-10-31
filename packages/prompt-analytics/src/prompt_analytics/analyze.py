"""analyze.run: base tables -> features, clusters, session metrics, daily, insights (derived tables).

Deterministic: seeded models, inputs sorted by id. Subagent sessions are excluded from prompt features,
funnel, friction and quality (architecture A7). Text may be NULL (store_text=none): text features are skipped
and the run reports mode "basic".
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import duckdb
import numpy as np
import polars as pl

from . import capabilities, export, insights
from .analytics import funnel as fn
from .analytics import metrics as mx
from .config import Config
from .ml import anomaly, embed, friction, intent, quality, topics, whatworks
from .privacy import load_salt, secure_dir

ACK = {"yes", "no", "ok", "okay", "y", "n", "continue", "go", "go on", "thanks", "thank you", "do it", "proceed", "sure", "lgtm"}

DERIVED_DDL = """
CREATE OR REPLACE TABLE prompt_features (turn_id VARCHAR, intent VARCHAR, intent_score DOUBLE, quality DOUBLE,
  q_specificity DOUBLE, q_context DOUBLE, q_constraints DOUBLE, q_length DOUBLE, is_correction BOOLEAN, is_frustration BOOLEAN,
  is_rephrase BOOLEAN, cluster_id INTEGER, x DOUBLE, y DOUBLE);
CREATE OR REPLACE TABLE session_metrics (session_id VARCHAR, ttr_s DOUBLE, friction DOUBLE, abandoned BOOLEAN, loops INTEGER,
  reached_stage INTEGER, source VARCHAR, intent VARCHAR, n_user INTEGER, n_turns INTEGER, corrections INTEGER, frustrations INTEGER,
  interrupts INTEGER, has_applied BOOLEAN, has_outcome BOOLEAN, first_quality DOUBLE, outcome_score DOUBLE);
CREATE OR REPLACE TABLE clusters (cluster_id INTEGER, label VARCHAR, size INTEGER, exemplar VARCHAR, intent VARCHAR, success DOUBLE);
CREATE OR REPLACE TABLE daily (date DATE, source VARCHAR, sessions INTEGER, prompts INTEGER, tokens BIGINT, cost DOUBLE, anomaly_z DOUBLE);
CREATE TABLE IF NOT EXISTS embeddings_cache (text_hmac VARCHAR, backend VARCHAR, vec FLOAT[], PRIMARY KEY (text_hmac, backend));
CREATE OR REPLACE TABLE insights (rank INTEGER, id VARCHAR, chapter VARCHAR, claim VARCHAR, metric VARCHAR, value DOUBLE, delta DOUBLE,
  evidence VARCHAR, drill VARCHAR, unit VARCHAR);
CREATE OR REPLACE TABLE recommendations (rank INTEGER, id VARCHAR, title VARCHAR, action VARCHAR, impact VARCHAR, evidence_insight VARCHAR);
CREATE OR REPLACE TABLE what_works (cluster INTEGER, feature VARCHAR, effect DOUBLE, ci_lo DOUBLE, ci_hi DOUBLE, n INTEGER, direction VARCHAR);
CREATE OR REPLACE TABLE quality_summary (scope VARCHAR, specificity DOUBLE, context DOUBLE, constraints DOUBLE, length DOUBLE);
CREATE OR REPLACE TABLE analysis_meta (key VARCHAR, value VARCHAR);
"""


@dataclass
class AnalyzeReport:
    mode: str = "basic"
    backend: str = "none"
    cluster_method: str = "none"
    n_sessions: int = 0
    n_prompts: int = 0
    n_clusters: int = 0
    n_insights: int = 0
    seconds: float = 0.0
    reason: str = ""
    engine: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _substantive(text: str | None, text_len: int | None) -> bool:
    if text is not None:
        t = text.strip()
        return len(t) >= 8 and not t.startswith("/") and t.lower().rstrip(".!") not in ACK
    return (text_len or 0) >= 8


def _mean_cols(df: pl.DataFrame) -> tuple[float, float, float, float]:
    if not df.height:
        return 0.0, 0.0, 0.0, 0.0
    return tuple(float(df[c].mean()) for c in ("q_specificity", "q_context", "q_constraints", "q_length"))  # type: ignore[return-value]


METHODS = {
    "basic": {"friction": "regex cues + token-overlap rephrase", "works": "intent groups; applied-rate difference, Newcombe-Wilson CI"},
    "ml": {"friction": "regex cues + tf-idf rephrase", "works": "tf-idf + KMeans galaxy; Cliffs delta, bootstrap CI, BH-FDR"},
    "deep": {"friction": "regex cues + embedding rephrase + near-duplicates", "works": "semantic galaxy; Cliffs delta, bootstrap CI, BH-FDR"},
}
COMMON = {"footprint": "descriptive counts", "time": "rolling robust z (median/MAD)", "funnel": "cumulative stage counts",
          "recommend": "templated from ranked insights"}


def run(cfg: Config, con: duckdb.DuckDBPyConnection, mode: str | None = None) -> AnalyzeReport:
    t0 = time.perf_counter()
    rep = AnalyzeReport()
    requested = mode or cfg.analysis.get("mode", "auto")
    pr = capabilities.probe(cfg.models_dir, requested)
    tier, rep.reason = capabilities.resolve(requested, pr)
    dupes: dict | None = None
    tmp = secure_dir(cfg.data_dir / ".tmp")
    con.execute(DERIVED_DDL)
    b = mx.load_base(con)
    sess = mx.session_frame(b)
    human = sess.filter(~pl.col("is_subagent"))
    sess_h = human.select("session_id", "source", "project_id", "started", "date")
    rep.n_sessions = human.height

    # ---- user prompts (human sessions only), sorted by (session, idx)
    u = (b.turns.filter(pl.col("role") == "user").join(sess_h.select("session_id"), on="session_id", how="inner")
         .sort("session_id", "idx", "turn_id"))
    rows = u.select("text", "text_len").rows()
    sub = np.array([_substantive(t, n) for t, n in rows], dtype=bool)
    has_text = np.array([t is not None for t, _ in rows], dtype=bool)
    n = u.height
    rep.n_prompts = n
    texts = u["text"].to_list()
    corr = np.zeros(n, dtype=bool)
    frus = np.zeros(n, dtype=bool)
    for i, t in enumerate(texts):
        corr[i], frus[i] = friction.lexical_flags(t)

    spec = intent.load_intents()
    p_intent = np.array(["other"] * n, dtype=object)
    p_iscore = np.zeros(n)
    p_sub = np.full((n, 4), np.nan)
    reph = np.zeros(n, dtype=bool)
    cid = np.full(n, -1, dtype=int)
    xy = np.full((n, 2), np.nan)
    labels_by_cluster: dict[int, list[str]] = {}
    med: dict[int, int] = {}
    text_idx = np.nonzero(sub & has_text)[0]
    backend = "tfidf"
    E = np.zeros((0, 1), dtype=np.float32)
    if len(text_idx) >= 10 and tier == "basic":
        sub_texts = [texts[i] for i in text_idx]
        hits = intent.regex_hits(sub_texts, spec)
        lab_arr = np.array(spec.labels, dtype=object)
        p_intent[text_idx] = np.where(hits.max(1) > 0, lab_arr[hits.argmax(1)], "other")
        p_iscore[text_idx] = np.minimum(hits.max(1) / 2, 1.0)
        p_sub[text_idx] = np.array([quality.subscores(t) for t in sub_texts])
        codes = np.unique(u["session_id"].to_numpy()[text_idx], return_inverse=True)[1]
        reph[text_idx] = friction.rephrase_jaccard(codes, [friction.tokens(t) for t in sub_texts])
        li = {lab: i for i, lab in enumerate(spec.labels)}
        cid[text_idx] = [li.get(x, -1) for x in p_intent[text_idx]]  # galaxy = intent groups, no points
        labels_by_cluster = {li[x]: [x] for x in sorted(set(p_intent[text_idx]) - {"other"})}
        rep.cluster_method, backend = "intent", "keyword"
    elif len(text_idx) >= 10:
        emb, warns = embed.get_embedder("tfidf" if tier == "ml" else "auto", cfg.models_dir)
        rep.warnings += warns
        sub_texts = [texts[i] for i in text_idx]
        seed_texts, seed_labels = spec.seed_texts()
        try:
            emb.fit(sub_texts + seed_texts)
        except ValueError as e:
            rep.warnings.append(f"text features skipped: {e}")
        else:
            backend = emb.name
            if tier == "deep" and backend.startswith("tfidf"):
                tier, rep.reason = "ml", rep.reason + "; embedding model failed to load, using ml"
            salt = load_salt(cfg.salt_path)
            E = embed.embed_cached(con, emb, sub_texts, salt, tmp)
            S = embed.embed_cached(con, emb, seed_texts, salt, tmp)
            C = intent.centroids(S, seed_labels, spec.labels)
            min_score, margin = spec.thresholds_for(backend)
            labs, scores = intent.classify(E, C, intent.regex_hits(sub_texts, spec), spec.labels, min_score, margin)
            p_intent[text_idx] = labs
            p_iscore[text_idx] = scores
            p_sub[text_idx] = np.array([quality.subscores(t) for t in sub_texts])
            codes = np.unique(u["session_id"].to_numpy()[text_idx], return_inverse=True)[1]
            toks = [friction.tokens(t) for t in sub_texts]
            reph[text_idx] = friction.rephrase_flags(E, codes, toks, friction.rephrase_threshold(backend), 3, 0.5)
            if tier == "deep":
                dupes = embed.near_dupes(E, codes)
            lab, rep.cluster_method = topics.cluster(E)
            cid[text_idx] = lab
            xy[text_idx] = topics.project2d(E)
            labels_by_cluster = topics.ctfidf_labels(sub_texts, lab)
            med = {c: int(text_idx[j]) for c, j in topics.medoids(topics.reduce(E), lab).items()}
    rep.backend = backend
    rep.mode = tier

    pf = pl.DataFrame({
        "turn_id": u["turn_id"], "session_id": u["session_id"], "idx": u["idx"], "sub": sub,
        "intent": p_intent.tolist(), "intent_score": p_iscore,
        "quality": [quality.blend(tuple(r)) if not np.isnan(r[0]) else None for r in p_sub],
        "q_specificity": [None if np.isnan(v) else float(v) for v in p_sub[:, 0]], "q_context": [None if np.isnan(v) else float(v) for v in p_sub[:, 1]],
        "q_constraints": [None if np.isnan(v) else float(v) for v in p_sub[:, 2]], "q_length": [None if np.isnan(v) else float(v) for v in p_sub[:, 3]],
        "is_correction": corr, "is_frustration": frus, "is_rephrase": reph, "cluster_id": cid,
        "x": [None if np.isnan(v) else float(v) for v in xy[:, 0]], "y": [None if np.isnan(v) else float(v) for v in xy[:, 1]],
    }, schema_overrides={"quality": pl.Float64, "q_specificity": pl.Float64, "q_context": pl.Float64, "q_constraints": pl.Float64, "q_length": pl.Float64,
                         "x": pl.Float64, "y": pl.Float64, "cluster_id": pl.Int32, "turn_id": pl.Utf8, "session_id": pl.Utf8, "idx": pl.Int64})

    # ---- session metrics
    hs = b.turns.join(sess_h.select("session_id"), on="session_id", how="inner").sort("session_id", "idx", "turn_id")
    ta = hs.group_by("session_id", maintain_order=True).agg(
        pl.len().alias("n_turns"), (pl.col("role") == "user").sum().alias("n_user"), pl.col("role").last().alias("last_role"),
        (pl.col("status").last() == "ok").alias("last_ok"),
        ((pl.col("role") == "assistant") & (pl.col("status") == "ok")).any().alias("has_response"),
        (pl.col("is_interrupt") | pl.col("status").is_in(["interrupted", "cancelled"])).sum().alias("interrupts"))
    pa = pf.group_by("session_id").agg(
        pl.col("sub").sum().alias("n_user_sub"), pl.col("is_correction").sum().alias("corrections"),
        pl.col("is_frustration").sum().alias("frustrations"), pl.col("is_rephrase").sum().alias("loops"))
    first = pf.filter(pl.col("sub")).group_by("session_id", maintain_order=True).agg(
        pl.col("intent").first().alias("intent"), pl.col("quality").first().alias("first_quality"))
    work = pl.concat([b.tool_calls.select("session_id"), b.edits.select("session_id")]).unique().with_columns(pl.lit(True).alias("has_work"))
    applied = b.edits.filter(pl.col("state").is_in(mx.APPLIED_STATES)).select("session_id").unique().with_columns(pl.lit(True).alias("has_applied"))
    outc = b.outcomes.filter(pl.col("session_id").is_not_null()).select("session_id").unique().with_columns(pl.lit(True).alias("has_outcome"))
    ttr = mx.session_ttr(sess, b.edits)
    sm = (sess_h.select("session_id", "source").join(ta, on="session_id", how="left").join(pa, on="session_id", how="left")
          .join(first, on="session_id", how="left").join(work, on="session_id", how="left").join(applied, on="session_id", how="left")
          .join(outc, on="session_id", how="left").join(ttr, on="session_id", how="left"))
    sm = sm.with_columns(
        pl.col("n_turns").fill_null(0), pl.col("n_user").fill_null(0), pl.col("n_user_sub").fill_null(0),
        pl.col("corrections").fill_null(0), pl.col("frustrations").fill_null(0), pl.col("loops").fill_null(0), pl.col("interrupts").fill_null(0),
        pl.col("has_response").fill_null(False), pl.col("has_work").fill_null(False), pl.col("has_applied").fill_null(False),
        pl.col("has_outcome").fill_null(False), pl.col("last_ok").fill_null(False),
        pl.when(pl.col("n_user") > 0).then(pl.col("intent").fill_null("other")).otherwise(None).alias("intent"),
    )
    sm = sm.with_columns(friction.abandoned(sm).alias("abandoned"))
    sm = friction.friction_score(sm)
    sm = sm.with_columns(
        (pl.col("n_user") > 0).alias("has_intent"), (pl.col("n_user_sub") > 0).alias("has_prompt"),
        (~pl.col("abandoned") & (pl.col("n_turns") > 0)).alias("iterating"))
    sm = fn.cumulative(sm)
    sm = sm.with_columns((pl.col("reached_stage") - 2 * pl.col("friction").fill_null(0.0)).alias("outcome_score"))
    fn.counts(sm, "source", list(mx.SOURCES))  # asserts monotone

    # ---- clusters
    pfs = pf.join(sm.select("session_id", "source", "outcome_score", "has_applied"), on="session_id", how="left")
    cl_rows = []
    for c, terms in sorted(labels_by_cluster.items()):
        m = pfs.filter(pl.col("cluster_id") == c)
        top_intent = sorted(m["intent"].value_counts().iter_rows(), key=lambda r: (-r[1], r[0]))[0][0]
        succ = m.select("session_id", "has_applied").unique(subset="session_id")["has_applied"].mean()
        cl_rows.append({"cluster_id": c, "label": ", ".join(terms[:3]) or f"topic {c}", "size": m.height,
                        "exemplar": texts[med[c]] if c in med else None, "intent": top_intent, "success": float(succ or 0.0)})
    clusters = pl.DataFrame(cl_rows, schema={"cluster_id": pl.Int32, "label": pl.Utf8, "size": pl.Int32, "exemplar": pl.Utf8, "intent": pl.Utf8, "success": pl.Float64})
    rep.n_clusters = clusters.height

    # ---- quality summary + validation
    qp = pfs.filter(pl.col("q_specificity").is_not_null() & pl.col("outcome_score").is_not_null())
    qrows = []
    val: dict[str, Any] = {"spearman": None, "n": 0, "auc": None}
    if qp.height:
        qrows.append(("you", *_mean_cols(qp)))
        top, _ = whatworks.tercile_groups(qp["outcome_score"].to_numpy())
        qrows.append(("top", *_mean_cols(qp.filter(pl.Series(top)))))
        for src in mx.SOURCES:
            g = qp.filter(pl.col("source") == src)
            if g.height:
                qrows.append((f"src:{src}", *_mean_cols(g)))
        fq = sm.filter(pl.col("first_quality").is_not_null() & (pl.col("n_user") > 0))
        rho, nn = quality.validate(fq["first_quality"].to_numpy(), (fq["n_user"] - 1).to_numpy().astype(float), fq["intent"].to_numpy())
        val.update(spearman=rho, n=nn)
        nxt = pfs.sort("session_id", "idx").with_columns(
            pl.col("is_correction").shift(-1).over("session_id").alias("n1"), pl.col("is_correction").shift(-2).over("session_id").alias("n2"))
        nxt = nxt.filter(pl.col("sub") & pl.col("n1").is_not_null()).join(sess_h.select("session_id", "project_id"), on="session_id", how="left")
        if nxt.height and tier != "basic":
            X = nxt.select("q_specificity", "q_context", "q_constraints", "q_length").to_numpy()
            y = (~(nxt["n1"] | nxt["n2"].fill_null(False))).to_numpy().astype(int)
            val["auc"] = quality.grouped_auc(X, y, nxt.select(pl.coalesce("project_id", "session_id"))["project_id"].to_numpy())
    qsum = pl.DataFrame(qrows, schema=["scope", "specificity", "context", "constraints", "length"], orient="row") if qrows else None

    # ---- what works
    ww: list[dict] = []
    nc = pfs.filter(pl.col("cluster_id") >= 0).height
    if nc:
        mc = max(30, min(100, nc // 15))
        if tier == "basic":
            ww = whatworks.rate_diffs(pfs.filter(pl.col("sub")).sort("session_id", "idx").unique(subset="session_id", keep="first", maintain_order=True))
        else:
            ww = whatworks.analyze(pfs, min_cluster=mc, min_group=max(10, mc // 3))

    # ---- daily + anomaly z (per source, cost)
    daily = mx.daily_frame(sess, mx.prompt_frame(b, sess))
    z_parts = []
    for src in mx.SOURCES:
        g = daily.filter(pl.col("source") == src)
        if g.height:
            r = anomaly.detect(g["date"].to_list(), [float(v) for v in g["cost"].to_list()])
            z_parts.append(pl.DataFrame({"date": [x["date"] for x in r], "source": src, "anomaly_z": [x["z"] for x in r]},
                                        schema={"date": pl.Date, "source": pl.Utf8, "anomaly_z": pl.Float64}))
    if z_parts:
        daily = daily.join(pl.concat(z_parts), on=["date", "source"], how="left")
    else:
        daily = daily.with_columns(pl.lit(None, dtype=pl.Float64).alias("anomaly_z"))

    # ---- insights
    prompts = mx.prompt_frame(b, sess)
    sec, extras = export.core_sections(b, sess, prompts, sm)
    ins, recs = insights.generate({"sm": sm, "sess": sess, "sec": sec, "anoms": extras["anoms"], "validation": val, "what_works": ww,
                                   "labels": {c: ", ".join(t[:3]) for c, t in labels_by_cluster.items()}, "exposure": sec["exposure"], "dupes": dupes})
    rep.n_insights = len(ins)

    # ---- write
    mx.put(con, "prompt_features", pf.drop("session_id", "idx", "sub"), tmp)
    mx.put(con, "session_metrics", sm.select("session_id", "ttr_s", "friction", "abandoned", "loops", "reached_stage", "source", "intent", "n_user",
                                              "n_turns", "corrections", "frustrations", "interrupts", "has_applied", "has_outcome",
                                              "first_quality", "outcome_score").with_columns(pl.col("loops").cast(pl.Int32)), tmp)
    mx.put(con, "clusters", clusters, tmp)
    mx.put(con, "daily", daily, tmp)
    mx.put(con, "insights", pl.DataFrame([{**{k: i[k] for k in ("rank", "id", "chapter", "claim", "metric", "value", "delta", "unit")},
                                           "evidence": json.dumps(i["evidence"]), "drill": json.dumps(i["drill"])} for i in ins]), tmp)
    mx.put(con, "recommendations", pl.DataFrame([{"rank": k, **r} for k, r in enumerate(recs, 1)]), tmp)
    mx.put(con, "what_works", pl.DataFrame([{"cluster": r["cluster"], "feature": r["feature"], "effect": r["effect"], "ci_lo": r["ci"][0],
                                             "ci_hi": r["ci"][1], "n": r["n"], "direction": r["direction"]} for r in ww]), tmp)
    if qsum is not None:
        mx.put(con, "quality_summary", qsum, tmp)
    rep.engine = {"mode": tier, "requested": requested if requested in capabilities.MODES else "auto", "available": pr["available"], "libs": pr["libs"],
                  "accel": pr["accel"], "reason": rep.reason, "upgrade": pr["upgrade"], "methods": COMMON | METHODS[tier]}
    meta = {"engine": json.dumps(rep.engine), "mode": rep.mode, "backend": backend, "cluster_method": rep.cluster_method, "intents_version": spec.version,
            "spearman": "" if val["spearman"] is None else str(val["spearman"]), "spearman_n": str(val["n"]),
            "auc": "" if val["auc"] is None else str(val["auc"]), "analyzed_at": datetime.now(timezone.utc).isoformat()}
    mx.put(con, "analysis_meta", pl.DataFrame({"key": list(meta), "value": list(meta.values())}), tmp)
    try:
        tmp.rmdir()
    except OSError:
        pass
    rep.seconds = round(time.perf_counter() - t0, 2)
    return rep
