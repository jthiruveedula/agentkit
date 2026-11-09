// Overview key numbers and usage mix: spend with priced coverage, tokens, share by model and by tier, spend and tokens by
// tool, the "costs above its weight" line, and the KPI deltas on the brief's comparison basis. Pure, no DOM.
import type { SessionRow, Source } from "../data/types";
import type { Basis } from "./brief";
import { costPerApplied, dayDiff, delta, median, MIN_PRIOR_N, wilson, type Win } from "./compare";
import { appliedRate, spendOutliers } from "./baseline";
import { rateOf, type Rate } from "./metrics";
import { tierOf } from "./models";
import { MIN_N, PRICING_SHARE_TOL } from "./thresholds";
import { pts } from "./stats";

const isPriced = (r: SessionRow) => r.cost_usd != null;
const priced = (rs: SessionRow[]) => rs.filter(isPriced);
const sum = (rs: SessionRow[], f: (r: SessionRow) => number) => rs.reduce((a, r) => a + f(r), 0);

/** Priced spend, or null when no session in `rs` is priced (a gap in a chart, never $0). */
export const pricedSum = (rs: SessionRow[]): number | null => { const p = priced(rs); return p.length ? sum(p, (r) => r.cost_usd as number) : null; };

/** Total priced spend and how much of the view it covers. `cost` is null when nothing is priced. */
export function spendTotal(rows: SessionRow[]): { cost: number | null; priced: number; n: number; coverage: number } {
  const p = priced(rows).length;
  return { cost: pricedSum(rows), priced: p, n: rows.length, coverage: rows.length ? p / rows.length : 0 };
}

/** Total tokens, and the mean per session that recorded any (a tool that logs 0 tokens is not counted as a light session). */
export function tokenTotal(rows: SessionRow[]): { total: number; counted: number; perSession: number | null } {
  const c = rows.filter((r) => r.tokens > 0), total = sum(c, (r) => r.tokens);
  return { total, counted: c.length, perSession: c.length ? total / c.length : null };
}

export type MixBy = "sessions" | "tokens" | "spend";
/** "" is the unknown-model key, matching the `model` filter ("" = unknown). `priced` counts the slice's priced sessions. */
export interface Slice { key: string; label: string; kind: "model" | "other" | "unknown"; value: number; share: number; sessions: number; priced: number; models?: number }
export interface Mix { by: MixBy; total: number; slices: Slice[]; top: Slice | null; unpriced: number }

/** Share by model. Which models get a slice, and their order, is fixed by session count whatever the measure, so slices never jump
 *  when the measure switches: the top `k` known models, the rest as "Other" (only when 2+ remain; a lone remainder keeps its name),
 *  then "Unknown" (no model id). Spend sums priced sessions only; `unpriced` says how many were left out. `top` is the largest model by the measure. */
export function modelMix(rows: SessionRow[], by: MixBy, k = 5): Mix {
  const val = (r: SessionRow) => (by === "sessions" ? 1 : by === "tokens" ? r.tokens : r.cost_usd ?? 0);
  const m = new Map<string, { value: number; sessions: number; priced: number }>();
  for (const r of rows) {
    const key = r.model || "", e = m.get(key) ?? { value: 0, sessions: 0, priced: 0 };
    e.value += val(r); e.sessions++; if (isPriced(r)) e.priced++; m.set(key, e);
  }
  const total = [...m.values()].reduce((a, e) => a + e.value, 0), share = (v: number) => (total > 0 ? v / total : 0);
  const known = [...m].filter(([key]) => key).sort((a, b) => b[1].sessions - a[1].sessions || a[0].localeCompare(b[0]));
  const head = known.length - k >= 2 ? known.slice(0, k) : known, rest = known.slice(head.length);
  const slices: Slice[] = head.map(([key, e]) => ({ key, label: key, kind: "model", ...e, share: share(e.value) }));
  if (rest.length) {
    const add = (f: "value" | "sessions" | "priced") => rest.reduce((a, [, e]) => a + e[f], 0);
    slices.push({ key: "other", label: "Other", kind: "other", value: add("value"), share: share(add("value")), sessions: add("sessions"), priced: add("priced"), models: rest.length });
  }
  const u = m.get("");
  if (u) slices.push({ key: "", label: "Unknown", kind: "unknown", ...u, share: share(u.value) });
  const top = slices.filter((s) => s.kind === "model" && s.value > 0).reduce<Slice | null>((a, s) => (!a || s.value > a.value ? s : a), null);
  return { by, total, slices, top, unpriced: by === "spend" ? rows.length - priced(rows).length : 0 };
}

