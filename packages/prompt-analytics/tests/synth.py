"""Deterministic synthetic dataset with planted ground truth, plus a sample-dashboard CLI.

Planted truths (asserted by the tests):
  * cursor is much faster than the other tools on ``refactor`` (TTR ~10 vs ~32 min)
  * cost spike on 2026-06-17 (claude_code)
  * a 14-day streak 2026-04-06..2026-04-19
  * session ``claude_code:loop01`` is a 5-step rephrase loop
  * 12 claude_code -> cursor tool switches in the same project within 24h
  * vague prompts correlate with more corrections / rephrases and fewer applied edits
  * antigravity sessions carry no turns; a few subagent sessions are excluded from everything
  * exposures (first one marked false_positive, second reviewed): email/ssn (pii), aws/github (secret), one PHI session; one is in a subagent session

Profile "demo" (public mock for the GitHub Pages demo, never real data): all five sources get full turns, edits, cost, friction and
exposures with distinct personalities, tool switches between every pair, mock project names, every source health "ok".

Usage: ``uv run python tests/synth.py [--profile demo] --out PATH``
"""

from __future__ import annotations

import argparse
import functools
import json
import random
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import duckdb
import polars as pl

from prompt_analytics import analyze, export
from prompt_analytics.analytics.metrics import put
from prompt_analytics.config import Config
from prompt_analytics.schema import DDL
from prompt_analytics.sensitive import CATEGORY

UTC = timezone.utc
START = datetime(2026, 3, 2, tzinfo=UTC)  # a Monday
N_DAYS = 207
SPIKE_DAY = "2026-06-17"
STREAK = (datetime(2026, 4, 6, tzinfo=UTC), 14)
SRC_W = {"claude_code": 40, "cursor": 20, "copilot": 18, "opencode": 12, "antigravity": 10}
DEMO_W = {"claude_code": 30, "cursor": 22, "copilot": 20, "opencode": 15, "antigravity": 13}
DEMO_PROJECTS = [("p_atlas", "atlas-api"), ("p_orbit", "orbit-web"), ("p_ledger", "ledger-etl"), ("p_nimbus", "nimbus-cli"), ("p_helio", "helio-docs"), ("p_quill", "quill-mobile")]
# per-tool personality (demo): session length x, cost x, extra user turns. claude_code long+costly, copilot short chats, opencode cheap, antigravity planning-heavy
DEMO_DUR = {"claude_code": 2.2, "cursor": 0.8, "copilot": 0.5, "opencode": 1.0, "antigravity": 1.5}
DEMO_COST = {"claude_code": 1.6, "cursor": 1.0, "copilot": 0.3, "opencode": 0.12, "antigravity": 0.9}
INTENT_W = {"bugfix": 25, "feature": 22, "refactor": 14, "explain": 12, "test": 8, "docs": 6, "devops": 6, "data": 7}
PROJECTS = [("p_webapp", "webapp"), ("p_api", "api-server"), ("p_ml", "ml-pipeline"), ("p_docs", "docs-site"), ("p_infra", "infra"), ("p_mobile", "mobile-app")]
MODEL = {"claude_code": "claude-sonnet-5", "cursor": "claude-sonnet-5", "copilot": "gpt-5", "opencode": "claude-sonnet-5", "antigravity": "gemini-3"}
FILES = ["src/auth/login.py", "src/api/orders.py", "lib/cache.ts", "app/models/user.rb", "pkg/server/handler.go", "src/utils/parse.py", "web/components/Table.tsx", "services/billing.py"]
SYMS = ["load_user", "OrderService", "fetchOrders", "parseConfig", "CacheStore", "handle_request", "renderTable", "charge_card"]
ERRS = ["KeyError", "TypeError", "NullPointerException", "TimeoutError", "ValueError", "ECONNRESET 502"]
T = {
    "bugfix": ("Fix the {err} thrown by `{sym}` in {file} at line {line}. It should return the cached value instead of crashing. Don't change the public API; the test must pass.",
               "Fix the bug in {file}: {err} when I call {sym}()", "this is broken, can you fix the bug"),
    "feature": ("Add a new feature in {file}: implement `{sym}` so users can export their data as CSV. It must handle empty input and should include a test.",
                "implement a new endpoint in {file} that returns the list of orders", "add a feature for exporting stuff"),
    "refactor": ("Refactor `{sym}` in {file} to remove duplication. Extract the shared logic into a helper without changing behaviour; keep the tests passing.",
                 "refactor {file} and clean up {sym}", "clean this up and simplify it"),
    "explain": ("Explain how `{sym}` in {file} works and why it retries on {err}.", "explain what {sym} does in {file}", "how does this code work"),
    "test": ("Write unit tests for `{sym}` in {file} covering the empty input and {err} cases. Use pytest fixtures and assert on the return value.",
             "add tests for {sym} in {file}", "add some tests"),
    "docs": ("Update the README in docs/{sym}.md with install steps for `{sym}`; keep it under 40 lines and don't touch the changelog.",
             "write documentation for {sym}", "update the docs"),
    "devops": ("The deploy job fails in .github/workflows/ci.yml with {err}. Fix the pipeline and keep the docker build cached; it should pass on main.",
               "fix the github actions workflow, the deploy pipeline fails", "set up the ci pipeline"),
    "data": ("Write a sql query in {file} that aggregates revenue by month from the orders table; it should return 12 rows and must not scan the full table.",
             "build a pandas pipeline in {file} to clean this csv", "analyze this dataset"),
}
CORRECTIONS = ["no, that's wrong. the {err} still happens", "actually don't touch {file}, undo that change", "still not working, it fails again",
               "wrong file, I said {file}", "ugh, still broken!! the {err} is back"]
