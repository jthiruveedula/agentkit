import { describe, expect, it } from "vitest";
import { alignPrior, bucketDelta, brushRange, labelIdx, monotonePath, niceTicks, rollingBand, spikes, topToolByBucket } from "../lib/trend";
import { buckets } from "../lib/compare";
import { fmtRange } from "../lib/format";
import type { SessionRow } from "../data/types";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });

describe("trend math", () => {
  it("niceTicks uses 1/2/5 steps and covers the max", () => {
    expect(niceTicks(87).ticks).toEqual([0, 50, 100]);
    for (const m of [0.37, 3, 87, 1234, 98765]) { const t = niceTicks(m); expect(t.max).toBeGreaterThanOrEqual(m); const step = t.ticks[1] - t.ticks[0]; expect([1, 2, 5]).toContain(+(step / 10 ** Math.floor(Math.log10(step))).toFixed(6)); expect(t.ticks.at(-1)).toBe(t.max); }
    expect(niceTicks(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceTicks(10).ticks).toEqual([0, 5, 10]);
  });
  it("monotonePath never leaves the band of neighbouring y values", () => {
    const pts: [number, number][] = [[0, 100], [10, 100], [20, 20], [30, 20], [40, 90], [50, 10]];
    const nums = monotonePath(pts).match(/-?\d+(\.\d+)?/g)!.map(Number);
    const segs = nums.slice(2);   // C c1x c1y c2x c2y x y, repeated
    for (let i = 0; i < pts.length - 1; i++) {
      const [, c1y, , c2y] = segs.slice(i * 6, i * 6 + 6), lo = Math.min(pts[i][1], pts[i + 1][1]), hi = Math.max(pts[i][1], pts[i + 1][1]);
      expect(c1y).toBeGreaterThanOrEqual(lo - 0.01); expect(c1y).toBeLessThanOrEqual(hi + 0.01); expect(c2y).toBeGreaterThanOrEqual(lo - 0.01); expect(c2y).toBeLessThanOrEqual(hi + 0.01);
    }
    expect(monotonePath([])).toBe(""); expect(monotonePath([[1, 2]])).toBe("M1,2");
  });
  it("rollingBand is a trailing median with ordered quartiles", () => {
    const xs = [1, 5, 2, 8, 3, 9, 4, 10];
    const b = rollingBand(xs, 3);
    expect(b.mid[0]).toBe(1); expect(b.mid[3]).toBe(5);   // median(5,2,8)
    b.mid.forEach((m, i) => { expect(b.lo[i]).toBeLessThanOrEqual(m); expect(b.hi[i]).toBeGreaterThanOrEqual(m); });
  });
  it("alignPrior pads by offset and bucketDelta guards zero priors", () => {
    expect(alignPrior([1, 2, 3], [4, 5])).toEqual([4, 5, null]); expect(alignPrior([1], null)).toBeNull();
    expect(bucketDelta(6, 4)).toBeCloseTo(0.5); expect(bucketDelta(3, 0)).toBe("new"); expect(bucketDelta(0, 0)).toBeNull(); expect(bucketDelta(2, null)).toBeNull();
  });
  it("spikes flags a clear outlier but not a flat or tiny series", () => {
    expect(spikes([3, 4, 3, 5, 4, 3, 4, 40, 4, 3])).toEqual([7]);
    expect(spikes([2, 2, 2, 2, 2, 2, 2, 2, 2])).toEqual([]);
    expect(spikes([1, 2, 3])).toEqual([]);
  });
  it("brushRange maps any-order bucket picks to dates and clamps", () => {
    const bks = buckets({ from: "2026-03-01", to: "2026-03-14", days: 14 }, 7);
    expect(brushRange(bks, 1, 0)).toEqual({ from: "2026-03-01", to: "2026-03-14" });
    expect(brushRange(bks, 1, 9)).toEqual({ from: "2026-03-08", to: "2026-03-14" });
  });
  it("labelIdx keeps first and last", () => { expect(labelIdx(30, 5)).toEqual([0, 7, 15, 22, 29]); expect(labelIdx(3, 5)).toEqual([0, 1, 2]); expect(labelIdx(0, 5)).toEqual([]); });
  it("topToolByBucket picks the leader per bucket", () => {
    const r = [row({ id: "1", source: "cursor" }), row({ id: "2", source: "cursor" }), row({ id: "3", source: "copilot" }), row({ id: "4", date: "2026-03-04", source: "copilot" })];
    const t = topToolByBucket(r, { from: "2026-03-01", to: "2026-03-05", days: 5 }, 1, () => 1);
    expect(t[1]).toEqual({ src: "cursor", share: 2 / 3 }); expect(t[3]).toEqual({ src: "copilot", share: 1 }); expect(t[0]).toBeNull();
  });
  it("fmtRange shows the year once when it matches", () => {
    expect(fmtRange("2026-09-03", "2026-10-02")).toBe("Sep 3 – Oct 2, 2026");
    expect(fmtRange("2025-12-20", "2026-01-02")).toBe("Dec 20, 2025 – Jan 2, 2026");
  });
});