/** The model whose share of priced spend most exceeds its share of priced tokens, when the gap is at least `gap` (8 pts).
 *  Both shares are over priced sessions, so an unpriced tool cannot fake a cheap model. */
export function aboveWeight(rows: SessionRow[], gap = 0.08): { model: string; tok: number; spend: number } | null {
  const p = priced(rows), tt = sum(p, (r) => r.tokens), ct = sum(p, (r) => r.cost_usd as number);
  if (tt <= 0 || ct <= 0) return null;
  const by = new Map<string, { t: number; c: number }>();
  for (const r of p) if (r.model) { const e = by.get(r.model) ?? { t: 0, c: 0 }; e.t += r.tokens; e.c += r.cost_usd as number; by.set(r.model, e); }
  let best: { model: string; tok: number; spend: number } | null = null;
  for (const [model, e] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
    const tok = e.t / tt, spend = e.c / ct;
    if (spend - tok >= gap && (!best || spend - tok > best.spend - best.tok)) best = { model, tok, spend };
  }
  return best;
}

/** Sessions, tokens and priced spend by model tier: [Small, Mid, Top, Unknown]. `spend` is null when nothing is priced. */
export function tierMix(rows: SessionRow[]): { sessions: number[]; tokens: number[]; spend: number[] | null } {
  const s = [0, 0, 0, 0], t = [0, 0, 0, 0], c = [0, 0, 0, 0];
  for (const r of rows) { const i = tierOf(r.model) ?? 3; s[i]++; t[i] += r.tokens; c[i] += r.cost_usd ?? 0; }
  return { sessions: s, tokens: t, spend: rows.some(isPriced) ? c : null };
}

export interface ToolRow { source: Source; sessions: number; tokens: number; cost: number | null; priced: number }
/** Spend and tokens per tool. `cost` is null when the tool priced nothing (unpriced, never $0); `priced` counts its priced sessions.
 *  Sorted by spend (unpriced last), then tokens. */
export function toolMix(rows: SessionRow[]): ToolRow[] {
  const m = new Map<Source, SessionRow[]>();
  for (const r of rows) m.set(r.source, [...(m.get(r.source) ?? []), r]);
  return [...m].map(([source, rs]) => ({ source, sessions: rs.length, tokens: sum(rs, (r) => r.tokens), cost: pricedSum(rs), priced: priced(rs).length }))
    .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokens - a.tokens || a.source.localeCompare(b.source));
}

export type KpiId = "sessions" | "spend" | "tokens" | "cpa" | "applied" | "exposed";
/** One KPI change. `pct` drives the arrow and tone (a relative change, or for rates a point change with `text` printing "pts").
 *  `unit`: "per week" when the sides span different lengths (sums compared per week), "per session" for tokens.
 *  `grey`: the change is not to be read as good or bad. "mixed" = the mean and the median (cost per applied) or spend with and
 *  without its outliers move in opposite directions; "within range" = the earlier rate sits inside the current rate's 95% Wilson interval.
 *  `med` = [earlier, current] median applied session cost; `alt` = the spend change without the `nOut` costliest sessions; `now`/`was` = rates. */
export interface KDelta { pct: number | "new"; text?: string; unit?: string; grey?: "mixed" | "within range"; med?: [number, number]; alt?: number; nOut?: number; now?: number; was?: number }

const opposite = (a: number, b: number) => Math.round(a * 100) * Math.round(b * 100) < 0;   // both move at least half a percent, in opposite directions
const medApplied = (rs: SessionRow[]) => { const a = priced(rs).filter((r) => r.applied).map((r) => r.cost_usd as number); return a.length ? median(a) : null; };

