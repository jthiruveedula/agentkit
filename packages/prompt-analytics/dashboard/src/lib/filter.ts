// Pure filter + aggregation over per-session rows. Every panel renders from `views(d, filter)`,
// so a filter set by any chart cross-filters all of them. No DOM, no React: unit-tested directly.
import type { DashboardData, Intent, SessionRow, Source } from "../data/types";
import { srcLabel } from "./palette";

export interface Filter {
  source?: Source; intent?: Intent; project?: string; cluster?: number;
  from?: string; to?: string;          // ISO dates, inclusive
  stage?: number;                      // reached funnel stage >= n (1..6)
  loops?: number;                      // rephrase loops == n (8 means 8+)
  applied?: boolean;
}
export type FilterKey = keyof Filter;
export const STAGES = ["Intent", "Prompt", "Response", "Iterate", "Applied", "Outcome"] as const;
export const MAX_LOOPS = 8;

export const isEmpty = (f: Filter) => (Object.keys(f) as FilterKey[]).every((k) => f[k] === undefined);
const clean = (f: Filter): Filter => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as Filter;
/** Merge a patch; an explicitly undefined value clears that key. */
export const patchFilter = (f: Filter, p: Filter): Filter => clean({ ...f, ...p });
export const same = (a: Filter, b: Filter) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));

export function match(r: SessionRow, f: Filter): boolean {
  return (f.source === undefined || r.source === f.source)
    && (f.intent === undefined || r.intent === f.intent)
    && (f.project === undefined || r.project === f.project)
    && (f.cluster === undefined || r.cluster === f.cluster)
    && (f.from === undefined || r.date >= f.from)
    && (f.to === undefined || r.date <= f.to)
    && (f.stage === undefined || r.reached_stage >= f.stage)
    && (f.loops === undefined || (f.loops >= MAX_LOOPS ? r.loops >= MAX_LOOPS : r.loops === f.loops))
    && (f.applied === undefined || r.applied === f.applied);
}
export const applyFilter = (rows: SessionRow[], f: Filter) => (isEmpty(f) ? rows : rows.filter((r) => match(r, f)));

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** Breadcrumb chips: the keys each chip clears, and its label. */
export function chips(f: Filter, clusterLabel?: (id: number) => string): { keys: FilterKey[]; label: string }[] {
  const out: { keys: FilterKey[]; label: string }[] = [];
  if (f.from !== undefined || f.to !== undefined) {
    const a = f.from && day(f.from), b = f.to && day(f.to);
    out.push({ keys: ["from", "to"], label: a && b ? (f.from === f.to ? a : `${a} to ${b}`) : a ? `From ${a}` : `Until ${b}` });
  }
  if (f.source) out.push({ keys: ["source"], label: srcLabel(f.source) });
  if (f.intent) out.push({ keys: ["intent"], label: f.intent });
  if (f.project) out.push({ keys: ["project"], label: f.project });
  if (f.cluster !== undefined) out.push({ keys: ["cluster"], label: f.cluster < 0 ? "No topic" : `Topic: ${clusterLabel?.(f.cluster) ?? f.cluster}` });
  if (f.stage) out.push({ keys: ["stage"], label: `Reached ${STAGES[f.stage - 1]?.toLowerCase()}` });
  if (f.loops !== undefined) out.push({ keys: ["loops"], label: `${f.loops >= MAX_LOOPS ? `${MAX_LOOPS}+` : f.loops} rephrase loops` });
  if (f.applied !== undefined) out.push({ keys: ["applied"], label: f.applied ? "Applied" : "Not applied" });
  return out;
}

