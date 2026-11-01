// Unit economics: the tool router (which tool lands each kind of change) and golden hours (when work lands). Pure, no DOM.
import type { DashboardData, SessionRow } from "../data/types";
import { wilson } from "./compare";

import { ROUTER_MIN_N } from "./thresholds";
export { ROUTER_MIN_N };
/** `source` is the column key: the tool, or the project when the view holds a single tool. `lb` = Wilson 95% lower bound. */
export interface RouterCell { source: string; intent: string; n: number; applied: number; rate: number; lb: number; loops: number; ttr: number | null; enough: boolean }
export interface Router { sources: string[]; intents: string[]; cells: Map<string, RouterCell>; best: Map<string, RouterCell> }

/** Column x intent over sessions with a prompt (column = tool by default): applied rate, mean loops, all-sessions median TTR when exported.
 *  `best` per intent: needs two qualifying columns (n >= minN), a top rate that does not round to 0%, and the top cell's
 *  Wilson lower bound above the runner-up's rate. Anything less is "no clear winner". */
export function router(rows: SessionRow[], ttr: DashboardData["ttr"] = [], minN = ROUTER_MIN_N, col: (r: SessionRow) => string = (r) => r.source): Router {
  const acc = new Map<string, { source: string; intent: string; n: number; applied: number; loops: number }>();
  for (const r of rows) {
    if (r.prompts <= 0) continue;
    const key = col(r), k = `${key}|${r.intent}`, c = acc.get(k) ?? { source: key, intent: r.intent, n: 0, applied: 0, loops: 0 };
    c.n++; c.applied += r.applied ? 1 : 0; c.loops += r.loops; acc.set(k, c);
  }
  const tt = new Map(ttr.map((t) => [`${t.source}|${t.intent}`, t.median_min]));
  const cells = new Map([...acc].map(([k, c]) => [k, { ...c, rate: c.applied / c.n, lb: wilson(c.applied, c.n)[0], loops: c.loops / c.n, ttr: tt.get(k) ?? null, enough: c.n >= minN }]));
  const sources = [...new Set([...cells.values()].map((c) => c.source))], intents = [...new Set([...cells.values()].map((c) => c.intent))];
  const best = new Map<string, RouterCell>();
  for (const i of intents) {
    const ok = [...cells.values()].filter((c) => c.intent === i && c.enough).sort((a, b) => b.rate - a.rate || b.n - a.n);
    if (ok.length >= 2 && ok[0].rate >= 0.005 && ok[0].lb > ok[1].rate) best.set(i, ok[0]);   // ties, 0% and overlapping CIs name no winner
  }
  return { sources, intents, cells, best };
}

import { GOLD_ALPHA, GOLD_MIN_N } from "./thresholds";
import { zCrit } from "./stats";
export { GOLD_MIN_N };
export interface Golden { rate: (number | null)[][]; n: number[][]; /** rate minus the baseline that excludes the cell itself (null where no rate) */ dev: (number | null)[][]; base: number; peak: number; maxUp: number; maxDown: number; tested: number; z: number; best: { dow: number; hour: number; rate: number; n: number; lb: number; base: number }[] }
/** Applied rate per weekday x hour from hour_week[].sessions/.applied (schema 1.1+). null for older exports or the field missing.
 *  Cells with n < minN get no rate. Up to k hours qualify as `best` when their Wilson lower bound beats the baseline of ALL OTHER hours,
 *  with the interval widened for the number of cells tested (Bonferroni, familywise alpha = GOLD_ALPHA), so with 100+ cells a lucky one rarely wins.
 *  Descriptive: hour mix confounds with task mix. */
export function golden(hw: DashboardData["hour_week"], minN = GOLD_MIN_N, k = 3): Golden | null {
  if (!hw.some((c) => typeof c.applied === "number" && typeof c.sessions === "number")) return null;
  const n = Array.from({ length: 7 }, () => Array<number>(24).fill(0)), a = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const c of hw) if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) { n[c.dow][c.hour] += c.sessions ?? 0; a[c.dow][c.hour] += c.applied ?? 0; }
  const N = n.flat().reduce((x, y) => x + y, 0), A = a.flat().reduce((x, y) => x + y, 0);
  const tested = n.flat().filter((m) => m >= minN).length, z = zCrit(GOLD_ALPHA / Math.max(1, tested));
  const other = (d: number, h: number) => (N - n[d][h] > 0 ? (A - a[d][h]) / (N - n[d][h]) : 0);
  const rate = n.map((row, d) => row.map((m, h) => (m >= minN ? a[d][h] / m : null)));
  const dev = rate.map((row, d) => row.map((x, h) => (x === null ? null : x - other(d, h))));
  const best = n.flatMap((row, dow) => row.map((m, hour) => ({ dow, hour, n: m, rate: m ? a[dow][hour] / m : 0, lb: wilson(a[dow][hour], m, z)[0], base: other(dow, hour) })))
    .filter((c) => c.n >= minN && c.lb > c.base).sort((x, y) => y.lb - y.base - (x.lb - x.base) || y.n - x.n).slice(0, k);
  const flat = dev.flat().filter((x): x is number => x !== null);
  const peak = Math.max(0, ...rate.flat().filter((x): x is number => x !== null));
  return { rate, n, dev, base: N ? A / N : 0, peak, maxUp: Math.max(0, ...flat), maxDown: Math.max(0, ...flat.map((x) => -x)), tested, z, best };
}

