// Iteration 6c: one share selector, hotspots on the map basis, tick labels, count-up gate, shape totals.
import { describe, expect, it } from "vitest";
import { normalize } from "../data/load";
import { SHAPES } from "../data/shapes";
import sample from "../data/sample.dev.json";
import { frictionOutlier, projectKey, shares, NO_PROJECT } from "../lib/share";
import { hotspots } from "../lib/mindmap";
import { costTick } from "../lib/trend";
import { countable } from "../components/ui";
import type { SessionRow } from "../data/types";

type Raw = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const d = normalize(sample as unknown as Raw);
const rows = d.sessions as SessionRow[];

describe("shares", () => {
  const s = shares(rows, projectKey, "sessions");
  it("rows sum to 100% of one denominator", () => {
    expect(s.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 6);
    expect(s.rows.reduce((a, r) => a + r.value, 0)).toBe(s.total);
  });
  it("outlier needs 3+ sessions and a clear gap over the median", () => {
    const mk = (key: string, friction: number, sessions: number) => ({ key, value: 1, share: 0.1, sessions, priced: 0, friction, perSession: null });
    expect(frictionOutlier([mk("a", 0.2, 5), mk("b", 0.2, 5), mk("c", 0.9, 2)]).outlier).toBeNull();
    expect(frictionOutlier([mk("a", 0.2, 5), mk("b", 0.2, 5), mk("c", 0.9, 5)]).outlier?.key).toBe("c");
  });
  it("blank project maps to the sentinel", () => expect(projectKey({ ...rows[0], project: "" })).toBe(NO_PROJECT));
});

describe("hotspots follow the basis", () => {
  it("are per project, share is of the chosen basis", () => {
    const h = hotspots(rows, 3, "sessions");
    expect(h.length).toBeGreaterThan(0);
    for (const x of h) { expect(x.basis).toBe("sessions"); expect(x.share).toBeGreaterThan(0); expect(x.share).toBeLessThanOrEqual(1); }
    expect(new Set(h.map((x) => x.label)).size).toBe(h.length);
  });
});

describe("costTick", () => {
  it("whole dollars when they are exact, cents below $1", () => {
    expect(costTick(5)).toBe("$5");
    expect(costTick(0.5)).toBe("$0.50");
  });
});

describe("countable", () => {
  it("counts plain numbers only", () => {
    for (const t of ["12", "1,204", "3.4k", "9M"]) expect(countable(t)).toBe(true);
    for (const t of ["$4.20", "42%", "0.4", "n/a", "2h"]) expect(countable(t)).toBe(false);
  });
});

describe("shape totals follow the rows", () => {
  const t = normalize(SHAPES.small(sample as unknown as Raw)).totals;
  it("streaks never exceed active days, commits never exceed sessions", () => {
    expect(t.longest_streak).toBeLessThanOrEqual(t.active_days);
    expect(t.current_streak).toBeLessThanOrEqual(t.longest_streak);
    expect(t.commits_linked).toBeLessThanOrEqual(t.sessions);
  });
});
