// Derived metrics for the one-page dashboard: prior period, deltas, Wilson CI, run-rate, tool x intent tally,
// outliers, distributions, cohorts. Pure functions over `SessionRow[]` and `DashboardData`; no DOM, no React.
import type { DashboardData, Intent, SessionRow, Source } from "../data/types";
import { addDays, views, weekStart, type Filter, type Views } from "./filter";

export type Cmp = "prev" | "yoy" | "off";
/** A prior period with fewer sessions than this gets no delta chip. */
export const MIN_PRIOR_N = 5;

export interface Win { from: string; to: string; days: number }
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** Effective window = [f.from ?? range.start, f.to ?? range.end]. */
export function windowOf(d: DashboardData, f: Filter): Win {
  const dates = d.sessions.length ? d.sessions.map((r) => r.date).sort() : [];
  const from = f.from ?? (d.range.start || dates[0] || ""), to = f.to ?? (d.range.end || dates.at(-1) || "");
  if (!from || !to || to < from) return { from, to, days: 0 };
  return { from, to, days: dayDiff(from, to) + 1 };
}

/** Prior window: the same length ending the day before (prev) or the same dates a year earlier (yoy).
 *  null for "All" (no from/to), cmp off, or when the prior window starts before the data does. */
export function priorWindow(d: DashboardData, f: Filter, cmp: Cmp): Win | null {
  if (cmp === "off" || (f.from === undefined && f.to === undefined)) return null;
  const w = windowOf(d, f);
  if (w.days === 0) return null;
  const from = cmp === "yoy" ? addDays(w.from, -365) : addDays(w.from, -w.days);
  const to = cmp === "yoy" ? addDays(w.to, -365) : addDays(w.from, -1);
  if (d.range.start && from < d.range.start) return null;
  return { from, to, days: w.days };
}

export interface Prior { win: Win; v: Views }
export function priorViews(d: DashboardData, f: Filter, cmp: Cmp): Prior | null {
  const win = priorWindow(d, f, cmp);
  return win ? { win, v: views(d, { ...f, from: win.from, to: win.to }) } : null;
}

export type Delta = { kind: "pct"; pct: number } | { kind: "new" } | null;
/** Relative change. null = hide the chip (prior sample too small, or nothing to compare); "new" when prior is 0. */
export function delta(cur: number, prior: number, priorN: number): Delta {
  if (priorN < MIN_PRIOR_N) return null;
  if (prior === 0) return cur === 0 ? null : { kind: "new" };
  return { kind: "pct", pct: (cur - prior) / prior };
}
/** Absolute change for rates and scores (percentage points / score points). */
export const pointDelta = (cur: number, prior: number, priorN: number): number | null => (priorN < MIN_PRIOR_N ? null : cur - prior);

/** Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n, z2 = z * z, den = 1 + z2 / n, c = p + z2 / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, (c - m) / den), Math.min(1, (c + m) / den)];
}
/** True when the interval is wider than 30 points, i.e. "n=12, wide". */
export const isWide = (k: number, n: number) => { const [a, b] = wilson(k, n); return b - a > 0.3; };

export const daysInMonth = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate();
export const runRate = (cost: number, elapsedDays: number, dim: number) => (elapsedDays > 0 ? (cost / elapsedDays) * dim : 0);
/** Month-to-date priced cost at `end`, and the month-end projection at the current run-rate. null when nothing is priced. */
export function monthProjection(rows: SessionRow[], end: string): { mtd: number; perDay: number; projected: number; elapsed: number; dim: number } | null {
  if (!end) return null;
  const m = end.slice(0, 7), mine = rows.filter((r) => r.cost_usd !== null && r.date.slice(0, 7) === m && r.date <= end);
  if (!mine.length) return null;
  const mtd = mine.reduce((a, r) => a + (r.cost_usd ?? 0), 0), elapsed = +end.slice(8, 10), dim = daysInMonth(end);
  return { mtd, perDay: mtd / elapsed, projected: runRate(mtd, elapsed, dim), elapsed, dim };
}

