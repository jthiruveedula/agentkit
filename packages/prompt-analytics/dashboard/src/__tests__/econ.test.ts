import { describe, expect, it } from "vitest";
import { bh, playbook, pValue } from "../lib/playbook";
import { golden, router } from "../lib/econ";
import { MIN_SHARE, partition } from "../lib/sunburst";
import { buildTree } from "../lib/mindmap";
import { monotonePath, niceTicks } from "../lib/trend";
import type { SessionRow } from "../data/types";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const ww = (feature: string, effect: number, ci: [number, number], cluster = 0, n = 40) => ({ cluster, feature, effect, ci, n, direction: effect > 0 ? "helps" as const : "hurts" as const });

describe("Benjamini-Hochberg playbook", () => {
  it("p-value from a 95% CI: an interval touching 0 is p ~ 0.05", () => {
    expect(pValue({ effect: 0.1, ci: [0, 0.2] })).toBeCloseTo(0.05, 3);
    expect(pValue({ effect: 0, ci: [-0.1, 0.1] })).toBeCloseTo(1, 6);
  });
  it("step-up: passes the largest k with p(k) <= k/m q, counting untested rows in m", () => {
    expect(bh([0.001, 0.02, 0.03, 0.5], 0.1)).toEqual([true, true, true, false]);
    expect(bh([0.001, 0.02, 0.03], 0.1, 100)).toEqual([true, false, false]);
  });
  it("a CI clear of zero is not enough once many tests ran", () => {
    const rows = [ww("file references", 0.08, [0.005, 0.155])];   // p ~ 0.037
    expect(playbook(rows, [], 1).more).toHaveLength(1);
    const b = playbook(rows, [], 40);
    expect(b.more).toHaveLength(0);
    expect(b).toMatchObject({ tested: 40, pass: 0 });
    expect(b.all[0].pass).toBe(false);
  });
  it("leads with scope; Do-more copies a prompt that has the feature, Do-less never copies", () => {
    const cl = [{ id: 2, label: "SQL migrations", size: 9, intent: "data" as const, success: 0.5, exemplar: "clean the table", cx: 0, cy: 0 }];
    const s = [row({ cluster: 2, title: "Migrate users, must keep the old index" })];
    const b = playbook([ww("explicit constraints", 0.15, [0.08, 0.22], 2), ww("vague verbs", -0.15, [-0.22, -0.08], 2)], cl, 2, s);
    expect(b.more[0].title).toBe("SQL migrations: state constraints");
    expect(b.more[0].snippet).toBe("Migrate users, must keep the old index");
    expect(b.less[0].snippet).toBeNull();
  });
});

describe("tool router", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => row({ id: `a${i}`, source: "cursor", intent: "refactor", applied: i < 15, loops: 1 })),
    ...Array.from({ length: 16 }, (_, i) => row({ id: `b${i}`, source: "claude_code", intent: "refactor", applied: i < 8 })),
    ...Array.from({ length: 4 }, (_, i) => row({ id: `c${i}`, source: "copilot", intent: "refactor", applied: true })),
    row({ id: "z", prompts: 0, source: "copilot", intent: "refactor" }),
  ];
  it("applied rate, mean loops, ttr; thin cells flagged; best needs two qualifying tools", () => {
    const r = router(rows, [{ source: "cursor", intent: "refactor", median_min: 10, n: 9 }]);
    expect(r.cells.get("cursor|refactor")).toMatchObject({ n: 20, rate: 0.75, loops: 1, ttr: 10, enough: true });
    expect(r.cells.get("copilot|refactor")).toMatchObject({ n: 4, rate: 1, enough: false });
    expect(r.best.get("refactor")?.source).toBe("cursor");
    expect(router(rows.filter((x) => x.source !== "claude_code")).best.size).toBe(0);
  });
  it("no winner when the top lower bound does not clear the runner-up, or the top rate rounds to 0%", () => {
    const close = [...Array.from({ length: 20 }, (_, i) => row({ id: `a${i}`, source: "cursor", applied: i < 12 })), ...Array.from({ length: 20 }, (_, i) => row({ id: `b${i}`, applied: i < 10 }))];
    expect(router(close).best.size).toBe(0);
    const zero = [...Array.from({ length: 400 }, (_, i) => row({ id: `a${i}`, source: "cursor", applied: i < 1 })), ...Array.from({ length: 20 }, (_, i) => row({ id: `b${i}`, applied: false }))];
    expect(router(zero).best.size).toBe(0);
  });
  it("pivots to projects when given a column key", () => {
    const r = router(rows.filter((x) => x.source === "cursor").map((x, i) => ({ ...x, project: i % 2 ? "web" : "api" })), [], 5, (x) => x.project);
    expect(r.sources.sort()).toEqual(["api", "web"]);
  });
  it("a tie names no best tool (all 0% is not a recommendation)", () => {
    const flat = rows.filter((x) => x.source !== "copilot").map((x) => ({ ...x, applied: false }));
    expect(router(flat).best.size).toBe(0);
  });
});