REPHRASE_SUFFIX = [" please try again", " still failing, try again", " one more time please"]
P_CORR = {"good": 0.10, "ok": 0.30, "vague": 0.60}
P_REPH = {"good": 0.03, "ok": 0.12, "vague": 0.35}
P_APPLIED = {"good": 0.85, "ok": 0.70, "vague": 0.45}
PRICE = {"claude_code": 1.0, "cursor": 0.8, "copilot": 0.6, "opencode": 1.0, "antigravity": 0.7}


class Gen:
    def __init__(self, seed: int, demo: bool = False):
        self.demo = demo
        self.r = random.Random(seed)
        self.rows: dict[str, list[dict]] = {k: [] for k in ("sessions", "turns", "tool_calls", "code_edits", "outcomes", "exposures")}
        self.k = 0

    def fill(self, t: str) -> str:
        r = self.r
        return t.format(err=r.choice(ERRS), sym=r.choice(SYMS), file=r.choice(FILES), line=r.randint(10, 400))

    def session(self, source: str, intent: str, start: datetime, project: tuple[str, str], q: str, *, sid: str | None = None,
                rephrases: int | None = None, cost_mult: float = 1.0, exposure: tuple[str, ...] = (), force_applied: bool | None = None,
                subagent_of: str | None = None, abandon: bool = False) -> tuple[str, datetime]:
        r = self.r
        self.k += 1
        sid = sid or f"{source}:{self.k:05d}"
        if intent == "refactor":
            dur = max(3.0, r.gauss(10, 2.5)) if source == "cursor" else max(8.0, r.gauss(32, 6))
        else:
            dur = max(2.0, r.lognormvariate(3.0, 0.4))
        if self.demo and not (intent == "refactor" and source == "cursor"):
            dur *= DEMO_DUR[source]
        if self.demo:
            cost_mult *= DEMO_COST[source]
        end = start + timedelta(minutes=dur)
        applied = force_applied if force_applied is not None else (r.random() < (0.95 if (source == "cursor" and intent == "refactor") else P_APPLIED[q]))
        applied = applied and not abandon
        base = {"session_id": sid, "source": source, "source_key": f"{sid}.json", "project_id": project[0], "title": f"{intent} in {project[1]}",
                "started_at": start, "ended_at": end, "is_subagent": subagent_of is not None, "parent_session_id": subagent_of,
                "mode": "agent", "model": MODEL[source], "cost_is_estimate": source != "opencode", "tokens_estimated": False}
        if source == "antigravity" and not self.demo:
            tin, tout = r.randint(20_000, 90_000), r.randint(2_000, 9_000)
            cost = (tin * 3 + tout * 15) / 1e6 * PRICE[source] * cost_mult
            self.rows["sessions"].append({**base, "n_user_turns": 0, "n_assistant_turns": 0, "tokens_in": tin, "tokens_out": tout,
                                          "tokens_cache_read": 0, "tokens_cache_write": 0, "cost_usd": cost})
            self.rows["code_edits"].append({"edit_id": f"{sid}:e0", "session_id": sid, "turn_id": None, "file": r.choice(FILES), "lines_added": 12,
                                            "lines_removed": 3, "state": "unknown", "ts": end})
            return sid, end
        first = self.fill(T[intent][{"good": 0, "ok": 1, "vague": 2}[q]])
        if exposure:
            first += " " + " ".join(f"[REDACTED:{k}]" for k in exposure)
        users = [first]
        n_corr = 0 if abandon else sum(r.random() < P_CORR[q] for _ in range(3))
        n_reph = rephrases if rephrases is not None else (0 if abandon else sum(r.random() < P_REPH[q] for _ in range(2)))
        for _ in range(n_corr):
            users.append(self.fill(r.choice(CORRECTIONS)))
        for i in range(n_reph):
            users.append(first.split(" [REDACTED")[0] + r.choice(REPHRASE_SUFFIX) if rephrases is None else f"{first} (attempt {i + 2})")
        if self.demo and source in ("claude_code", "antigravity"):  # long agentic / planning-heavy: extra follow-ups
            users += [self.fill("continue with {sym} in {file}") for _ in range(r.randint(1, 3 if source == "claude_code" else 2))]
        if not abandon and r.random() < 0.3:
            users.append("thanks")
        tin_s = tout_s = 0
        cost_s = 0.0
        turns = []
        idx = 0
        for i, text in enumerate(users):
            ts = start + timedelta(minutes=dur * (i + 0.3) / (len(users) + 0.5))
            turns.append({"turn_id": f"{sid}:t{idx}", "session_id": sid, "idx": idx, "role": "user", "ts": ts, "text": text, "text_len": len(text),
                          "model": None, "tokens_in": None, "tokens_out": None, "tokens_cache_read": None, "tokens_cache_write": None,
                          "cost_usd": None, "latency_ms": None, "status": "ok", "is_interrupt": False})
            idx += 1
            if abandon and i == 0 and r.random() < 0.5:
                break  # last turn is the user's
            tin, tout = r.randint(1500, 9000), r.randint(300, 2500)
            cost = (tin * 3 + tout * 15) / 1e6 * PRICE[source] * cost_mult
            tin_s, tout_s, cost_s = tin_s + tin, tout_s + tout, cost_s + cost
            interrupted = (not abandon) and r.random() < 0.04
            turns.append({"turn_id": f"{sid}:t{idx}", "session_id": sid, "idx": idx, "role": "assistant", "ts": ts + timedelta(seconds=40), "text": "ok",
                          "text_len": 2, "model": MODEL[source], "tokens_in": int(tin * cost_mult), "tokens_out": tout, "tokens_cache_read": 0,
                          "tokens_cache_write": 0, "cost_usd": cost, "latency_ms": r.randint(2_000, 40_000),
                          "status": "interrupted" if interrupted else "ok", "is_interrupt": interrupted})
            idx += 1
        self.rows["turns"] += turns
        n_user = sum(t["role"] == "user" for t in turns)
        self.rows["sessions"].append({**base, "n_user_turns": n_user, "n_assistant_turns": len(turns) - n_user, "tokens_in": int(tin_s * cost_mult),
                                      "tokens_out": tout_s, "tokens_cache_read": 0, "tokens_cache_write": 0, "cost_usd": cost_s})
        state_ok = "applied" if source in ("claude_code", "opencode") else "accepted"
        if applied:
            for j in range(r.randint(1, 3)):
                ts = end - timedelta(minutes=0.2 * (2 - j))
                self.rows["tool_calls"].append({"call_id": f"{sid}:c{j}", "session_id": sid, "turn_id": turns[1]["turn_id"], "name": "Edit",
                                                "ts": ts, "duration_ms": 120, "status": "ok", "is_edit": True})
                self.rows["code_edits"].append({"edit_id": f"{sid}:e{j}", "session_id": sid, "turn_id": turns[1]["turn_id"], "file": r.choice(FILES),
                                                "lines_added": r.randint(2, 60), "lines_removed": r.randint(0, 30), "state": state_ok, "ts": ts})
            if r.random() < 0.6:
                self.rows["outcomes"].append({"outcome_id": f"o{sid}", "project_id": project[0], "session_id": sid, "ts": end + timedelta(minutes=30),
                                              "kind": "commit", "files_changed": r.randint(1, 6), "insertions": r.randint(5, 200), "deletions": r.randint(0, 80)})
        elif not abandon and r.random() < 0.3:
            self.rows["code_edits"].append({"edit_id": f"{sid}:e0", "session_id": sid, "turn_id": turns[1]["turn_id"], "file": r.choice(FILES),
                                            "lines_added": 5, "lines_removed": 1, "state": "rejected", "ts": end})
        if self.demo and source == "antigravity" and not abandon:
            self.rows["tool_calls"].append({"call_id": f"{sid}:p0", "session_id": sid, "turn_id": turns[1]["turn_id"], "name": "Plan", "ts": start,
                                            "duration_ms": 900, "status": "ok", "is_edit": False})
        if not abandon:
            self.rows["tool_calls"].append({"call_id": f"{sid}:r0", "session_id": sid, "turn_id": turns[1]["turn_id"], "name": "Read", "ts": start,
                                            "duration_ms": 30, "status": "ok", "is_edit": False})
        for kind in exposure:
            self.rows["exposures"].append({"session_id": sid, "turn_id": turns[0]["turn_id"], "ts": turns[0]["ts"], "kind": kind,
                                           "category": CATEGORY[kind], "n": 1,
                                           "preview": first.split(" [REDACTED")[0][:100] + " " + " ".join(f"\u27e6{k}\u27e7" for k in exposure)})
        return sid, end


