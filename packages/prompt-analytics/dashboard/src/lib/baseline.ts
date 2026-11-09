// Baselines for the Overview charts and tiles: change-work applied rate, spend outliers, the "normal" band, driver totals. Pure.
import type { SessionRow } from "../data/types";
import type { Driver } from "./attribute";
import { median, quantile, topBy } from "./compare";
import { rateOf, type Rate } from "./metrics";
import { MIN_N } from "./thresholds";

/** Change work: a session with a prompt that is not a question (`explain` cannot apply a change). The applied rate's denominator. */
export const isChangeWork = (r: SessionRow) => r.prompts > 0 && r.intent !== "explain";

/** Applied rate over change work, plus the applied sessions that needed 3+ rephrase loops (outcome-weighted applied). */
export function appliedRate(rows: SessionRow[]): Rate & { looped: number } {
  let k = 0, n = 0, looped = 0;
  for (const r of rows) if (isChangeWork(r)) { n++; if (r.applied) { k++; if (r.loops >= 3) looped++; } }
  return { ...rateOf(k, n), looped };
}

/** Interquartile range of the non-null values (a sparkline's "normal" band); null under 4 values. */
export function iqr(xs: (number | null)[]): [number, number] | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length < 4 ? null : [quantile(v, 0.25), quantile(v, 0.75)];
}

/** The fewest top-cost sessions (k <= maxK) holding more than `share` of priced spend, with the median cost of applied priced sessions.
 *  null under MIN_N priced sessions (a handful of sessions always concentrates) or when no k qualifies. */
export function spendOutliers(rows: SessionRow[], maxK = 3, share = 0.3): { top: SessionRow[]; share: number; median: number | null } | null {
  const priced = rows.filter((r) => r.cost_usd !== null), total = priced.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  if (priced.length < MIN_N || total <= 0) return null;
  const top = topBy(priced, "cost_usd", maxK), ap = priced.filter((r) => r.applied).map((r) => r.cost_usd as number);
  let s = 0;
  for (let k = 0; k < top.length; k++) {
    s += top[k].cost_usd ?? 0;
    if (s / total > share) return { top: top.slice(0, k + 1), share: s / total, median: ap.length ? median(ap) : null };
  }
  return null;
}

/** Sum of driver contributions; with topDrivers' Other row it equals the attribution's delta. */
export const sumTotal = (ds: Driver[]) => ds.reduce((t, d) => t + d.total, 0);
