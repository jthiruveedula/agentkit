import { describe, expect, it } from "vitest";
import { playbook } from "../lib/playbook";
import { loopCurve, stopRule } from "../lib/loops";
import { bucketLabel, partialLast, peakIdx, unpricedCount } from "../lib/trend";
import { fromHash, sectionOf } from "../lib/hash";
import { hotspots, ROOT_ID } from "../lib/mindmap";
import { defaultSort, sortRows } from "../components/Sessions";
import type { SessionRow } from "../data/types";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const ww = (feature: string, effect: number, ci: [number, number], cluster = 0, n = 40) => ({ cluster, feature, effect, ci, n, direction: effect > 0 ? "helps" as const : "hurts" as const });

describe("playbook", () => {
  const clusters = [{ id: 0, label: "Tests", size: 9, intent: "bugfix" as const, success: 0.5, exemplar: `see [path] ${"x".repeat(300)}`, cx: 0, cy: 0 }];
  it("drops rows whose CI crosses zero and splits by sign", () => {
    const p = playbook([ww("file references", 0.12, [0.04, 0.2]), ww("vague verbs", -0.1, [-0.18, -0.02]), ww("error message pasted", 0.05, [-0.01, 0.11])], clusters);
    expect(p.more.map((x) => x.feature)).toEqual(["file references"]);
    expect(p.less.map((x) => x.feature)).toEqual(["vague verbs"]);
    expect(p.more[0].pts).toBeCloseTo(12);
    expect(p.more[0].snippet!.length).toBeLessThanOrEqual(160);
    expect(p.more[0].counter).toBe(false);
  });
  it("caps each side at 5 and flags effects against common advice", () => {
    const p = playbook(Array.from({ length: 7 }, (_, i) => ww("very short prompt", 0.1 + i / 100, [0.06 + i / 100, 0.14 + i / 100], i)), []);
    expect(p.more).toHaveLength(5);
    expect(p.more[0].counter).toBe(true);
    expect(p.more[0].snippet).toBeNull();
  });
});

describe("loop breaker", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => row({ id: `a${i}`, loops: 0, applied: i < 12 })),   // 60%
    ...Array.from({ length: 12 }, (_, i) => row({ id: `b${i}`, loops: 1, applied: i < 6 })),    // 50%
    ...Array.from({ length: 10 }, (_, i) => row({ id: `c${i}`, loops: 2, applied: i < 2 })),    // 20%
    ...Array.from({ length: 3 }, (_, i) => row({ id: `d${i}`, loops: 9 })),
    row({ id: "z", prompts: 0, loops: 3 }),
  ];
  it("buckets 0..4 and 5+, skips prompt-less rows, hides thin buckets", () => {
    const c = loopCurve(rows);
    expect(c.map((b) => b.n)).toEqual([20, 12, 10, 0, 0, 3]);
    expect(c[5].label).toBe("5+");
    expect(c[5].enough).toBe(false);
    expect(c[0].lo).toBeLessThan(0.6); expect(c[0].hi).toBeGreaterThan(0.6);
  });
  it("stopping rule: peak, then the first later bucket whose CI sits below the peak", () => {
    expect(stopRule(loopCurve(rows))).toMatchObject({ peak: { k: 0 }, stop: { k: 2 }, after: 1, significant: true, text: "Sessions with 2+ rephrases land less often (association)" });
    expect(stopRule(loopCurve(rows.filter((r) => r.loops < 2)))).toMatchObject({ stop: null, significant: false, text: "No clear gain or loss from rephrasing yet" });
  });
  it("peak is the fewest rephrases whose CI overlaps the best, not a noisy max further right", () => {
    const rs = [...Array.from({ length: 30 }, (_, i) => row({ id: `a${i}`, loops: 0, applied: i < 18 })),   // 60%
      ...Array.from({ length: 12 }, (_, i) => row({ id: `b${i}`, loops: 3, applied: i < 8 }))];             // 67%, overlapping CI
    expect(stopRule(loopCurve(rs))?.peak.k).toBe(0);
    expect(stopRule(loopCurve([]))).toBeNull();
  });
  it("counts only change intents with 2+ prompts", () => {
    const c = loopCurve([row({ intent: "explain" }), row({ prompts: 1 }), row({ intent: "feature" }), row({ intent: "refactor", loops: 7 })]);
    expect(c.map((b) => b.n)).toEqual([1, 0, 0, 0, 0, 1]);
  });
});

describe("trend honesty", () => {
  const b = (from: string, to: string, i = 0) => ({ from, to, i });
  it("marks the last bucket partial when short or touching the export day", () => {
    expect(partialLast([b("2026-03-02", "2026-03-08")], 7, "2026-04-01T00:00:00Z")).toBe(false);
    expect(partialLast([b("2026-03-02", "2026-03-05")], 7, "2026-04-01")).toBe(true);
    expect(partialLast([b("2026-03-02", "2026-03-02")], 1, "2026-03-02T08:00:00Z")).toBe(true);
  });
  it("peak, unpriced and week labels", () => {
    expect(peakIdx([1, 5, 9], 2)).toBe(1);
    expect(peakIdx([0, 0])).toBe(-1);
    expect(unpricedCount([row({ cost_usd: null }), row({ cost_usd: 0 })])).toBe(1);
    expect(bucketLabel(b("2026-03-03", "2026-03-09"), 7)).toBe("Week of Mar 3");
    expect(bucketLabel(b("2026-03-03", "2026-03-03"), 1)).toBe("Mar 3");
  });
});

describe("anchors, sorting, hotspots", () => {
  it("sub-section anchors resolve to their section", () => {
    expect(fromHash("#/s-trend").sec).toBe("s-trend");
    expect(sectionOf("s-trend")).toBe("s-overview");
    expect(sectionOf("s-loopbreak")).toBe("s-friction");
    expect(sectionOf("s-time")).toBe("s-time");
  });
  it("sorts by tokens and loops; a brush range defaults to cost-desc", () => {
    const rs = [row({ id: "a", tokens: 5, loops: 3 }), row({ id: "b", tokens: 50, loops: 1 })];
    expect(sortRows(rs, "tokens", true).map((r) => r.id)).toEqual(["b", "a"]);
    expect(sortRows(rs, "loops", true).map((r) => r.id)).toEqual(["a", "b"]);
    expect(defaultSort({ from: "2026-03-01", to: "2026-03-09" })).toEqual({ k: "cost", desc: true });
    expect(defaultSort({})).toEqual({ k: "date", desc: true });
  });
  it("hotspots rank priced cost x friction, ignoring unpriced cost", () => {
    const h = hotspots([row({ id: "a", project: "web", cost_usd: 10, friction: 0.5 }), row({ id: "b", project: "api", cost_usd: 20, friction: 0.1 }), row({ id: "c", project: "etl", cost_usd: null, friction: 0.9 })]);
    expect(h.map((x) => [x.label, x.rank])).toEqual([["web", 1], ["api", 2]]);
    expect(h[0].id).toBe(`${ROOT_ID}/claude_code/bugfix/web`);
  });
});
