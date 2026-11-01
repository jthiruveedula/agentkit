import { describe, expect, it } from "vitest";
import { bucketSeries, buckets, costPerApplied, crossTally, cumulative, delta, histogram, MIN_PRIOR_N, monthProjection, pointDelta, quantile, wilson, isWide, METRICS } from "../lib/compare";
import type { SessionRow } from "../data/types";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });

describe("compare", () => {
  it("delta hides below the small-n guard and flags a zero prior as new", () => {
    expect(delta(10, 5, MIN_PRIOR_N - 1)).toBeNull();
    expect(delta(10, 0, 20)).toEqual({ kind: "new" });
    expect(delta(0, 0, 20)).toBeNull();
    expect(delta(15, 10, 20)).toEqual({ kind: "pct", pct: 0.5 });
    expect(pointDelta(0.5, 0.4, 2)).toBeNull();
    expect(pointDelta(0.5, 0.25, 20)).toBeCloseTo(0.25);
  });
  it("wilson interval brackets the rate and widens for small n", () => {
    const [a, b] = wilson(5, 10);
    expect(a).toBeLessThan(0.5); expect(b).toBeGreaterThan(0.5);
    expect(isWide(5, 10)).toBe(true);
    expect(isWide(500, 1000)).toBe(false);
  });
  it("quantile and histogram", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    const h = histogram([0, 0.05, 0.5, 1], 10, 0, 1);
    expect(h.counts[0]).toBe(2); expect(h.counts[9]).toBe(1); expect(h.counts.reduce((a, b) => a + b)).toBe(4);
  });
  it("buckets line up for current and prior windows", () => {
    const win = { from: "2026-03-01", to: "2026-03-14", days: 14 };
    expect(buckets(win, 7).map((b) => [b.from, b.to])).toEqual([["2026-03-01", "2026-03-07"], ["2026-03-08", "2026-03-14"]]);
    const s = bucketSeries([row({ date: "2026-03-02" }), row({ date: "2026-03-09" }), row({ date: "2026-03-10" })], win, 7, METRICS.sessions);
    expect(s).toEqual([1, 2]);
    expect(cumulative(s)).toEqual([1, 3]);
  });
  it("cost per applied skips unpriced sessions and counts them", () => {
    const r = costPerApplied([row({ cost_usd: 2 }), row({ cost_usd: 4, applied: false }), row({ cost_usd: null })]);
    expect(r).toEqual({ value: 6, excluded: 1 });
  });
  it("month projection runs the month-to-date rate to month end", () => {
    const p = monthProjection([row({ date: "2026-03-05", cost_usd: 10 })], "2026-03-10")!;
    expect(p.mtd).toBe(10); expect(p.projected).toBeCloseTo((10 / 10) * 31);
    expect(monthProjection([row({ cost_usd: null })], "2026-03-10")).toBeNull();
  });
  it("crossTally groups by tool and intent", () => {
    const m = crossTally([row({}), row({ applied: false }), row({ source: "cursor" })]);
    expect(m.get("claude_code|bugfix")).toMatchObject({ n: 2, asked: 2, applied: 1 });
    expect(m.get("cursor|bugfix")?.n).toBe(1);
  });
});
