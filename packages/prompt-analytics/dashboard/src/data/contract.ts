// Dashboard data contract: the exact shape of dashboard.json written by
// prompt_analytics/export.py. Aggregates only; any text is redacted and
// <= 160 chars. Bump `schema` on breaking changes; the app refuses unknown majors.

export type Source = "claude_code" | "copilot" | "cursor" | "opencode" | "antigravity";
export type Intent =
  | "bugfix" | "feature" | "refactor" | "explain" | "test"
  | "docs" | "devops" | "data" | "other";
export type Chapter = "footprint" | "time" | "funnel" | "friction" | "works" | "recommend";

export interface Insight {
  id: string;
  chapter: Chapter;
  rank: number;
  claim: string;            // <= 12 words, the chapter headline when rank === 1
  metric: string;           // e.g. "median time-to-resolution"
  value: number;
  unit: string;             // "x" | "%" | "min" | "USD" | "tokens" | ""
  delta: number | null;     // relative change vs comparison group, e.g. 1.1 = +110%
  evidence: { n: number; ci?: [number, number]; method: string };
  drill: { chapter: Chapter; filter: Partial<{ source: Source; intent: Intent; project: string; cluster: number }> };
}

export interface SessionRow {
  id: string; source: Source; date: string; project: string; intent: Intent;
  prompts: number; tokens: number; cost_usd: number | null;
  reached_stage: number; applied: boolean; loops: number; friction: number;
  cluster: number; title: string;
}

export interface DashboardData {
  schema: "1.0";
  generated_at: string;                         // ISO UTC
  range: { start: string; end: string };        // ISO dates
  sources: { source: Source; status: "ok" | "degraded" | "missing" | "unsupported"; sessions: number; note?: string }[];

  // Chapter 1 · Your AI footprint
  totals: { sessions: number; prompts: number; tokens: number; cost_usd: number; active_days: number;
            longest_streak: number; current_streak: number; projects: number; commits_linked: number };
  by_source: { source: Source; sessions: number; prompts: number; tokens: number; cost_usd: number; cost_is_estimate: boolean }[];

  // Chapter 2 · Where time goes
  calendar: { date: string; sessions: number; prompts: number; cost_usd: number }[];          // one per active day
  hour_week: { dow: number; hour: number; prompts: number }[];                                 // dow 0=Mon
  cost_river: { date: string; values: Partial<Record<Source, number>> }[];                     // weekly USD by source
  anomalies: { date: string; metric: "cost" | "prompts"; value: number; z: number }[];
  ttr: { source: Source; intent: Intent; median_min: number; n: number }[];

  // Chapter 3 · The funnel
  funnel: {
    stages: ["intent", "prompt", "response", "iterate", "applied", "outcome"];
    by_source: { source: Source; counts: number[] }[];          // counts aligned to stages
    by_intent: { intent: Intent; counts: number[] }[];
  };
  tool_switch: { from: Source; to: Source; count: number }[];  // consecutive sessions, same project, < 24h

  // Chapter 4 · Friction hotspots
  friction: {
    rates: { source: Source; correction: number; frustration: number; rephrase: number; abandoned: number; interrupted: number; n: number }[];
    by_intent: { intent: Intent; friction: number; n: number }[];
    loops_hist: { loops: number; sessions: number }[];          // rephrase-loop length histogram
  };

  // Chapter 5 · What works best
  galaxy: {
    clusters: { id: number; label: string; size: number; intent: Intent; success: number; exemplar?: string; cx: number; cy: number }[];
    points: { x: number[]; y: number[]; c: number[]; q: number[] };   // columnar, normalized to [0,1]; c=-1 unclustered; q quality 0..100
  };
  quality: {
    axes: ["specificity", "context", "constraints", "length"];
    you: number[];                   // mean sub-scores 0..1
    top: number[];                   // sub-scores of top-outcome tercile
    by_source: { source: Source; values: number[] }[];
    validation: { spearman: number | null; n: number };
  };
  what_works: { cluster: number; feature: string; effect: number; ci: [number, number]; n: number; direction: "helps" | "hurts" }[];
  what_works_tested: number;                        // effect tests run (0 = none ran); what_works holds only those that passed the gates