/** Rates (applied, friction, loops) use sessions with >= 1 prompt as the denominator: empty chats can't apply or struggle. */
export interface Tally { key: string; sessions: number; asked: number; prompts: number; tokens: number; cost: number | null; applied: number; friction: number }
export interface Totals {
  sessions: number; asked: number; prompts: number; tokens: number; cost: number | null; unpriced: number; projects: number;
  activeDays: number; longest: number; current: number; applied: number; looped: number; friction: number;
}
export interface Week { week: string; sessions: number; cost: number; bySource: Partial<Record<Source, number>> }
export interface Views {
  totals: Totals; sources: Tally[]; intents: Tally[]; projects: Tally[];
  calendar: { date: string; sessions: number; prompts: number; cost: number }[];
  weeks: Week[];
  funnel: number[]; funnelBySource: { key: string; counts: number[] }[]; funnelByIntent: { key: string; counts: number[] }[];
  loops: { loops: number; sessions: number }[];
  frictionByIntent: { intent: string; friction: number; n: number }[];
  clusterCounts: Map<number, number>;
  rows: SessionRow[];           // the filtered rows (empty for legacy exports)
  legacy: boolean;              // true when the export has no per-session rows: filters cannot apply
}

export function streaks(dates: string[]): { days: number; longest: number; current: number } {
  const ds = [...new Set(dates)].sort();
  let longest = 0, run = 0, prev = 0;
  for (const d of ds) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev && t - prev === 864e5 ? run + 1 : 1;
    longest = Math.max(longest, run); prev = t;
  }
  return { days: ds.length, longest, current: ds.length ? run : 0 };
}

export function weekStart(iso: string): string {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}

const counts = (rows: SessionRow[]) => STAGES.map((_, i) => rows.reduce((n, r) => n + (r.reached_stage >= i + 1 ? 1 : 0), 0));

function tally(rows: SessionRow[], key: (r: SessionRow) => string): Tally[] {
  const m = new Map<string, Tally & { priced: boolean }>();
  for (const r of rows) {
    const k = key(r);
    const t = m.get(k) ?? { key: k, sessions: 0, asked: 0, prompts: 0, tokens: 0, cost: 0, applied: 0, friction: 0, priced: false };
    t.sessions++; t.prompts += r.prompts; t.tokens += r.tokens; t.applied += r.applied ? 1 : 0;
    if (r.prompts > 0) { t.asked++; t.friction += r.friction; }
    if (r.cost_usd !== null) { t.cost = (t.cost ?? 0) + r.cost_usd; t.priced = true; }
    m.set(k, t);
  }
  return [...m.values()].map(({ priced, ...t }) => ({ ...t, cost: priced ? t.cost : null, friction: t.asked ? t.friction / t.asked : 0 })).sort((a, b) => b.sessions - a.sessions || a.key.localeCompare(b.key));
}

export function views(d: DashboardData, f: Filter): Views {
  if (d.sessions.length === 0) return legacyViews(d);
  const rows = applyFilter(d.sessions, f);
  const st = streaks(rows.map((r) => r.date));
  const priced = rows.filter((r) => r.cost_usd !== null);
  const cal = new Map<string, { date: string; sessions: number; prompts: number; cost: number }>();
  const wk = new Map<string, Week>();
  const cc = new Map<number, number>();
  for (const r of rows) {
    const c = cal.get(r.date) ?? { date: r.date, sessions: 0, prompts: 0, cost: 0 };
    c.sessions++; c.prompts += r.prompts; c.cost += r.cost_usd ?? 0; cal.set(r.date, c);
    const w = weekStart(r.date);
    const x = wk.get(w) ?? { week: w, sessions: 0, cost: 0, bySource: {} };
    x.sessions++; x.cost += r.cost_usd ?? 0;
    if (r.cost_usd !== null) x.bySource[r.source] = (x.bySource[r.source] ?? 0) + r.cost_usd;
    wk.set(w, x);
    cc.set(r.cluster, (cc.get(r.cluster) ?? 0) + 1);
  }
  const n = rows.length;
  const asked = rows.filter((r) => r.prompts > 0);
  const intents = tally(rows, (r) => r.intent);
  return {
    totals: {
      sessions: n, asked: asked.length, prompts: rows.reduce((a, r) => a + r.prompts, 0), tokens: rows.reduce((a, r) => a + r.tokens, 0),
      cost: priced.length ? priced.reduce((a, r) => a + (r.cost_usd ?? 0), 0) : null, unpriced: n - priced.length,
      projects: new Set(rows.map((r) => r.project).filter(Boolean)).size,
      activeDays: st.days, longest: st.longest, current: st.current,
      applied: rows.reduce((a, r) => a + (r.applied ? 1 : 0), 0), looped: asked.reduce((a, r) => a + (r.loops > 0 ? 1 : 0), 0),
      friction: asked.length ? asked.reduce((a, r) => a + r.friction, 0) / asked.length : 0,
    },
    sources: tally(rows, (r) => r.source).filter((t) => t.prompts > 0 || t.sessions > 0),
    intents, projects: tally(rows, (r) => r.project || "(no project)"),
    calendar: [...cal.values()].sort((a, b) => a.date.localeCompare(b.date)),
    weeks: [...wk.values()].sort((a, b) => a.week.localeCompare(b.week)),
    funnel: counts(rows),
    funnelBySource: [...new Set(rows.map((r) => r.source))].sort().map((key) => ({ key, counts: counts(rows.filter((r) => r.source === key)) })).filter((x) => x.counts[0] > 0),
    funnelByIntent: intents.map((t) => ({ key: t.key, counts: counts(rows.filter((r) => r.intent === t.key)) })),
    loops: Array.from({ length: MAX_LOOPS + 1 }, (_, i) => ({ loops: i, sessions: asked.reduce((a, r) => a + ((i === MAX_LOOPS ? r.loops >= MAX_LOOPS : r.loops === i) ? 1 : 0), 0) })),
    frictionByIntent: intents.filter((t) => t.asked > 0).map((t) => ({ intent: t.key, friction: t.friction, n: t.asked })).sort((a, b) => b.friction - a.friction),
    clusterCounts: cc, rows, legacy: false,
  };
}

