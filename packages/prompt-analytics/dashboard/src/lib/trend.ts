// Comparison math for the trend chart: nice axis ticks, monotone curves, trailing median band, prior alignment, spikes, brush -> range.
// Pure functions over number arrays; no DOM, no React.
import type { SessionRow } from "../data/types";
import { quantile, median, dayDiff, type Bucket, type Win } from "./compare";
import { fmtCompact, fmtDate } from "./format";

/** A "nice" axis top (1/2/5 x 10^k step) and the ticks from 0 up to it. */
export function niceTicks(max: number, count = 4): { max: number; ticks: number[] } {
  if (!(max > 0) || !Number.isFinite(max)) return { max: 1, ticks: [0, 1] };
  const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const n = Math.ceil(max / step - 1e-9);
  return { max: +(n * step).toFixed(10), ticks: Array.from({ length: n + 1 }, (_, i) => +(i * step).toFixed(10)) };
}

/** Monotone cubic (Fritsch-Carlson, harmonic tangents) through points with strictly increasing x: never overshoots a data point. */
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => +v.toFixed(2);
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  const h = pts.slice(1).map((p, i) => p[0] - pts[i][0]), m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / h[i]);
  const t = pts.map((_, i) => {
    if (i === 0) return m[0];
    if (i === n - 1) return m[n - 2];
    if (m[i - 1] * m[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  });
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    let a = t[i], b = t[i + 1];
    if (m[i] === 0) { a = 0; b = 0; } else { const ka = a / m[i], kb = b / m[i], s = ka * ka + kb * kb; if (s > 9) { const q = 3 / Math.sqrt(s); a *= q; b *= q; } }
    d += `C${f(pts[i][0] + h[i] / 3)},${f(pts[i][1] + (a * h[i]) / 3)} ${f(pts[i + 1][0] - h[i] / 3)},${f(pts[i + 1][1] - (b * h[i]) / 3)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

/** Trailing median with p25 / p75 per index over the last `win` values (shorter at the start). */
export function rollingBand(xs: number[], win = 7): { lo: number[]; mid: number[]; hi: number[] } {
  const lo: number[] = [], mid: number[] = [], hi: number[] = [];
  xs.forEach((_, i) => { const w = xs.slice(Math.max(0, i - win + 1), i + 1); lo.push(quantile(w, 0.25)); mid.push(median(w)); hi.push(quantile(w, 0.75)); });
  return { lo, mid, hi };
}

/** Prior series aligned to the current buckets by offset; null where the prior is shorter. */
export const alignPrior = (cur: number[], prior: number[] | null): (number | null)[] | null => (prior ? cur.map((_, i) => prior[i] ?? null) : null);

/** Relative change of one bucket against its prior; "new" when the prior was 0, null when there is nothing to say. */
export function bucketDelta(cur: number, prior: number | null): number | "new" | null {
  if (prior === null) return null;
  if (prior === 0) return cur === 0 ? null : "new";
  return (cur - prior) / prior;
}

/** Upward spikes: robust z against the series median/MAD with a floor, so a flat series and tiny values never flag. */
export function spikes(xs: number[], z = 3.5): number[] {
  if (xs.length < 8) return [];
  const med = median(xs), mad = median(xs.map((x) => Math.abs(x - med))), top = Math.max(...xs);
  const floor = Math.max(mad, 0.1 * med, 0.05 * top, 1e-9);
  return xs.map((x, i) => (x > 0 && (0.6745 * (x - med)) / floor >= z ? i : -1)).filter((i) => i >= 0);
}

/** Bucket range picked on the x axis (any order) -> from/to dates. */
export function brushRange(bks: Bucket[], i0: number, i1: number): { from: string; to: string } {
  const a = Math.max(0, Math.min(i0, i1)), b = Math.min(bks.length - 1, Math.max(i0, i1));
  return { from: bks[a].from, to: bks[b].to };
}

/** Up to `k` evenly spaced label indices including first and last. */
export function labelIdx(n: number, k: number): number[] {
  if (n <= 0) return [];
  if (n <= k) return Array.from({ length: n }, (_, i) => i);
  return [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / (k - 1))))];
}

/** Leading tool of each bucket by `val`, with its share of the bucket. null for empty buckets. */
export function topToolByBucket(rows: SessionRow[], win: Win, step: 1 | 7, val: (r: SessionRow) => number): ({ src: string; share: number } | null)[] {
  const n = Math.ceil(win.days / step), by: Map<string, number>[] = Array.from({ length: n }, () => new Map());
  for (const r of rows) { const i = Math.floor(dayDiff(win.from, r.date) / step); if (i >= 0 && i < n) by[i].set(r.source, (by[i].get(r.source) ?? 0) + val(r)); }
  return by.map((m) => {
    const tot = [...m.values()].reduce((a, v) => a + v, 0);
    if (tot <= 0) return null;
    const [src, v] = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { src, share: v / tot };
  });
}

/** The last bucket is partial when it is shorter than a full step or reaches the export day (`asOf`, ISO), which was still running. */
export function partialLast(bks: Bucket[], step: 1 | 7, asOf: string): boolean {
  const b = bks.at(-1);
  return !!b && (dayDiff(b.from, b.to) + 1 < step || b.to >= asOf.slice(0, 10));
}

/** Index of the largest value among the first `upto` entries; -1 when they are all 0. */
export function peakIdx(xs: number[], upto = xs.length): number {
  let best = -1;
  for (let i = 0; i < Math.min(upto, xs.length); i++) if (xs[i] > 0 && (best < 0 || xs[i] > xs[best])) best = i;
  return best;
}

/** Sessions with no recorded price: excluded from cost sums (never counted as $0) and footnoted. */
export const unpricedCount = (rows: SessionRow[]) => rows.reduce((a, r) => a + (r.cost_usd === null ? 1 : 0), 0);

/** "Mar 3" for a day bucket, "Week of Mar 3" for a week bucket. */
export const bucketLabel = (b: Bucket, step: 1 | 7) => (step === 1 ? fmtDate(b.from) : `Week of ${fmtDate(b.from)}`);

/** Round dollar tick: whole dollars compact ($0, $20, $1.2k), cents only below $1 or off a whole step ($0.50). */
export const costTick = (n: number) => (n === 0 ? "$0" : Number.isInteger(n) && n >= 1 ? `$${fmtCompact(n)}` : `$${n.toFixed(2)}`);
