// Small shared stats and sign helpers. Pure, no DOM.
import { wilson } from "./compare";

import { MIN_N } from "./thresholds";
export { MIN_N };

/** Two-sided normal critical value for a given alpha (Abramowitz-Stegun 26.2.23, abs error < 5e-4). alpha 0.05 gives 1.96. */
export function zCrit(alpha: number): number {
  const p = Math.min(0.5, Math.max(1e-12, alpha / 2)), t = Math.sqrt(-2 * Math.log(p));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t ** 3);
}

/** "95% CI 41% to 63%" for k successes of n (Wilson). */
export function ciText(k: number, n: number): string {
  const [lo, hi] = wilson(k, n);
  return `95% CI ${Math.round(lo * 100)}% to ${Math.round(hi * 100)}%, n=${n}`;
}

/** Difference p1 - p0 in points with a Newcombe hybrid-score 95% CI (built from the two Wilson intervals). */
export function diffCI(k1: number, n1: number, k0: number, n0: number): { diff: number; lo: number; hi: number; clear: boolean } {
  const p1 = n1 ? k1 / n1 : 0, p0 = n0 ? k0 / n0 : 0, [l1, u1] = wilson(k1, n1), [l0, u0] = wilson(k0, n0);
  const diff = p1 - p0, lo = diff - Math.sqrt((p1 - l1) ** 2 + (u0 - p0) ** 2), hi = diff + Math.sqrt((u1 - p1) ** 2 + (p0 - l0) ** 2);
  return { diff, lo, hi, clear: lo > 0 || hi < 0 };
}

/** Points with the sign read off the ROUNDED value, so a -0.3 never prints "-0 pts". Zero prints "±0 pts". */
export function pts(x: number): string {
  const r = Math.round(x * 100);
  return r === 0 ? "±0 pts" : `${r > 0 ? "+" : "-"}${Math.abs(r)} pts`;
}
/** Percent change with the sign read off the rounded value; null for a rounded zero (callers print "flat"). */
export function pctChange(x: number): string | null {
  const r = Math.round(x * 100);
  return r === 0 ? null : `${r > 0 ? "+" : "-"}${Math.abs(r)}%`;
}
