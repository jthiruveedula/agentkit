import type { DashboardData, Chapter, Insight } from "./types";

export class SchemaError extends Error {}

/** Read the JSON embedded by export.py. Returns null when absent or literally `null` (dev). */
export function readInline(doc: Document = document): unknown {
  const el = doc.getElementById("pa-data");
  const txt = el?.textContent?.trim();
  if (!txt || txt === "null") return null;
  // `<\/script>` and `<<` escapes are valid JSON string escapes, so plain parse is safe.
  return JSON.parse(txt);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const arr = <T = Record<string, unknown>>(x: unknown): T[] => (Array.isArray(x) ? (x.filter((v) => v !== null && v !== undefined) as T[]) : []);
const num = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const nums = (x: unknown): number[] => (Array.isArray(x) ? x.map((v) => num(v)) : []);
const obj = (x: unknown): Record<string, unknown> => (isObj(x) ? x : {});

const STAGES = ["intent", "prompt", "response", "iterate", "applied", "outcome"] as const;
const AXES = ["specificity", "context", "constraints", "length"] as const;

const MODES = ["basic", "ml", "deep"] as const;
const isMode = (x: unknown): x is (typeof MODES)[number] => MODES.includes(x as never);
export function normEngine(x: unknown): DashboardData["engine"] {
  const e = obj(x);
  const mode = isMode(e.mode) ? e.mode : "basic";
  const up = obj(e.upgrade);
  return {
    mode,
    requested: isMode(e.requested) || e.requested === "auto" ? (e.requested as never) : "auto",
    available: Array.isArray(e.available) ? e.available.filter(isMode) : [mode],
    libs: obj(e.libs) as never,
    accel: e.accel === "mps" || e.accel === "cuda" ? e.accel : "cpu",
    reason: String(e.reason ?? ""),
    upgrade: isMode(up.mode) && typeof up.command === "string" ? { mode: up.mode, command: up.command } : null,
    methods: obj(e.methods) as never,
  };
}

/**
 * Validates the schema major and fills every missing array/object with an empty default,
 * so no chart can crash on partial data. Throws SchemaError on an unknown major.
 */
export function normalize(raw: unknown): DashboardData {
  if (!isObj(raw)) throw new SchemaError("Data is not an object.");
  const schema = String(raw.schema ?? "");
  if (schema.split(".")[0] !== "1") throw new SchemaError(`Unsupported data schema "${schema}". This dashboard reads 1.x.`);
  const t = obj(raw.totals);
  const f = obj(raw.funnel);
  const fr = obj(raw.friction);
  const g = obj(raw.galaxy);
  const gp = obj(g.points);
  const q = obj(raw.quality);
  const range = obj(raw.range);
  const ex = obj(raw.exposure);

  const n = Math.min(...(["x", "y", "c", "q"] as const).map((k) => (Array.isArray(gp[k]) ? (gp[k] as unknown[]).length : 0)));
  const cut = (k: string) => nums(gp[k]).slice(0, n);

  return {
    schema: "1.0",
    generated_at: String(raw.generated_at ?? ""),
    range: { start: String(range.start ?? ""), end: String(range.end ?? "") },
    engine: normEngine(raw.engine),
    sources: arr(raw.sources),
    totals: {
      sessions: num(t.sessions), prompts: num(t.prompts), tokens: num(t.tokens), cost_usd: num(t.cost_usd),
      active_days: num(t.active_days), longest_streak: num(t.longest_streak), current_streak: num(t.current_streak),
      projects: num(t.projects), commits_linked: num(t.commits_linked),
    },
    by_source: arr(raw.by_source),
    calendar: arr(raw.calendar),
    hour_week: arr(raw.hour_week),
    cost_river: arr<DashboardData["cost_river"][number]>(raw.cost_river).map((r) => ({ date: String(r.date), values: obj(r.values) as never })),
    anomalies: arr(raw.anomalies),
    ttr: arr(raw.ttr),
    funnel: { stages: [...STAGES], by_source: arr(f.by_source), by_intent: arr(f.by_intent) },
    tool_switch: arr(raw.tool_switch),
    friction: { rates: arr(fr.rates), by_intent: arr(fr.by_intent), loops_hist: arr(fr.loops_hist) },
    galaxy: { clusters: arr(g.clusters), points: { x: cut("x"), y: cut("y"), c: cut("c"), q: cut("q") } },
    quality: {
      axes: [...AXES], you: nums(q.you), top: nums(q.top), by_source: arr(q.by_source),
      validation: { spearman: typeof obj(q.validation).spearman === "number" ? (obj(q.validation).spearman as number) : null, n: num(obj(q.validation).n) },
    },
    exposure: {
      sessions: num(ex.sessions), share: num(ex.share),
      by_category: arr<DashboardData["exposure"]["by_category"][number]>(ex.by_category).map((c) => ({ ...c, advice: String(c.advice ?? "") })),
      by_kind: arr<DashboardData["exposure"]["by_kind"][number]>(ex.by_kind).map((k) => ({ ...k, by_source: obj(k.by_source) as never })),
      weekly: arr(ex.weekly),
      items: arr<DashboardData["exposure"]["items"][number]>(ex.items).map((i) => ({
        ...i, id: String(i.id), session: typeof i.session === "string" ? i.session : undefined, kinds: Array.isArray(i.kinds) ? i.kinds.map(String) : [],
        preview: typeof i.preview === "string" ? i.preview : null,
        session_title: typeof i.session_title === "string" ? i.session_title : null,
        status: i.status === "reviewed" || i.status === "false_positive" ? i.status : "open",
      })),
    },
    what_works: arr(raw.what_works),
    what_works_tested: num(raw.what_works_tested),
    sessions: arr<DashboardData["sessions"][number]>(raw.sessions).map((r) => ({
      id: String(r.id), source: r.source, date: String(r.date ?? "").slice(0, 10), project: String(r.project ?? ""),
      intent: (typeof r.intent === "string" ? r.intent : "other") as never,
      prompts: num(r.prompts), tokens: num(r.tokens), cost_usd: typeof r.cost_usd === "number" && Number.isFinite(r.cost_usd) ? r.cost_usd : null,
      reached_stage: num(r.reached_stage), applied: !!r.applied, loops: num(r.loops), friction: num(r.friction),
      cluster: num(r.cluster, -1), title: String(r.title ?? "").slice(0, 160),
    })),
    insights: arr(raw.insights),
    recommendations: arr(raw.recommendations),
  };
}

/** Rank-1 insight for a chapter (lowest rank if none is exactly 1). */
export function headline(d: DashboardData, ch: Chapter): Insight | undefined {
  const xs = d.insights.filter((i) => i.chapter === ch).sort((a, b) => a.rank - b.rank);
  return xs[0];
}

/** Production reads only the inline element; dev falls back to the sample (tree-shaken from builds). */
export async function loadData(): Promise<DashboardData | null> {
  const inline = readInline();
  if (inline !== null) return normalize(inline);
  if (import.meta.env.DEV) {
    const m = await import("./sample.dev.json");
    return normalize(m.default);
  }
  return null;
}
