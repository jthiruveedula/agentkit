// Watchtower + cost forecast + time-to-applied-edit: pure helpers over the per-session rows. Every number comes from the export; unpriced sessions are never $0.
import type { DashboardData, SessionRow } from "../data/types";
import { addDays, type Filter } from "./filter";
import { daysInMonth, dayDiff, median, quantile, type Win } from "./compare";
import { spikes } from "./trend";
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

export interface Band { lo: number; hi: number; held: number; tested: number; months: number }
/** Historical-variance band around the straight-line projection. For each of up to 12 earlier complete months (whose first day is on/after the earliest row), re-run the same projection at the same day-of-month (clamped) with the same run-rate length;
 *  ratio = that month's actual priced total / its projection (skipped when the projection is <= 0). lo/hi = p25/p75 of ratios x projected.
 *  Report card: each of the last <= 8 months that has >= 3 earlier ratios; held = its ratio fell inside the p25-p75 of the earlier ratios only (no peeking). A p25-p75 band holds about half the time by construction. null when < 4 ratios. */
export function forecastBand(rows: SessionRow[], end: string, days: number, projected: number): Band | null {
  if (!end) return null;
  const pr = priced(rows), first = rows.reduce((a, r) => (r.date < a ? r.date : a), end), dom = +end.slice(8, 10), c = (r: SessionRow) => r.cost_usd as number, ratios: number[] = [];
  for (let k = 12; k >= 1; k--) {
    const m = new Date(Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1 - k, 1)).toISOString().slice(0, 7);
    if (`${m}-01` < first) continue;
    const dim = daysInMonth(`${m}-01`), cut = `${m}-${String(Math.min(dom, dim)).padStart(2, "0")}`, inM = pr.filter((r) => r.date.slice(0, 7) === m), from = addDays(cut, 1 - days);
    const p = sum(inM.filter((r) => r.date <= cut).map(c)) + (sum(pr.filter((r) => r.date >= from && r.date <= cut).map(c)) / days) * (dim - +cut.slice(8, 10));
    if (p > 0) ratios.push(sum(inM.map(c)) / p);
  }
  if (ratios.length < 4) return null;
  let held = 0, tested = 0;
  for (let i = Math.max(3, ratios.length - 8); i < ratios.length; i++) {
    const prev = ratios.slice(0, i); tested++;
    if (ratios[i] >= quantile(prev, 0.25) && ratios[i] <= quantile(prev, 0.75)) held++;
  }
  return { lo: projected * quantile(ratios, 0.25), hi: projected * quantile(ratios, 0.75), held, tested, months: ratios.length };
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