  // Per-session rows for drilldowns and client-side cross-filtering. Non-subagent sessions only, newest first,
  // capped at 5000. `title` is a redacted snippet (<= 160 chars), "" when the session has none. `cost_usd` is null
  // for sources that never record a price (shown as "not priced", never plotted as $0). `cluster` -1 = none.
  // `reached_stage` 0..6 (funnel stages reached, cumulative); `friction` 0..1.
  sessions: SessionRow[];

  // Chapter 4 panel · Sensitive data you pasted (counts only; no values ever leave the store)
  exposure: {
    sessions: number;                               // non-subagent sessions with >= 1 finding
    share: number;                                  // sessions / all non-subagent sessions, 0..1
    by_category: { category: "secret" | "pii" | "phi"; sessions: number; prompts: number; advice: string }[];
    by_kind: { kind: string; category: "secret" | "pii" | "phi"; sessions: number; prompts: number;
               by_source: Partial<Record<Source, number>> }[];          // sessions per source
    weekly: { date: string; secret: number; pii: number; phi: number }[]; // sessions per week
    // Review queue, newest first, capped at 300. `preview` is masked (findings shown as ⟦kind⟧)
    // and safe to render; the raw value is never in this file. Counts above exclude false_positive.
    items: { id: string; session?: string; source: Source; date: string; session_title: string | null; category: "secret" | "pii" | "phi";
             kinds: string[]; preview: string | null; status: "open" | "reviewed" | "false_positive" }[];
  };

  // Analysis engine: which tier ran, picked from what this machine has installed.
  //   basic = stdlib + duckdb only: keyword intents, rule-based quality, z-score anomalies, intent treemap (no galaxy points)
  //   ml    = + scikit-learn: TF-IDF + KMeans galaxy, logistic what-works with bootstrap CI (anomalies: rolling median/MAD z in every tier)
  //   deep  = + local embedding model (fastembed / sentence-transformers): semantic galaxy, near-duplicate prompts
  engine: {
    mode: AnalysisMode;                       // tier that actually ran
    requested: AnalysisMode | "auto";         // from --mode / [analysis] mode
    available: AnalysisMode[];                // tiers this machine can run, ascending
    libs: Record<string, string | null>;      // probed package -> version, null if missing
    accel: "cpu" | "mps" | "cuda";            // only meaningful for deep
    reason: string;                           // e.g. "auto: scikit-learn 1.9.1 found, no embedding model"
    upgrade: { mode: AnalysisMode; command: string } | null;   // next tier and how to get it
    methods: Partial<Record<Chapter, string>>;                 // per-chapter method label shown in the UI
  };

  // Chapter 6 · Recommendations + headline insights for every chapter
  insights: Insight[];
  recommendations: { id: string; title: string; action: string; impact: string; evidence_insight: string }[];
}

export type AnalysisMode = "basic" | "ml" | "deep";

// Local review API (only when served by `prompt-analytics serve`; absent over file://).
// The page reads its token from <meta name="pa-token">; every call sends header `X-PA-Token`.
//   GET  /api/exposure/:id         -> { findings: { kind: string; category: string; before: string; value: string; after: string }[] }
//                                     raw text re-read from the original session file on demand; never stored or cached.
//   POST /api/exposure/:id/review  body { status: "reviewed" | "false_positive" | "open" } -> { ok: true }
export interface RevealFinding { kind: string; category: string; before: string; value: string; after: string }
export interface ExposureApi {
  reveal(id: string): Promise<RevealFinding[]>;
  review(id: string, status: "reviewed" | "false_positive" | "open"): Promise<void>;
  // POST /api/analyze  body { mode: AnalysisMode | "auto" } -> DashboardData   (re-runs analyze+export at that tier;
  // 409 if the tier is not in engine.available)
  reanalyze(mode: AnalysisMode | "auto"): Promise<DashboardData>;
}