/** Priced cost per applied session; unpriced sessions are excluded and counted. */
export function costPerApplied(rows: SessionRow[]): { value: number | null; excluded: number } {
  const priced = rows.filter((r) => r.cost_usd !== null);
  const applied = priced.filter((r) => r.applied).length;
  return { value: applied ? priced.reduce((a, r) => a + (r.cost_usd ?? 0), 0) / applied : null, excluded: rows.length - priced.length };
}

export interface Cell { source: Source; intent: Intent; n: number; asked: number; applied: number; friction: number }
/** Tool x intent tally keyed `source|intent`; friction is the mean over sessions with a prompt. */
export function crossTally(rows: SessionRow[]): Map<string, Cell> {
  const m = new Map<string, Cell & { fsum: number }>();
  for (const r of rows) {
    const k = `${r.source}|${r.intent}`;
    const c = m.get(k) ?? { source: r.source, intent: r.intent, n: 0, asked: 0, applied: 0, friction: 0, fsum: 0 };
    c.n++; if (r.applied) c.applied++;
    if (r.prompts > 0) { c.asked++; c.fsum += r.friction; }
    m.set(k, c);
  }
  return new Map([...m].map(([k, { fsum, ...c }]) => [k, { ...c, friction: c.asked ? fsum / c.asked : 0 }]));
}

export const quantile = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo);
};
export const median = (xs: number[]) => quantile(xs, 0.5);

/** Robust z of each active day against the previous `win` calendar days (median/MAD, inactive days count as 0). */
export function rollingZ(series: { date: string; value: number }[], win = 28): { date: string; value: number; z: number }[] {
  const by = new Map(series.map((s) => [s.date, s.value]));
  return series.map((s) => {
    const base = Array.from({ length: win }, (_, i) => by.get(addDays(s.date, -(i + 1))) ?? 0);
    const med = median(base), mad = median(base.map((x) => Math.abs(x - med)));
    const z = mad > 0 ? (0.6745 * (s.value - med)) / mad : s.value > med ? 10 : 0;
    return { ...s, z };
  });
}

type NumKey = "friction" | "prompts" | "tokens" | "cost_usd";
/** Top-N sessions by a numeric field; `minPrompts` keeps one-prompt sessions out of friction rankings. */
export function topBy(rows: SessionRow[], key: NumKey, n: number, minPrompts = 0): SessionRow[] {
  return rows.filter((r) => r.prompts >= minPrompts && (r[key] ?? -1) >= 0)
    .sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1) || a.id.localeCompare(b.id)).slice(0, n);
}
/** Upper Tukey fence (Q3 + 1.5 IQR). */
export function iqrFence(xs: number[]): number { const q1 = quantile(xs, 0.25), q3 = quantile(xs, 0.75); return q3 + 1.5 * (q3 - q1); }

export interface Hist { edges: number[]; counts: number[] }
/** Equal-width histogram over [lo, hi]; the top edge is inclusive. */
export function histogram(xs: number[], bins: number, lo: number, hi: number): Hist {
  const edges = Array.from({ length: bins + 1 }, (_, i) => lo + ((hi - lo) * i) / bins), counts = new Array<number>(bins).fill(0);
  for (const x of xs) { if (x < lo || x > hi) continue; counts[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins))]++; }
  return { edges, counts };
}
/** Histogram over log10(x + 1), for heavy-tailed counts (prompts, tokens per session). */
export function logHistogram(xs: number[], bins: number): Hist {
  const l = xs.map((x) => Math.log10(Math.max(0, x) + 1)), hi = Math.max(...l, 1e-9);
  const h = histogram(l, bins, 0, hi);
  return { edges: h.edges.map((e) => 10 ** e - 1), counts: h.counts };
}