export interface Alert { id: string; date?: string; sev: "bad" | "warn"; text: string; filter?: Filter; secret?: string[] }
/** Threshold breaches from existing data: struggle rate over 10% in the last 4 weeks (the brief's struggled definition, >= MIN_N sessions with a prompt), open secret findings, cost anomalies in the window (|z| >= attention's line). */
export function alerts(d: DashboardData, rows: SessionRow[], win: Win): Alert[] {
  const out: Alert[] = [], from = win.to ? addDays(win.to, -27) : "", r = struggledRate(rows.filter((x) => x.date >= from && x.date <= win.to));
  if (win.to && r.p !== null && r.n >= MIN_N && r.p > STRUGGLE_LINE) out.push({ id: "struggle", sev: "bad", text: `Struggle rate ${fmtPct(r.p, 1)} in the last 4 weeks (${fmtInt(r.k)} of ${fmtInt(r.n)} sessions), over the ${fmtPct(STRUGGLE_LINE)} line`, filter: { struggled: true, from } });
  const sec = d.exposure.items.filter((i) => i.status === "open" && i.category === "secret"), ids = [...new Set(sec.flatMap((i) => (i.session ? [i.session] : [])))];
  if (sec.length) out.push({ id: "secret", sev: "bad", text: `${fmtInt(sec.length)} open secret finding${sec.length === 1 ? "" : "s"}${ids.length ? ` in ${fmtInt(ids.length)} session${ids.length === 1 ? "" : "s"}` : ""}`, secret: ids });
  d.anomalies.filter((a) => win.to && a.metric === "cost" && Math.abs(a.z) >= TH.z && a.date >= win.from && a.date <= win.to).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    .forEach((a) => out.push({ id: `cost-${a.date}`, date: a.date, sev: Math.abs(a.z) >= TH.zHigh ? "bad" : "warn", text: `Cost spike ${fmtDate(a.date)}: ${fmtUSD(a.value)} (z ${a.z.toFixed(1)})`, filter: { from: a.date, to: a.date } }));
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

export interface Factor { key: "volume" | "mix" | "size" | "topic" | "residual"; label: string; usd: number }
export interface Autopsy { spike: number; baseline: number; delta: number; days: number; factors: Factor[]; omitted: string[] }
/** Spike autopsy: spike-day priced cost minus the median daily priced cost of the other non-spike days in [from, to] (spikes by trend.spikes), split by a chained attribution so volume + mix + size + topic + residual = delta exactly.
 *  Baseline per-day prompts P0 = pooled prompts / days; u0 = pooled cost / pooled prompts; tau = tokens per prompt. Spike day: P1, tau1, model shares m1.
 *  volume = (P1-P0)*u0 -> s=P1*u0; mix = P1*sum(m1_k*u0_k) - s (u0_k = baseline cost/prompt of model k, u0 if unseen) -> s updated; size = s*(tau1/tau0-1) -> s*=tau1/tau0;
 *  topic = cost of spike rows in clusters absent from baseline - their prompts*s/P1; residual = delta - the rest (incl. baseline mean vs median, price changes).
 *  A factor whose field is missing (model, cluster >= 0, tokens) is omitted and named in `omitted`. null = nothing honest to say. */
export function autopsy(rows: SessionRow[], date: string, from: string, to: string): Autopsy | null {
  const by = new Map<string, SessionRow[]>();
  for (const r of priced(rows)) if (r.date >= from && r.date <= to) by.set(r.date, [...(by.get(r.date) ?? []), r]);
  const S = by.get(date), days = [...by.keys()], cost = (rs: SessionRow[]) => sum(rs.map((r) => r.cost_usd as number)), pr = (rs: SessionRow[]) => sum(rs.map((r) => r.prompts));
  if (!S) return null;
  const hot = new Set(spikes(days.map((d) => cost(by.get(d)!))).map((i) => days[i])), bd = days.filter((d) => d !== date && !hot.has(d));
  const B = bd.flatMap((d) => by.get(d)!), C0 = cost(B), P0t = pr(B), P1 = pr(S), C1 = cost(S);
  if (!bd.length || !(C0 > 0) || !(P0t > 0) || !(P1 > 0)) return null;
  const baseline = median(bd.map((d) => cost(by.get(d)!))), delta = C1 - baseline, u0 = C0 / P0t, tau0 = sum(B.map((r) => r.tokens)) / P0t, tau1 = sum(S.map((r) => r.tokens)) / P1;
  const factors: Factor[] = [], omitted: string[] = [];
  let s = P1 * u0;
  factors.push({ key: "volume", label: "Volume", usd: (P1 - P0t / bd.length) * u0 });
  if (S.some((r) => r.model != null) && B.some((r) => r.model != null)) {
    const unit = new Map<string, number[]>(), k = (r: SessionRow) => r.model ?? "unknown";
    for (const r of B) { const e = unit.get(k(r)) ?? [0, 0]; e[0] += r.cost_usd as number; e[1] += r.prompts; unit.set(k(r), e); }
    const next = sum(S.map((r) => { const e = unit.get(k(r)); return r.prompts * (e && e[1] > 0 ? e[0] / e[1] : u0); }));
    factors.push({ key: "mix", label: "Model mix", usd: next - s }); s = next;
  } else omitted.push("model mix (no model field)");
  if (tau0 > 0) { factors.push({ key: "size", label: "Prompt size", usd: s * (tau1 / tau0 - 1) }); s *= tau1 / tau0; } else omitted.push("prompt size (no baseline tokens)");
  if (S.some((r) => r.cluster >= 0) && B.some((r) => r.cluster >= 0)) {
    const seen = new Set(B.map((r) => r.cluster)), N = S.filter((r) => r.cluster >= 0 && !seen.has(r.cluster));
    factors.push({ key: "topic", label: "New topic", usd: cost(N) - (pr(N) * s) / P1 });
  } else omitted.push("new topic (no topic cluster field)");
  factors.push({ key: "residual", label: "Residual", usd: delta - sum(factors.map((f) => f.usd)) });
  return { spike: C1, baseline, delta, days: bd.length, factors, omitted };
}