describe("golden hours", () => {
  it("null without the 1.1 field, so the basic tier still renders", () => {
    expect(golden([{ dow: 0, hour: 9, prompts: 5 }])).toBeNull();
  });
  it("rates only cells with enough sessions; best by Wilson lower bound", () => {
    const g = golden([{ dow: 0, hour: 9, prompts: 9, sessions: 20, applied: 18 }, { dow: 1, hour: 10, prompts: 3, sessions: 2, applied: 2 }, { dow: 2, hour: 14, prompts: 9, sessions: 6, applied: 6 }])!;
    expect(g.rate[0][9]).toBeCloseTo(0.9);
    expect(g.rate[1][10]).toBeNull();
    expect(g.base).toBeCloseTo(26 / 28);
    expect(g.best).toHaveLength(0);   // 18 of 20 has a lower bound under the 93% baseline: not reliably better
  });
  it("names an hour only when its Wilson lower bound beats the baseline", () => {
    const g = golden([{ dow: 0, hour: 9, prompts: 9, sessions: 60, applied: 57 }, { dow: 1, hour: 10, prompts: 9, sessions: 200, applied: 80 }, { dow: 2, hour: 14, prompts: 9, sessions: 12, applied: 12 }])!;
    expect(g.best.map((b) => [b.dow, b.hour])).toEqual([[0, 9], [2, 14]]);   // 40% hour never qualifies
    expect(g.best[0].lb).toBeGreaterThan(g.base);
  });
});

describe("map + trend geometry", () => {
  it("arc length is proportional within a level (no constant offset), and a tiny branch keeps the floor", () => {
    const rows = [...Array.from({ length: 16 }, (_, i) => row({ id: `a${i}`, source: "claude_code" })), ...Array.from({ length: 4 }, (_, i) => row({ id: `b${i}`, source: "cursor" }))];
    const parts = partition(buildTree(rows, "sessions", new Set()));
    const len = (id: string) => parts.get(id)!.x1 - parts.get(id)!.x0;
    expect(len("root/cursor") / len("root/claude_code")).toBeCloseTo(4 / 16, 9);
    expect(Math.min(...[...parts.values()].filter((p) => p.parent).map((p) => (p.x1 - p.x0) / (parts.get(p.parent!)!.x1 - parts.get(p.parent!)!.x0)))).toBeGreaterThanOrEqual(MIN_SHARE - 1e-12);
  });
  it("headroom: the axis top clears the max by ~10%; the monotone curve never overshoots", () => {
    expect(niceTicks(60 * 1.1).max).toBeGreaterThan(60);
    const pts: [number, number][] = [[0, 10], [1, 50], [2, 51], [3, 0], [4, 49]];
    const ys = monotonePath(pts).replace(/^M/, "").split(/[ C]/).filter(Boolean).map((p) => +p.split(",")[1]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0); expect(Math.max(...ys)).toBeLessThanOrEqual(51);
  });
});
