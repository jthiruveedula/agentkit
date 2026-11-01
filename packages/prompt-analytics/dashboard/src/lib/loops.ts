// Loop breaker: applied (success) rate by rephrase-loop count, with Wilson 95% CIs, over change work only
// (feature / bugfix / refactor sessions with >= 2 prompts: a one-shot question can't loop), plus a stopping rule read off the curve. Pure, no DOM.
import type { SessionRow } from "../data/types";
import { wilson } from "./compare";
import { diffCI, pts } from "./stats";
import { MAX_LOOPS } from "./filter";

/** Last bucket is "5+"; shared with the rephrase-loop histogram and the loops filter. */
export const LOOP_TOP = MAX_LOOPS;
import { LOOP_MIN_N } from "./thresholds";
export { LOOP_MIN_N };
export const CHANGE_INTENTS: ReadonlySet<string> = new Set(["feature", "bugfix", "refactor"]);
export const isChange = (r: SessionRow) => CHANGE_INTENTS.has(r.intent) && r.prompts >= 2;
export interface LoopBucket { k: number; label: string; n: number; ok: number; rate: number; lo: number; hi: number; enough: boolean }

/** Buckets 0..LOOP_TOP-1 and LOOP_TOP+ over change sessions with >= 2 prompts. */
export function loopCurve(rows: SessionRow[], minN = LOOP_MIN_N): LoopBucket[] {
  const n = new Array<number>(LOOP_TOP + 1).fill(0), ok = new Array<number>(LOOP_TOP + 1).fill(0);
  for (const r of rows) { if (!isChange(r)) continue; const k = Math.min(LOOP_TOP, Math.max(0, r.loops)); n[k]++; if (r.applied) ok[k]++; }
  return n.map((m, k) => {
    const [lo, hi] = wilson(ok[k], m);
    return { k, label: k === LOOP_TOP ? `${LOOP_TOP}+` : String(k), n: m, ok: ok[k], rate: m ? ok[k] / m : 0, lo, hi, enough: m >= minN };
  });
}

const reph = (k: number) => `${k} rephrase${k === 1 ? "" : "s"}`;
/** Peak = the fewest rephrases whose CI still overlaps the best bucket's (so noise never pushes the peak right).
 *  Stop = the first later bucket whose rate is clearly below the peak bucket's: the CI of the DIFFERENCE (Newcombe, stop minus peak) is entirely below 0, i.e. CI compared to CI, not to a point.
 *  `significant` is false when no such bucket exists: the UI then names no peak. null when no bucket has enough data. */
export function stopRule(curve: LoopBucket[]): { peak: LoopBucket; stop: LoopBucket | null; after: number | null; significant: boolean; text: string; effect: { diff: number; lo: number; hi: number } | null } | null {
  const ok = curve.filter((b) => b.enough);
  if (!ok.length) return null;
  const max = ok.reduce((a, b) => (b.rate > a.rate ? b : a));
  const peak = ok.find((b) => b.hi >= max.lo) ?? max;
  const dc = (b: LoopBucket) => diffCI(b.ok, b.n, peak.ok, peak.n);
  const stop = curve.find((b) => b.k > peak.k && b.enough && dc(b).hi < 0) ?? null, effect = stop ? dc(stop) : null;
  const after = stop ? Math.max(peak.k, stop.k - 1) : null;
  return { peak, stop, after, significant: stop !== null, effect,
    text: stop ? `Sessions with ${stop.k}+ rephrases land less often (association)` : "No clear gain or loss from rephrasing yet" };
}

/** Rephrasing vs none: bucket 0 against the pooled 1+ buckets, two-proportion CI on the difference (pooled minus none).
 *  null when either side has fewer than `minN` sessions. */
export function rephraseEffect(curve: LoopBucket[], minN = LOOP_MIN_N): { diff: number; lo: number; hi: number; clear: boolean; n0: number; n1: number; text: string } | null {
  const z = curve[0], rest = curve.slice(1), n1 = rest.reduce((a, b) => a + b.n, 0), k1 = rest.reduce((a, b) => a + b.ok, 0);
  if (!z || z.n < minN || n1 < minN) return null;
  const e = diffCI(k1, n1, z.ok, z.n), ci = `CI ${pts(e.lo)} to ${pts(e.hi)}`.replace(/ pts/g, "");
  return { ...e, n0: z.n, n1, text: e.clear ? `${pts(e.diff)} (${ci} pts)` : `inconclusive (${ci} pts)` };
}

/** Lead sentence for the loop breaker. When the pooled CI excludes zero it says so (never "no clear gain"); the per-bucket stop rule is a separate note.
 *  `n` is every session in the comparison (none + 1+), the same pool the sentence's two counts add up to. */
export function loopHeadline(eff: ReturnType<typeof rephraseEffect>): { text: string; n: number } | null {
  if (!eff) return null;
  const n = eff.n0 + eff.n1, ci = `95% CI ${pts(eff.lo).replace(" pts", "")} to ${pts(eff.hi)}`;
  return { n, text: eff.clear ? `Sessions that rephrase apply ${Math.abs(Math.round(eff.diff * 100))} pts ${eff.diff > 0 ? "more" : "less"} often (${ci}), confounded by task difficulty` : `Rephrasing and applying are not clearly related (${pts(eff.diff)}, ${ci})` };
}
