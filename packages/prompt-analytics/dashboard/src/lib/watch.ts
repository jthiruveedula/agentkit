// Watchtower + cost forecast + time-to-applied-edit: pure helpers over the per-session rows. Every number comes from the export; unpriced sessions are never $0.
import type { DashboardData, SessionRow } from "../data/types";
import { addDays, type Filter } from "./filter";
import { daysInMonth, dayDiff, quantile, type Win } from "./compare";
import { struggledRate } from "./metrics";
import { fmtDate, fmtInt, fmtPct, fmtUSD } from "./format";
import { MIN_N } from "./thresholds";
import { TH } from "./attention";

export const RUN_DAYS = 14, STRUGGLE_LINE = 0.1;
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const priced = (rs: SessionRow[]) => rs.filter((r) => r.cost_usd !== null);

export interface Forecast { mtd: number; rate: number; days: number; left: number; projected: number; unpriced: number; monthFrom: string; runFrom: string }
/** Month-end projection = priced spend so far this month + daily run-rate (priced spend of the trailing 14 calendar days ending at `end`, or fewer when the export is shorter) x days left in the month. null when nothing is priced this month. */
export function forecast(rows: SessionRow[], start: string, end: string): Forecast | null {
  if (!end) return null;
  const m = end.slice(0, 7), mine = rows.filter((r) => r.date.slice(0, 7) === m && r.date <= end), pr = priced(mine);
  if (!pr.length) return null;
  const days = Math.max(1, Math.min(RUN_DAYS, start ? dayDiff(start, end) + 1 : RUN_DAYS)), runFrom = addDays(end, 1 - days);
  const rate = sum(priced(rows.filter((r) => r.date >= runFrom && r.date <= end)).map((r) => r.cost_usd as number)) / days, left = daysInMonth(end) - +end.slice(8, 10);
  const mtd = sum(pr.map((r) => r.cost_usd as number));
  return { mtd, rate, days, left, projected: mtd + rate * left, unpriced: mine.length - pr.length, monthFrom: `${m}-01`, runFrom };
}

export interface TopicBreak { cluster: number; now: number; was: number; sessions: number }
const slope = (ys: number[]) => { const n = ys.length, mx = (n - 1) / 2, my = sum(ys) / n; return sum(ys.map((y, i) => (i - mx) * (y - my))) / sum(ys.map((_, i) => (i - mx) ** 2)); };
/** A topic breaks trend when, over 12 weeks ending at `end`, its last-4-week cost slope beats the prior-8-week slope by more than a quarter of the prior weekly mean, the recent mean is higher, and it has >= 5 priced sessions lately; needs 12 weeks of export. */
export function topicBreaks(rows: SessionRow[], start: string, end: string): TopicBreak[] {
  if (!end || !start || dayDiff(start, end) + 1 < 84) return [];
  const by = new Map<number, { w: number[]; n: number }>();
  for (const r of priced(rows)) {
    const k = Math.floor(dayDiff(r.date, end) / 7);
    if (r.cluster < 0 || k < 0 || k > 11) continue;
    const e = by.get(r.cluster) ?? { w: Array(12).fill(0), n: 0 };
    e.w[11 - k] += r.cost_usd as number; if (k < 4) e.n++;
    by.set(r.cluster, e);
  }
  return [...by].flatMap(([cluster, { w, n }]) => {
    const was = sum(w.slice(0, 8)) / 8, now = sum(w.slice(8)) / 4;
    return n >= 5 && was > 0 && now > was && slope(w.slice(8)) - slope(w.slice(0, 8)) > was / 4 ? [{ cluster, now, was, sessions: n }] : [];
  }).sort((a, b) => b.now / b.was - a.now / a.was);
}

export interface Alert { id: string; sev: "bad" | "warn"; text: string; filter?: Filter; secret?: string[] }
/** Threshold breaches from existing data: struggle rate over 10% in the last 4 weeks (the brief's struggled definition, >= MIN_N sessions with a prompt), open secret findings, cost anomalies in the window (|z| >= attention's line). */
export function alerts(d: DashboardData, rows: SessionRow[], win: Win): Alert[] {
  const out: Alert[] = [], from = win.to ? addDays(win.to, -27) : "", r = struggledRate(rows.filter((x) => x.date >= from && x.date <= win.to));
  if (win.to && r.p !== null && r.n >= MIN_N && r.p > STRUGGLE_LINE) out.push({ id: "struggle", sev: "bad", text: `Struggle rate ${fmtPct(r.p, 1)} in the last 4 weeks (${fmtInt(r.k)} of ${fmtInt(r.n)} sessions), over the ${fmtPct(STRUGGLE_LINE)} line`, filter: { struggled: true, from } });
  const sec = d.exposure.items.filter((i) => i.status === "open" && i.category === "secret"), ids = [...new Set(sec.flatMap((i) => (i.session ? [i.session] : [])))];
  if (sec.length) out.push({ id: "secret", sev: "bad", text: `${fmtInt(sec.length)} open secret finding${sec.length === 1 ? "" : "s"}${ids.length ? ` in ${fmtInt(ids.length)} session${ids.length === 1 ? "" : "s"}` : ""}`, secret: ids });
  d.anomalies.filter((a) => win.to && a.metric === "cost" && Math.abs(a.z) >= TH.z && a.date >= win.from && a.date <= win.to).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    .forEach((a) => out.push({ id: `cost-${a.date}`, sev: Math.abs(a.z) >= TH.zHigh ? "bad" : "warn", text: `Cost spike ${fmtDate(a.date)}: ${fmtUSD(a.value)} (z ${a.z.toFixed(1)})`, filter: { from: a.date, to: a.date } }));
  return out;
}

export interface Tta { p50: number; p95: number; n: number }
/** Time to applied edit: p50 / p95 of ttr_min (minutes from session start to the last applied edit). Sessions without it are left out. null = none. */
export function tta(rows: SessionRow[]): Tta | null {
  const xs = rows.flatMap((r) => (r.ttr_min == null ? [] : [r.ttr_min]));
  return xs.length ? { p50: quantile(xs, 0.5), p95: quantile(xs, 0.95), n: xs.length } : null;
}
export const ttaText = (t: Tta | null) => (t ? `${+t.p50.toFixed(1)} / ${+t.p95.toFixed(1)} min` : "–");

/** Priced spend per priced session that reached the outcome stage (funnel stage 6). Unpriced sessions are in neither side. */
export function costPerOutcome(rows: SessionRow[]): { value: number | null; outcomes: number; cost: number } {
  const pr = priced(rows), cost = sum(pr.map((r) => r.cost_usd as number)), outcomes = pr.filter((r) => r.reached_stage >= 6).length;
  return { value: outcomes ? cost / outcomes : null, outcomes, cost };
}