export interface Bucket { from: string; to: string; i: number }
/** Consecutive buckets of `step` days from the window start. Both periods use this so bucket i lines up. */
export function buckets(win: Win, step: 1 | 7): Bucket[] {
  return Array.from({ length: Math.ceil(win.days / step) }, (_, i) => ({ i, from: addDays(win.from, i * step), to: addDays(win.from, Math.min(win.days, (i + 1) * step) - 1) }));
}
export function bucketSeries(rows: SessionRow[], win: Win, step: 1 | 7, val: (rs: SessionRow[]) => number): number[] {
  const n = Math.ceil(win.days / step), groups: SessionRow[][] = Array.from({ length: n }, () => []);
  for (const r of rows) { const i = Math.floor(dayDiff(win.from, r.date) / step); if (i >= 0 && i < n) groups[i].push(r); }
  return groups.map((g) => (g.length ? val(g) : 0));
}
export const METRICS = {
  sessions: (rs: SessionRow[]) => rs.length,
  prompts: (rs: SessionRow[]) => rs.reduce((a, r) => a + r.prompts, 0),
  cost: (rs: SessionRow[]) => rs.reduce((a, r) => a + (r.cost_usd ?? 0), 0),
  applied: (rs: SessionRow[]) => { const a = rs.filter((r) => r.prompts > 0); return a.length ? a.filter((r) => r.applied).length / a.length : 0; },
  friction: (rs: SessionRow[]) => { const a = rs.filter((r) => r.prompts > 0); return a.length ? a.reduce((s, r) => s + r.friction, 0) / a.length : 0; },
};
/** Last 24 buckets for a KPI sparkline: daily for windows up to 31 days, weekly beyond. */
export function sparkSeries(rows: SessionRow[], win: Win, val: (rs: SessionRow[]) => number): number[] {
  return bucketSeries(rows, win, win.days <= 31 ? 1 : 7, val).slice(-24);
}

export const cumulative = (xs: number[]) => xs.reduce<number[]>((a, x) => (a.push((a.at(-1) ?? 0) + x), a), []);

export interface WeekShare { week: string; total: number; by: Partial<Record<Source, number>> }
/** Sessions per tool per week; shares are by / total. */
export function shareByWeek(rows: SessionRow[]): WeekShare[] {
  const m = new Map<string, WeekShare>();
  for (const r of rows) {
    const w = weekStart(r.date), x = m.get(w) ?? { week: w, total: 0, by: {} };
    x.total++; x.by[r.source] = (x.by[r.source] ?? 0) + 1; m.set(w, x);
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week));
}
/** Weekly new vs returning projects. `all` supplies each project's first-seen date (min date over every session). */
export function newVsReturning(rows: SessionRow[], all: SessionRow[]): { week: string; fresh: number; returning: number }[] {
  const first = new Map<string, string>();
  for (const r of all) if (r.project && (first.get(r.project) ?? "9999") > r.date) first.set(r.project, r.date);
  const m = new Map<string, { week: string; fresh: Set<string>; returning: Set<string> }>();
  for (const r of rows) {
    if (!r.project) continue;
    const w = weekStart(r.date), x = m.get(w) ?? { week: w, fresh: new Set<string>(), returning: new Set<string>() };
    (weekStart(first.get(r.project) ?? r.date) === w ? x.fresh : x.returning).add(r.project); m.set(w, x);
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week)).map((x) => ({ week: x.week, fresh: x.fresh.size, returning: x.returning.size }));
}
/** Applied % per week per tool; null where fewer than `minN` sessions had a prompt. */
export function appliedByWeek(rows: SessionRow[], minN = 5): { week: string; by: Partial<Record<Source, number | null>> }[] {
  const m = new Map<string, Map<Source, SessionRow[]>>();
  for (const r of rows) if (r.prompts > 0) { const w = weekStart(r.date), g = m.get(w) ?? new Map(); g.set(r.source, [...(g.get(r.source) ?? []), r]); m.set(w, g); }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([week, g]) => ({ week, by: Object.fromEntries([...g].map(([s, rs]) => [s, rs.length >= minN ? rs.filter((r) => r.applied).length / rs.length : null])) }));
}