def _pick(r: random.Random, w: dict[str, int]) -> str:
    return r.choices(list(w), weights=list(w.values()))[0]


def make_db(con: duckdb.DuckDBPyConnection, seed: int = 7, n_sessions: int = 400, tmp_dir: Path | None = None, profile: str = "default") -> dict:
    demo = profile == "demo"
    PROJECTS = DEMO_PROJECTS if demo else globals()["PROJECTS"]
    SRC_W = DEMO_W if demo else globals()["SRC_W"]
    ALL = ["claude_code", "cursor", "copilot", "opencode", "antigravity"]
    OPEN = ALL if demo else ["claude_code", "cursor", "copilot"]
    g = Gen(seed, demo)
    r = g.r
    con.execute(DDL)
    put(con, "projects", pl.DataFrame({"project_id": [p for p, _ in PROJECTS], "name": [n for _, n in PROJECTS], "root": [f"~/code/{n}" for _, n in PROJECTS],
                                       "repo": [True] * len(PROJECTS)}), tmp_dir)
    days = [START + timedelta(days=d) for d in range(N_DAYS)]
    wts = [1.0 if d.weekday() < 5 else 0.25 for d in days]

    def when(day: datetime) -> datetime:
        return day + timedelta(hours=min(22, max(7, int(r.gauss(14, 3.5)))), minutes=r.randint(0, 59))

    def intent_for(source: str) -> str:
        w = dict(INTENT_W)
        if source == "cursor":
            w["refactor"] *= 3
        return _pick(r, w)

    def quality() -> str:
        return r.choices(["good", "ok", "vague"], weights=[3, 4, 3])[0]

    made = 0
    # planted: loop session, streak, spike, tool switches, exposures
    g.session("claude_code", "bugfix", START + timedelta(days=40, hours=10), PROJECTS[0], "vague", sid="claude_code:loop01", rephrases=5, force_applied=False)
    made += 1
    for d in range(STREAK[1]):
        src = r.choice(ALL if demo else ["claude_code", "cursor", "copilot", "opencode"])
        g.session(src, intent_for(src), STREAK[0] + timedelta(days=d, hours=10, minutes=r.randint(0, 50)), r.choice(PROJECTS), quality())
        made += 1
    spike = datetime.fromisoformat(SPIKE_DAY).replace(tzinfo=UTC)
    for i in range(6):
        g.session("claude_code", "feature", spike + timedelta(hours=9 + i), PROJECTS[1], "good", cost_mult=12.0 if demo else 40.0, force_applied=True)
        made += 1
    pairs = [("claude_code", "cursor")] * 12
    if demo:  # every ordered pair, 3x each
        pairs = [(a, b) for a in ALL for b in ALL if a != b for _ in range(3)]
    for i, (a, b) in enumerate(pairs):
        day = days[(20 + i * 12) % (N_DAYS - 2)] if not demo else days[(7 + i * 3) % (N_DAYS - 2)]
        proj = PROJECTS[i % len(PROJECTS)]
        _, end = g.session(a, intent_for(a), day + timedelta(hours=9), proj, quality())
        g.session(b, intent_for(b), end + timedelta(hours=3), proj, quality())
        made += 2
    # exposures: (kinds) planted on ordinary sessions below
    plan = [("email",)] * 5 + [("email", "ssn"), ("aws",), ("github",), ("aws", "email"), ("ssn",), ("email", "phi_context")] + [("mrn",)]
    ex_sids = []
    for ex in plan:
        src = r.choice(OPEN)
        ex_sids.append(g.session(src, "bugfix", when(r.choices(days, wts)[0]), r.choice(PROJECTS), "ok", exposure=ex)[0])
        made += 1
    reviews = [{"turn_id": f"{ex_sids[0]}:t0", "status": "false_positive", "reviewed_at": START + timedelta(days=220)},
               {"turn_id": f"{ex_sids[1]}:t0", "status": "reviewed", "reviewed_at": START + timedelta(days=220)}]
    # a subagent session with an exposure: must be excluded everywhere
    parent, pend = g.session("claude_code", "feature", START + timedelta(days=100, hours=11), PROJECTS[2], "good")
    g.session("claude_code", "explain", START + timedelta(days=100, hours=11, minutes=5), PROJECTS[2], "good", subagent_of=parent, exposure=("email",))
    made += 2
    for i in range(10):  # abandoned sessions
        src = r.choice(OPEN)
        g.session(src, intent_for(src), when(r.choices(days, wts)[0]), r.choice(PROJECTS), "vague", abandon=True)
        made += 1
    while made < n_sessions:
        src = _pick(r, SRC_W)
        g.session(src, intent_for(src), when(r.choices(days, wts)[0]), r.choice(PROJECTS), quality())
        made += 1
    # unlinked commit + source health
    g.rows["outcomes"].append({"outcome_id": "o-unlinked", "project_id": "p_webapp", "session_id": None, "ts": START + timedelta(days=5), "kind": "commit",
                               "files_changed": 2, "insertions": 10, "deletions": 1})
    S, I, F, B = pl.Utf8, pl.Int64, pl.Float64, pl.Boolean
    ts = pl.Datetime("us", "UTC")
    schemas = {
        "sessions": {"session_id": S, "source": S, "source_key": S, "project_id": S, "title": S, "started_at": ts, "ended_at": ts, "is_subagent": B,
                     "parent_session_id": S, "mode": S, "model": S, "n_user_turns": I, "n_assistant_turns": I, "tokens_in": I, "tokens_out": I,
                     "tokens_cache_read": I, "tokens_cache_write": I, "cost_usd": F, "cost_is_estimate": B, "tokens_estimated": B},
        "turns": {"turn_id": S, "session_id": S, "idx": I, "role": S, "ts": ts, "text": S, "text_len": I, "model": S, "tokens_in": I, "tokens_out": I,
                  "tokens_cache_read": I, "tokens_cache_write": I, "cost_usd": F, "latency_ms": I, "status": S, "is_interrupt": B},
        "tool_calls": {"call_id": S, "session_id": S, "turn_id": S, "name": S, "ts": ts, "duration_ms": I, "status": S, "is_edit": B},
        "code_edits": {"edit_id": S, "session_id": S, "turn_id": S, "file": S, "lines_added": I, "lines_removed": I, "state": S, "ts": ts},
        "outcomes": {"outcome_id": S, "project_id": S, "session_id": S, "ts": ts, "kind": S, "files_changed": I, "insertions": I, "deletions": I},
        "exposures": {"session_id": S, "turn_id": S, "ts": ts, "kind": S, "category": S, "n": I, "preview": S},
    }
    for table, schema in schemas.items():
        put(con, table, pl.DataFrame(g.rows[table], schema=schema), tmp_dir)
    put(con, "exposure_reviews", pl.DataFrame(reviews, schema={"turn_id": S, "status": S, "reviewed_at": ts}), tmp_dir)
    now = datetime(2026, 10, 1, tzinfo=UTC)
    health = [(s, "degraded" if s == "antigravity" and not demo else "ok", sum(1 for x in g.rows["sessions"] if x["source"] == s),
               json.dumps(["no turn text available"]) if s == "antigravity" and not demo else "[]", now, "{}") for s in ALL]
    put(con, "source_health", pl.DataFrame(health, schema=["source", "status", "sessions_found", "warnings", "checked_at", "versions_seen"], orient="row"), tmp_dir)
    return {"sessions": len(g.rows["sessions"]), "turns": len(g.rows["turns"])}