/** KPI deltas on the brief's basis (prior window, or the last 4 weeks vs the weeks before). A key is absent when there is nothing
 *  honest to show: no basis, too small a base (MIN_PRIOR_N sessions for sums and cost per applied, MIN_N on both sides for rates),
 *  or a priced share that differs by more than PRICING_SHARE_TOL (cost deltas). Sessions and spend are per week, tokens per session. */
export function kpiDeltas(bs: Basis, win: Win, open: Set<string>): Partial<Record<KpiId, KDelta>> {
  const out: Partial<Record<KpiId, KDelta>> = {}, cur = bs.cur, base = bs.base;
  if (!base || bs.mode === "none") return out;
  // split: the current side is the last 28 days, the base the days before the cut; the base's sums scale to the current length
  const cut = bs.mode === "split" ? bs.cut : undefined, kk = cut ? (dayDiff(cut, win.to) + 1) / Math.max(1, dayDiff(win.from, cut)) : 1;
  const unit = cut ? { unit: "per week" } : {};
  const rel = (c: number, b: number, n: number): KDelta | null => { const x = delta(c, b * kk, n); return x && { pct: x.kind === "new" ? "new" : x.pct, ...unit }; };
  const rate = (a: Rate, b: Rate): KDelta | null => {
    if (a.p === null || b.p === null || a.n < MIN_N || b.n < MIN_N) return null;
    const [lo, hi] = wilson(a.k, a.n);
    return { pct: a.p - b.p, text: pts(a.p - b.p, 1), now: a.p, was: b.p, ...(b.p >= lo && b.p <= hi ? { grey: "within range" as const } : {}) };
  };
  const put = (id: KpiId, x: KDelta | null) => { if (x) out[id] = x; };
  put("sessions", rel(cur.length, base.length, base.length));
  const t1 = tokenTotal(cur), t0 = tokenTotal(base);
  if (t1.perSession !== null && t0.perSession !== null) { const x = delta(t1.perSession, t0.perSession, t0.counted); if (x) out.tokens = { pct: x.kind === "new" ? "new" : x.pct, unit: "per session" }; }
  const s1 = spendTotal(cur), s0 = spendTotal(base), comparable = Math.abs(s1.coverage - s0.coverage) <= PRICING_SHARE_TOL;
  const sp = comparable && s1.cost !== null && s0.cost !== null ? rel(s1.cost, s0.cost, s0.priced) : null;
  if (sp && typeof sp.pct === "number") {   // the same change with the costliest sessions of both sides left out: opposite sign = driven by outliers
    const o = spendOutliers([...cur, ...base]), ids = new Set(o?.top.map((r) => r.id));
    const keep = (rs: SessionRow[]) => rs.filter((r) => !ids.has(r.id)), a = pricedSum(keep(cur)), b = pricedSum(keep(base));
    const x = o && a !== null && b !== null ? delta(a, b * kk, s0.priced) : null;
    if (x?.kind === "pct" && opposite(sp.pct, x.pct)) Object.assign(sp, { grey: "mixed", alt: x.pct, nOut: o!.top.length });
  }
  put("spend", sp);
  const c1 = costPerApplied(cur), c0 = costPerApplied(base);   // the movers' rule: MIN_PRIOR_N priced applied sessions on both sides
  if (comparable && c1.value !== null && c0.value !== null && c1.pricedApplied >= MIN_PRIOR_N && c0.pricedApplied >= MIN_PRIOR_N) {
    const x = delta(c1.value, c0.value, c0.pricedApplied);
    if (x) {
      const m1 = medApplied(cur), m0 = medApplied(base);
      out.cpa = { pct: x.kind === "new" ? "new" : x.pct, ...(m0 !== null && m1 !== null ? { med: [m0, m1] as [number, number] } : {}) };
      if (x.kind === "pct" && m0 !== null && m1 !== null && m0 > 0 && opposite(x.pct, m1 / m0 - 1)) out.cpa.grey = "mixed";
    }
  }
  put("applied", rate(appliedRate(cur), appliedRate(base)));
  const ex = (rs: SessionRow[]) => rateOf(rs.filter((r) => open.has(r.id)).length, rs.length);
  put("exposed", rate(ex(cur), ex(base)));
  return out;
}
