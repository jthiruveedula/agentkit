// Bundle 3 insights: applied rate by session length, net value per intent, spend on repeated prompts. Pure.
import type { Repeat, SessionRow } from "../data/types";
import { costPerApplied, median, wilson } from "./compare";
import { repeatCost } from "./repeats";
import { MIN_N } from "./thresholds";
import { isChangeWork } from "./baseline";

export interface Bucket { label: string; n: number; k: number; rate: number | null; lo: number; hi: number }
const SPANS: [number, number, string][] = [[1, 2, "1–2"], [3, 5, "3–5"], [6, 10, "6–10"], [11, 20, "11–20"], [21, Infinity, "21+"]];
const bucket = (label: string, xs: SessionRow[]): Bucket => {
  const n = xs.length, k = xs.filter((r) => r.applied).length, [lo, hi] = wilson(k, n);
  return { label, n, k, rate: n ? k / n : null, lo, hi };
};

/** Change sessions (a prompt, not explain), bucketed by prompt count, with the applied rate and its 95% Wilson CI.
 *  Explain sessions rarely apply anything, so they would drag every bucket down. */
export const promptBuckets = (rows: SessionRow[]): Bucket[] => {
  const xs = rows.filter(isChangeWork);
  return SPANS.map(([a, b, label]) => bucket(label, xs.filter((r) => r.prompts >= a && r.prompts <= b)));
};

/** Change sessions only. Past 10 prompts (pooled) against 6-10. `flat` when the pooled rate is not clearly higher (the Wilson CIs overlap, or it is lower).
 *  null when either side has fewer than MIN_N sessions. */
export function noGain(rows: SessionRow[]): { over: Bucket; mid: Bucket; flat: boolean } | null {
  rows = rows.filter(isChangeWork);
  const mid = bucket("6–10", rows.filter((r) => r.prompts >= 6 && r.prompts <= 10)), over = bucket("11+", rows.filter((r) => r.prompts > 10));
  if (mid.n < MIN_N || over.n < MIN_N) return null;
  return { over, mid, flat: over.lo <= mid.hi };
}

export interface IntentValue { intent: SessionRow["intent"]; n: number; applied: number; rate: number; cpa: number | null; medPrompts: number }
/** Per intent, sessions with a prompt only (explain keeps its own row; its applied rate is near 0 by nature): sessions, applied rate, priced cost per applied change (null when no priced applied session), median prompts.
 *  Cheapest per applied change first; intents with no cost per applied last, then by sessions. */
export function netValue(rows: SessionRow[]): IntentValue[] {
  const by = new Map<SessionRow["intent"], SessionRow[]>();
  for (const r of rows) if (r.prompts > 0) by.set(r.intent, [...(by.get(r.intent) ?? []), r]);
  return [...by].map(([intent, xs]) => {
    const applied = xs.filter((r) => r.applied).length;
    return { intent, n: xs.length, applied, rate: applied / xs.length, cpa: costPerApplied(xs).value, medPrompts: median(xs.map((r) => r.prompts)) };
  }).sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity) || b.n - a.n);
}

/** Spend across every session a repeated prompt appears in, each session counted once, plus the costliest cluster.
 *  Ranked by dollars when any session is priced, else by tokens. */
export function repeatSpend(reps: Repeat[], byId: Map<string, Pick<SessionRow, "tokens" | "cost_usd">>) {
  const ids = [...new Set(reps.flatMap((r) => r.sessions))].filter((i) => byId.has(i));
  const total = repeatCost(ids, byId), per = reps.map((r) => ({ r, ...repeatCost(r.sessions, byId) }));
  const val = (x: (typeof per)[number]) => (total.cost !== null ? x.cost ?? 0 : x.tokens);
  const top = per.reduce<(typeof per)[number] | null>((m, x) => (m === null || val(x) > val(m) ? x : m), null);
  return { ...total, sessions: ids.length, top };
}