/** Exports from before per-session rows: aggregates only, filters do not apply. */
function legacyViews(d: DashboardData): Views {
  const t = d.totals;
  const tl = (key: string, sessions: number, prompts = 0, tokens = 0, cost: number | null = null): Tally => ({ key, sessions, asked: sessions, prompts, tokens, cost, applied: 0, friction: 0 });
  const fi = new Map(d.friction.by_intent.map((x) => [x.intent, x.friction]));
  const weeks = new Map<string, Week>();
  for (const r of d.cost_river) {
    const w = weekStart(r.date);
    const x = weeks.get(w) ?? { week: w, sessions: 0, cost: 0, bySource: {} };
    for (const [k, v] of Object.entries(r.values)) { x.cost += v ?? 0; x.bySource[k as Source] = (x.bySource[k as Source] ?? 0) + (v ?? 0); }
    weeks.set(w, x);
  }
  const sum = (xs: { counts: number[] }[]) => STAGES.map((_, i) => xs.reduce((a, x) => a + (x.counts[i] ?? 0), 0));
  return {
    totals: { sessions: t.sessions, asked: sum(d.funnel.by_source)[0], prompts: t.prompts, tokens: t.tokens, cost: t.cost_usd, unpriced: 0, projects: t.projects, activeDays: t.active_days, longest: t.longest_streak, current: t.current_streak, applied: 0, looped: 0, friction: 0 },
    sources: d.by_source.filter((s) => s.prompts > 0).map((s) => tl(s.source, s.sessions, s.prompts, s.tokens, s.cost_usd > 0 ? s.cost_usd : null)),
    intents: d.funnel.by_intent.map((x) => tl(x.intent, x.counts[0] ?? 0)), projects: [],
    calendar: d.calendar.map((c) => ({ ...c, cost: c.cost_usd })), weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    funnel: sum(d.funnel.by_source), funnelBySource: d.funnel.by_source.map((x) => ({ key: x.source, counts: x.counts })),
    funnelByIntent: d.funnel.by_intent.map((x) => ({ key: x.intent, counts: x.counts })),
    loops: d.friction.loops_hist, frictionByIntent: d.friction.by_intent.map((x) => ({ ...x, friction: fi.get(x.intent) ?? x.friction })),
    clusterCounts: new Map(), rows: [], legacy: true,
  };
}

export const capZ = (z: number) => (z >= 10 ? "10+" : z.toFixed(1));
