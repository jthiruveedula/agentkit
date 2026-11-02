// Shared rate metrics for the Briefing. Pure.
// Struggled = sessions with a prompt where loops >= 3 or friction >= 0.5.
import type { SessionRow } from "../data/types";
import { diffCI } from "./stats";

export interface Rate { k: number; n: number; p: number | null }

/** Struggled (decision #1): a session with a prompt where loops >= 3 or friction >= 0.5. Sessions without a prompt are not in the base. */
export const struggled = (r: SessionRow): boolean => r.prompts > 0 && (r.loops >= 3 || r.friction >= 0.5);

export const rateOf = (k: number, n: number): Rate => ({ k, n, p: n ? k / n : null });

/** Struggled rate over sessions with a prompt. p is null (not 0) when there are none. */
export function struggledRate(rows: SessionRow[]): Rate {
  let k = 0, n = 0;
  for (const r of rows) if (r.prompts > 0) { n++; if (struggled(r)) k++; }
  return rateOf(k, n);
}

/** Newcombe hybrid-score CI of a.p - b.p (a = now, b = before). null when either side is empty. */
export function diffRate(a: Rate, b: Rate): { diff: number; lo: number; hi: number } | null {
  if (!a.n || !b.n) return null;
  const { diff, lo, hi } = diffCI(a.k, a.n, b.k, b.n);
  return { diff, lo, hi };
}

/** A change is real when the CI excludes 0 and it moved >= 3 pts and >= 10% relative to before. */
export function isReal(a: Rate, b: Rate): boolean {
  const d = diffRate(a, b);
  if (!d || b.p === null) return false;
  const rel = b.p === 0 ? Infinity : Math.abs(d.diff) / b.p;
  return (d.lo > 0 || d.hi < 0) && Math.abs(d.diff) >= 0.03 && rel >= 0.1;
}