@functools.lru_cache(maxsize=4)
def build_analyzed(seed: int = 7, n_sessions: int = 400, backend: str = "tfidf", profile: str = "default", mode: str | None = "ml") -> tuple[Config, duckdb.DuckDBPyConnection, analyze.AnalyzeReport]:
    """Synthetic DB analysed with the given backend (memoised; treat the result as read-only)."""
    d = Path(tempfile.mkdtemp(prefix="pa-synth-"))
    cfg = Config(data_dir=d, embed_backend=backend)
    con = duckdb.connect()
    make_db(con, seed, n_sessions, d / ".tmp", profile)
    return cfg, con, analyze.run(cfg, con, mode)


def sample_json(path: Path, profile: str = "default", mode: str | None = "ml") -> dict:
    cfg, con, _ = build_analyzed(profile=profile, mode=mode)
    data = export.build(con, cfg)
    Path(path).write_text(export.serialize(data), encoding="utf-8")
    return data


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--profile", choices=["default", "demo"], default="default")
    ap.add_argument("--mode", choices=["auto", "basic", "ml", "deep"], default="ml")
    a = ap.parse_args()
    sample_json(a.out, a.profile, a.mode)
    print(f"wrote {a.out}")
    dash = Path(__file__).resolve().parents[1] / "dashboard" / "src" / "data"
    if dash.is_dir():
        shutil.copyfile(a.out, dash / "sample.json")
        print(f"wrote {dash / 'sample.json'}")
