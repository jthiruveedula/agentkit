// One selector for "share of X" across the Overview "Where it went" card, the Markdown summary and the map hotspot chips,
// so they all use the same denominator: the total of the basis over every session in view.
import type { SessionRow } from "../data/types";

export type Basis = "cost" | "tokens" | "sessions" | "prompts";
/** Caption naming what a share is a share of. */
export const BASIS_NOTE: Record<Basis, string> = { cost: "share of priced cost", tokens: "share of tokens", sessions: "% of sessions", prompts: "% of prompts" };
/** Sessions with no project cannot be filtered to (an empty project is not stored in the URL), so they get a label and no filter. */
export const NO_PROJECT = "(no project)";
const val = (b: Basis) => (r: SessionRow) => (b === "cost" ? r.cost_usd ?? 0 : b === "tokens" ? r.tokens : b === "prompts" ? r.prompts : 1);

export interface ShareRow { key: string; value: number; share: number; sessions: number; priced: number; friction: number | null; perSession: number | null }
export interface Shares { basis: Basis; total: number; rows: ShareRow[]; unpriced: number; sessions: number }

/** Group `rows` by `key`, rank by `basis`, share = value / total over ALL rows in view. Friction is the mean over sessions with a prompt. */
export function shares(rows: SessionRow[], key: (r: SessionRow) => string, basis: Basis): Shares {
  const v = val(basis), by = new Map<string, { value: number; n: number; priced: number; asked: number; fsum: number }>();
  for (const r of rows) {
    const k = key(r), g = by.get(k) ?? { value: 0, n: 0, priced: 0, asked: 0, fsum: 0 };
    g.value += v(r); g.n++; if (r.cost_usd !== null) g.priced++; if (r.prompts > 0) { g.asked++; g.fsum += r.friction; }
    by.set(k, g);
  }
  const total = [...by.values()].reduce((a, g) => a + g.value, 0);
  const out = [...by].map(([k, g]) => {
    const den = basis === "cost" ? g.priced : g.n;
    return { key: k, value: g.value, share: total > 0 ? g.value / total : 0, sessions: g.n, priced: g.priced, friction: g.asked ? g.fsum / g.asked : null, perSession: den ? g.value / den : null };
  }).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  return { basis, total, rows: out, unpriced: rows.filter((r) => r.cost_usd === null).length, sessions: rows.length };
}

export const projectKey = (r: SessionRow) => r.project || NO_PROJECT;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
/** Median friction across the groups in a dimension, and the group (with >= 3 sessions) furthest above it by at least `gap`. */
export function frictionOutlier(rows: ShareRow[], gap = 0.1): { median: number | null; outlier: ShareRow | null } {
  const med = median(rows.flatMap((r) => (r.friction === null ? [] : [r.friction])));
  if (med === null) return { median: null, outlier: null };
  const top = rows.filter((r) => r.friction !== null && r.sessions >= 3 && (r.friction as number) - med >= gap).sort((a, b) => (b.friction as number) - (a.friction as number))[0];
  return { median: med, outlier: top ?? null };
}
