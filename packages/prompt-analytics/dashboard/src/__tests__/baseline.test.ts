import { describe, expect, it } from "vitest";
import type { SessionRow } from "../data/types";
import { appliedRate, iqr, spendOutliers, sumTotal } from "../lib/baseline";
import { attribute, topDrivers } from "../lib/attribute";
import { bucketSeries } from "../lib/compare";
import { dumbMedian } from "../components/Time";
import { sparkPath } from "../components/charts";
import { fmtSigned } from "../lib/format";

let i = 0;
const row = (o: Partial<SessionRow> = {}): SessionRow => ({ id: `r${i++}`, source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: false, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const many = (n: number, o: Partial<SessionRow> = {}) => Array.from({ length: n }, () => row(o));

describe("applied rate over change work", () => {
  it("drops explain and prompt-less sessions from the denominator and counts applied 3+ loop sessions", () => {
    const r = appliedRate([...many(3, { applied: true }), row({ applied: true, loops: 3 }), ...many(4), ...many(5, { intent: "explain" }), row({ prompts: 0 })]);
    expect(r).toEqual({ k: 4, n: 8, p: 0.5, looped: 1 });
    expect(appliedRate(many(2, { intent: "explain" })).p).toBeNull();
  });
});

describe("spend outliers", () => {
  it("finds the fewest top sessions over 30% of priced spend, with the median applied priced session", () => {
    const big = [row({ id: "big1", cost_usd: 10 }), row({ id: "big2", cost_usd: 10, applied: true })];
    const o = spendOutliers([...big, ...many(30, { cost_usd: 1 }), ...many(3, { cost_usd: 3, applied: true }), row({ cost_usd: null })])!;   // total 59: top1 17%, top2 34%
    expect(o.top.map((r) => r.id)).toEqual(["big1", "big2"]);
    expect(o.share).toBeCloseTo(20 / 59);
    expect(o.median).toBe(3);
  });
  it("says nothing when spend is even, when no k <= 3 qualifies, or under MIN_N priced sessions", () => {
    expect(spendOutliers(many(40, { cost_usd: 1 }))).toBeNull();
    expect(spendOutliers([...many(4, { cost_usd: 5 }), ...many(40, { cost_usd: 1 })])).toBeNull();   // top 3 = 15 of 60 = 25%
    expect(spendOutliers([row({ cost_usd: 100 }), ...many(10)])).toBeNull();
  });
});

describe("diverging drivers", () => {
  it("the rows, Other included, add up to the change", () => {
    const seg = (project: string, n0: number, s0: number, n1: number, s1: number) => [
      ...Array.from({ length: n0 }, (_, k) => row({ project, date: "2026-01-01", loops: k < s0 ? 3 : 0 })),
      ...Array.from({ length: n1 }, (_, k) => row({ project, date: "2026-03-01", loops: k < s1 ? 3 : 0 })),
    ];
    const rows = [...seg("a", 40, 2, 30, 12), ...seg("b", 30, 3, 40, 2), ...seg("c", 20, 1, 20, 4), ...seg("d", 10, 1, 10, 1), ...seg("e", 10, 0, 10, 2), ...seg("f", 6, 0, 6, 3)];
    const a = attribute(rows.filter((r) => r.date >= "2026-02-01"), rows.filter((r) => r.date < "2026-02-01"), "project");
    const top = topDrivers(a, 3);
    expect(top.at(-1)?.key).toBe("Other");
    expect(sumTotal(top)).toBeCloseTo(a.delta, 10);
  });
});

describe("baselines", () => {
  it("Dumb's median rule sits at the median of the now values", () => {
    const d = (b: number) => ({ k: `${b}`, label: "", name: "", a: null, b, fa: "", fb: "" });
    expect(dumbMedian([d(9), d(1), d(4)])).toBe(4);
    expect(dumbMedian([d(1), d(2), d(3), d(10)])).toBe(2.5);
    expect(dumbMedian([{ ...d(100), k: "all" }, d(9), d(1), d(4)])).toBe(4);   // the "all" total is not a member
  });
  it("fmtSigned never prints a negative zero", () => {
    expect(fmtSigned(-0.001, 2)).toBe("0.00");
    expect(fmtSigned(-0, 0)).toBe("0");
    expect(fmtSigned(-0.006, 2)).toBe("-0.01");
    expect(fmtSigned(0.12, 2)).toBe("+0.12");
  });
  it("sparkline nulls are gaps (a lone point is a dot), never 0", () => {
    const p = sparkPath([1, null, 2, 3, null], (i) => i, (v) => v);
    expect(p).toBe("M0,1h0M2,2L3,3");
    expect(sparkPath([null, 5], (i) => i, (v) => v)).toBe("M1,5h0");
  });
  it("the IQR band needs 4 values and ignores nulls", () => {
    expect(iqr([1, null, 2, 3])).toBeNull();
    expect(iqr([1, 2, null, 3, 4, 5])).toEqual([2, 4]);
  });
  it("bucketSeries fills empty buckets with the given value (null for rates)", () => {
    const win = { from: "2026-03-02", to: "2026-03-22", days: 21 };
    expect(bucketSeries([row({ date: "2026-03-02" }), row({ date: "2026-03-20" })], win, 7, (rs) => rs.length, null)).toEqual([1, null, 1]);
  });
});
