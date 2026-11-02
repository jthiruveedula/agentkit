// Shift-share attribution of a struggled-rate change: mix vs rate per segment, sums exact. Pure.
// M = sum_k w_k r_k with w_k = D_k/D (sessions with a prompt), r_k = struggled share of segment k.
// Per segment: mix = (w1-w0)(r0-M0), rate = w1(r1-r0); sum over all segments (Other included) = M1-M0 exactly.
// New segment: r0 := r1 (rate 0, all mix). Vanished: r1 := r0.
import type { SessionRow } from "../data/types";
import { struggled } from "./metrics";

export type SegKey = "project" | "intent" | "source" | "project+intent";
export const MIN_SEG = 5;       // folded into Other below this in both windows
export const MIN_HEADLINE = 15; // headline driver needs this in both windows
export const MAX_PROJECTS = 8;

export interface Driver { key: string; project?: string; intent?: string; n0: number; n1: number; r0: number | null; r1: number | null; mix: number; rate: number; total: number }
export interface Attribution { m0: number | null; m1: number | null; delta: number; drivers: Driver[]; other: Driver | null; headline: Driver | null }

const keyOf = (r: SessionRow, k: SegKey) => (k === "project+intent" ? `${r.project} / ${r.intent}` : r[k]);

export function attribute(cur: SessionRow[], prior: SessionRow[], by: SegKey): Attribution {
  type A = { d0: number; s0: number; d1: number; s1: number; p?: { project?: string; intent?: string } };
  const seg = new Map<string, A>();
  const add = (rows: SessionRow[], now: boolean) => {
    for (const r of rows) {
      if (r.prompts <= 0) continue;
      const a = seg.get(keyOf(r, by)) ?? { d0: 0, s0: 0, d1: 0, s1: 0, p: { ...(by === "project" || by === "project+intent" ? { project: r.project } : {}), ...(by === "intent" || by === "project+intent" ? { intent: r.intent } : {}) } };
      if (now) { a.d1++; if (struggled(r)) a.s1++; } else { a.d0++; if (struggled(r)) a.s0++; }
      seg.set(keyOf(r, by), a);
    }
  };
  add(prior, false); add(cur, true);
  let D0 = 0, D1 = 0, S0 = 0, S1 = 0;
  for (const a of seg.values()) { D0 += a.d0; D1 += a.d1; S0 += a.s0; S1 += a.s1; }
  if (!D0 || !D1) return { m0: D0 ? S0 / D0 : null, m1: D1 ? S1 / D1 : null, delta: 0, drivers: [], other: null, headline: null };
  const M0 = S0 / D0, M1 = S1 / D1;

  // fold: small segments (and projects past the cap) pool into Other
  const sorted = [...seg].sort((x, y) => y[1].d0 + y[1].d1 - (x[1].d0 + x[1].d1));
  const cap = by === "project" ? MAX_PROJECTS : Infinity;
  const keep: [string, A][] = [], oth: A = { d0: 0, s0: 0, d1: 0, s1: 0 };
  for (const e of sorted) {
    if (keep.length < cap && (e[1].d0 >= MIN_SEG || e[1].d1 >= MIN_SEG)) keep.push(e);
    else { oth.d0 += e[1].d0; oth.s0 += e[1].s0; oth.d1 += e[1].d1; oth.s1 += e[1].s1; }
  }
  const mk = (key: string, a: A): Driver => {
    const w0 = a.d0 / D0, w1 = a.d1 / D1;
    const r0 = a.d0 ? a.s0 / a.d0 : null, r1 = a.d1 ? a.s1 / a.d1 : null;
    const e0 = r0 ?? r1 ?? 0, e1 = r1 ?? r0 ?? 0;
    const mix = (w1 - w0) * (e0 - M0), rate = w1 * (e1 - e0);
    return { key, ...a.p, n0: a.d0, n1: a.d1, r0, r1, mix, rate, total: mix + rate };
  };
  const drivers = keep.map(([k, a]) => mk(k, a)).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const other = oth.d0 + oth.d1 ? mk("Other", oth) : null;
  const delta = M1 - M0;
  const headline = drivers.find((d) => d.n0 >= MIN_HEADLINE && d.n1 >= MIN_HEADLINE && Math.sign(d.total) === Math.sign(delta)) ?? null;
  return { m0: M0, m1: M1, delta, drivers, other, headline };
}

/** The k biggest drivers plus one "Other" row that folds in the rest and the original Other, so the rows add up to `a.delta`. */
export function topDrivers(a: Attribution, k = 4): Driver[] {
  const rest = [...a.drivers.slice(k), ...(a.other ? [a.other] : [])];
  if (!rest.length) return a.drivers.slice(0, k);
  const sum = (f: (d: Driver) => number) => rest.reduce((t, d) => t + f(d), 0);
  const n0 = sum((d) => d.n0), n1 = sum((d) => d.n1);
  const r = (n: number, f: (d: Driver) => number | null, g: (d: Driver) => number) => (n ? sum((d) => (f(d) ?? 0) * g(d)) / n : null);
  return [...a.drivers.slice(0, k), { key: "Other", n0, n1, r0: r(n0, (d) => d.r0, (d) => d.n0), r1: r(n1, (d) => d.r1, (d) => d.n1), mix: sum((d) => d.mix), rate: sum((d) => d.rate), total: sum((d) => d.total) }];
}
