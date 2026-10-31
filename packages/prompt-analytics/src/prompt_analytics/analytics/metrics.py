"""Usage, cadence, tokens/cost, TTR, tool switching, exposure rollups, plus DuckDB<->Polars IO.

pyarrow is not a dependency, so rows go DB -> python -> Polars via ``fetch`` and
Polars -> DB through a private parquet file via ``put``. Timestamps are read with
``AT TIME ZONE 'UTC'`` so every datetime here is naive UTC.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import duckdb
import polars as pl

SOURCES = ("claude_code", "copilot", "cursor", "opencode", "antigravity")
APPLIED_STATES = ("applied", "accepted")
TS = pl.Datetime("us")


def fetch(con: duckdb.DuckDBPyConnection, sql: str, schema: dict[str, Any] | None = None) -> pl.DataFrame:
    rel = con.sql(sql)
    rows = rel.fetchall()
    if schema is not None:
        return pl.DataFrame(rows, schema=schema, orient="row")
    return pl.DataFrame(rows, schema=rel.columns, orient="row", infer_schema_length=None)


def put(con: duckdb.DuckDBPyConnection, table: str, df: pl.DataFrame, tmp_dir: Path | None = None) -> None:
    """Append ``df`` to an existing table by column name (via a 0600 parquet file)."""
    if df.height == 0:
        return
    base = str(tmp_dir) if tmp_dir else None
    if base:
        os.makedirs(base, mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=base) as d:
        p = Path(d) / "x.parquet"
        df.write_parquet(p)
        os.chmod(p, 0o600)
        con.execute(f"INSERT INTO {table} BY NAME SELECT * FROM read_parquet('{p}')")


def utc(col: str) -> str:
    return f"{col} AT TIME ZONE 'UTC' AS {col}"


@dataclass
class Base:
    sessions: pl.DataFrame
    turns: pl.DataFrame
    tool_calls: pl.DataFrame
    edits: pl.DataFrame
    outcomes: pl.DataFrame
    exposures: pl.DataFrame
    reviews: pl.DataFrame
    titles: pl.DataFrame
    source_health: pl.DataFrame


def load_base(con: duckdb.DuckDBPyConnection) -> Base:
    S, I, F, B = pl.Utf8, pl.Int64, pl.Float64, pl.Boolean
    return Base(
        sessions=fetch(con, f"""SELECT session_id, source, project_id, {utc('started_at')}, {utc('ended_at')},
            coalesce(is_subagent, false) AS is_subagent, model, tokens_in, tokens_out, cost_usd,
            coalesce(cost_is_estimate, true) AS cost_is_estimate FROM sessions ORDER BY session_id""",
            {"session_id": S, "source": S, "project_id": S, "started_at": TS, "ended_at": TS, "is_subagent": B,
             "model": S, "tokens_in": I, "tokens_out": I, "cost_usd": F, "cost_is_estimate": B}),
        turns=fetch(con, f"""SELECT turn_id, session_id, idx, role, {utc('ts')}, text, text_len, status,
            coalesce(is_interrupt, false) AS is_interrupt, cost_usd, tokens_in, tokens_out
            FROM turns ORDER BY session_id, idx, turn_id""",
            {"turn_id": S, "session_id": S, "idx": I, "role": S, "ts": TS, "text": S, "text_len": I, "status": S,
             "is_interrupt": B, "cost_usd": F, "tokens_in": I, "tokens_out": I}),
        tool_calls=fetch(con, "SELECT call_id, session_id, name, coalesce(is_edit,false) AS is_edit FROM tool_calls",
                         {"call_id": S, "session_id": S, "name": S, "is_edit": B}),
        edits=fetch(con, f"SELECT edit_id, session_id, state, {utc('ts')} FROM code_edits ORDER BY edit_id",
                    {"edit_id": S, "session_id": S, "state": S, "ts": TS}),
        outcomes=fetch(con, f"SELECT outcome_id, project_id, session_id, {utc('ts')}, kind FROM outcomes ORDER BY outcome_id",
                       {"outcome_id": S, "project_id": S, "session_id": S, "ts": TS, "kind": S}),
        exposures=fetch(con, f"SELECT session_id, turn_id, {utc('ts')}, kind, category, n, preview FROM exposures ORDER BY turn_id, kind",
                        {"session_id": S, "turn_id": S, "ts": TS, "kind": S, "category": S, "n": I, "preview": S}),
        reviews=fetch(con, "SELECT turn_id, status FROM exposure_reviews ORDER BY turn_id", {"turn_id": S, "status": S}),
        titles=fetch(con, "SELECT session_id, title FROM sessions ORDER BY session_id", {"session_id": S, "title": S}),
        source_health=fetch(con, "SELECT source, status, sessions_found, warnings FROM source_health ORDER BY source",
                            {"source": S, "status": S, "sessions_found": I, "warnings": S}),
    )


def session_frame(b: Base) -> pl.DataFrame:
    """One row per session: resolved start/end, tokens, cost, UTC date."""
    t = b.turns.group_by("session_id").agg(
        pl.col("tokens_in").sum().alias("t_in"), pl.col("tokens_out").sum().alias("t_out"),
        pl.col("cost_usd").sum().alias("t_cost"), pl.col("ts").min().alias("t_first"), pl.col("ts").max().alias("t_last"),
    )
    s = b.sessions.join(t, on="session_id", how="left").with_columns(
        pl.coalesce("started_at", "t_first").alias("started"),
        pl.coalesce("ended_at", "t_last", "started_at", "t_first").alias("ended"),
        (pl.coalesce("tokens_in", "t_in", pl.lit(0)) + pl.coalesce("tokens_out", "t_out", pl.lit(0))).alias("tokens"),
        pl.coalesce("cost_usd", "t_cost", pl.lit(0.0)).alias("cost"),
    )
    return s.with_columns(pl.col("started").dt.date().alias("date")).select(
        "session_id", "source", "project_id", "is_subagent", "model", "started", "ended", "date", "tokens", "cost",
        "cost_is_estimate",
    ).sort("session_id")


def prompt_frame(b: Base, sess: pl.DataFrame) -> pl.DataFrame:
    """User turns of non-subagent sessions with source and resolved date/hour."""
    human = sess.filter(~pl.col("is_subagent")).select("session_id", "source", "date")
    u = b.turns.filter(pl.col("role") == "user").join(human, on="session_id", how="inner")
    return u.with_columns(pl.coalesce(pl.col("ts").dt.date(), "date").alias("pdate"))


def streaks(dates: list[date]) -> tuple[int, int, int]:
    """(active_days, longest, current). Current is the streak ending at the last active day
    (data-relative, so results are deterministic)."""
    ds = sorted(set(dates))
    longest = run = 0
    prev: date | None = None
    for d in ds:
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        longest = max(longest, run)
        prev = d
    return len(ds), longest, run if ds else 0


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def by_source(sess: pl.DataFrame, prompts: pl.DataFrame) -> list[dict[str, Any]]:
    out = []
    h = sess.filter(~pl.col("is_subagent"))
    for src in SOURCES:
        s = sess.filter(pl.col("source") == src)
        out.append({
            "source": src, "sessions": h.filter(pl.col("source") == src).height,
            "prompts": prompts.filter(pl.col("source") == src).height, "tokens": int(s["tokens"].sum() or 0),
            "cost_usd": float(s["cost"].sum() or 0.0),
            "cost_is_estimate": bool(s["cost_is_estimate"].any()) if s.height else False,
        })
    return out


def calendar(sess: pl.DataFrame, prompts: pl.DataFrame) -> list[dict[str, Any]]:
    a = sess.filter(~pl.col("is_subagent") & pl.col("date").is_not_null()).group_by("date").agg(pl.len().alias("sessions"))
    c = sess.filter(pl.col("date").is_not_null()).group_by("date").agg(pl.col("cost").sum().alias("cost_usd"))
    p = prompts.filter(pl.col("pdate").is_not_null()).group_by("pdate").agg(pl.len().alias("prompts")).rename({"pdate": "date"})
    df = a.join(c, on="date", how="full", coalesce=True).join(p, on="date", how="full", coalesce=True).sort("date")
    df = df.with_columns(pl.col("sessions").fill_null(0), pl.col("prompts").fill_null(0), pl.col("cost_usd").fill_null(0.0))
    return [{"date": r["date"].isoformat(), "sessions": r["sessions"], "prompts": r["prompts"], "cost_usd": r["cost_usd"]}
            for r in df.iter_rows(named=True)]


def hour_week(prompts: pl.DataFrame) -> list[dict[str, int]]:
    p = prompts.filter(pl.col("ts").is_not_null())
    g = p.group_by(pl.col("ts").dt.weekday().alias("dow"), pl.col("ts").dt.hour().alias("hour")).agg(pl.len().alias("prompts")).sort("dow", "hour")
    return [{"dow": r["dow"] - 1, "hour": r["hour"], "prompts": r["prompts"]} for r in g.iter_rows(named=True)]


def cost_river(sess: pl.DataFrame) -> list[dict[str, Any]]:
    weeks: dict[date, dict[str, float]] = {}
    for d, src, cost in sess.filter(pl.col("date").is_not_null()).select("date", "source", "cost").iter_rows():
        w = weeks.setdefault(week_start(d), {})
        w[src] = w.get(src, 0.0) + float(cost)
    return [{"date": w.isoformat(), "values": {k: v for k, v in sorted(vals.items())}} for w, vals in sorted(weeks.items())]


def daily_frame(sess: pl.DataFrame, prompts: pl.DataFrame) -> pl.DataFrame:
    """Per (date, source): sessions (non-subagent), prompts, tokens, cost (all sessions, by start date)."""
    s = sess.filter(pl.col("date").is_not_null()).group_by("date", "source").agg(
        (~pl.col("is_subagent")).sum().alias("sessions"), pl.col("tokens").sum().alias("tokens"), pl.col("cost").sum().alias("cost"))
    p = prompts.filter(pl.col("pdate").is_not_null()).group_by(pl.col("pdate").alias("date"), "source").agg(pl.len().alias("prompts"))
    out = s.join(p, on=["date", "source"], how="full", coalesce=True).with_columns(
        pl.col("sessions").fill_null(0).cast(pl.Int64), pl.col("prompts").fill_null(0).cast(pl.Int64),
        pl.col("tokens").fill_null(0), pl.col("cost").fill_null(0.0))
    return out.select("date", "source", "sessions", "prompts", "tokens", "cost").sort("date", "source")


def tool_switch(sess: pl.DataFrame) -> list[dict[str, Any]]:
    """Consecutive non-subagent sessions in one project on different sources less than 24h apart."""
    h = sess.filter(~pl.col("is_subagent") & pl.col("project_id").is_not_null() & pl.col("started").is_not_null())
    counts: dict[tuple[str, str], int] = {}
    prev: dict[str, Any] = {}
    for r in h.sort("project_id", "started", "session_id").iter_rows(named=True):
        p = prev.get(r["project_id"])
        if p is not None and p["source"] != r["source"] and (r["started"] - (p["ended"] or p["started"])) < timedelta(hours=24):
            counts[(p["source"], r["source"])] = counts.get((p["source"], r["source"]), 0) + 1
        prev[r["project_id"]] = r
    return [{"from": a, "to": b, "count": n} for (a, b), n in sorted(counts.items())]


def session_ttr(sess: pl.DataFrame, edits: pl.DataFrame) -> pl.DataFrame:
    """ttr_s for sessions with an applied/accepted edit: start -> last such edit, else -> session end."""
    last = edits.filter(pl.col("state").is_in(APPLIED_STATES)).group_by("session_id").agg(pl.col("ts").max().alias("last_edit"))
    j = sess.join(last, on="session_id", how="inner")
    end = pl.coalesce("last_edit", "ended")
    return j.select("session_id", ((end - pl.col("started")).dt.total_seconds().clip(lower_bound=0)).alias("ttr_s"))


def ttr_table(sm: pl.DataFrame, min_n: int = 3) -> list[dict[str, Any]]:
    g = sm.filter(pl.col("ttr_s").is_not_null() & pl.col("intent").is_not_null()).group_by("source", "intent").agg(
        (pl.col("ttr_s").median() / 60.0).alias("median_min"), pl.len().alias("n")).filter(pl.col("n") >= min_n).sort("source", "intent")
    return g.to_dicts()


def exposure_summary(b: Base, sess: pl.DataFrame, advice: dict[str, str]) -> dict[str, Any]:
    """Counts-only rollup of the exposures table over non-subagent sessions (contract: ``exposure``)."""
    human = sess.filter(~pl.col("is_subagent")).select("session_id", "source", "date")
    fp = b.reviews.filter(pl.col("status") == "false_positive").select("turn_id")
    ex = (b.exposures.join(human, on="session_id", how="inner").join(fp, on="turn_id", how="anti")
          .with_columns(pl.coalesce(pl.col("ts").dt.date(), "date").alias("d")))
    n_h = human.height
    out: dict[str, Any] = {"sessions": ex["session_id"].n_unique() if ex.height else 0, "share": 0.0,
                           "by_category": [], "by_kind": [], "weekly": []}
    if not ex.height:
        return out
    out["share"] = out["sessions"] / n_h if n_h else 0.0
    for cat in ("secret", "pii", "phi"):
        c = ex.filter(pl.col("category") == cat)
        if c.height:
            out["by_category"].append({"category": cat, "sessions": c["session_id"].n_unique(),
                                       "prompts": c["turn_id"].n_unique(), "advice": advice.get(cat, "")})
    for (kind, cat), g in sorted(ex.group_by("kind", "category"), key=lambda kv: kv[0]):
        bs = g.group_by("source").agg(pl.col("session_id").n_unique().alias("n")).sort("source")
        out["by_kind"].append({"kind": kind, "category": cat, "sessions": g["session_id"].n_unique(),
                               "prompts": g["turn_id"].n_unique(), "by_source": {r["source"]: r["n"] for r in bs.iter_rows(named=True)}})
    weeks: dict[date, dict[str, set[str]]] = {}
    for sid, cat, d in ex.select("session_id", "category", "d").iter_rows():
        if d is not None:
            weeks.setdefault(week_start(d), {"secret": set(), "pii": set(), "phi": set()})[cat].add(sid)
    out["weekly"] = [{"date": w.isoformat(), **{k: len(v[k]) for k in ("secret", "pii", "phi")}} for w, v in sorted(weeks.items())]
    return out


_SEV = {"phi": 3, "secret": 2, "pii": 1}


def exposure_items(b: Base, sess: pl.DataFrame) -> list[dict[str, Any]]:
    """One row per flagged user turn (human sessions), newest first. Category = highest severity present.
    false_positive turns are kept (so they can be reopened) but never counted in summaries."""
    human = sess.filter(~pl.col("is_subagent")).select("session_id", "source", "date")
    ex = b.exposures.join(human, on="session_id", how="inner")
    st = {r["turn_id"]: r["status"] for r in b.reviews.iter_rows(named=True)}
    titles = dict(b.titles.iter_rows())
    items = []
    for tid, g in ex.group_by("turn_id"):
        tid = tid[0]
        rows = g.sort("kind").to_dicts()
        cat = max((r["category"] for r in rows), key=lambda c: _SEV.get(c, 0))
        ts = rows[0]["ts"]
        prev = next((r["preview"] for r in rows if r["preview"]), None)
        items.append({"turn_id": tid, "source": rows[0]["source"], "ts": ts, "date": ts.date() if ts else rows[0]["date"], "title": titles.get(rows[0]["session_id"]),
                      "category": cat, "kinds": [r["kind"] for r in rows], "preview": prev, "status": st.get(tid) if st.get(tid) in ("reviewed", "false_positive") else "open"})
    return sorted(items, key=lambda i: (i["ts"] is not None, i["ts"] or datetime.min, i["turn_id"]), reverse=True)
