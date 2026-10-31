import { describe, expect, it } from "vitest";
import { applyFilter, capZ, chips, patchFilter, streaks, views } from "../lib/filter";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

const d = normalize(sample);
const rows = d.sessions;

describe("cross-filter", () => {
  it("sample has per-session rows and unpriced sources", () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.some((r) => r.cost_usd === null)).toBe(true);
  });
  it("source filter narrows every aggregate consistently", () => {
    const all = views(d, {});
    const src = all.sources[0].key;
    const v = views(d, { source: src as never });
    expect(v.totals.sessions).toBe(all.sources[0].sessions);
    expect(v.sources.map((s) => s.key)).toEqual([src]);
    expect(v.funnel[0]).toBe(v.totals.sessions);
    expect(v.calendar.reduce((a, c) => a + c.sessions, 0)).toBe(v.totals.sessions);
    expect(v.intents.reduce((a, t) => a + t.sessions, 0)).toBe(v.totals.sessions);
  });
  it("filters compose (AND) and a day filter is inclusive", () => {
    const day = rows[0].date;
    const one = applyFilter(rows, { from: day, to: day });
    expect(one.length).toBeGreaterThan(0);
    expect(one.every((r) => r.date === day)).toBe(true);
    const both = applyFilter(rows, { from: day, to: day, source: rows[0].source });
    expect(both.every((r) => r.date === day && r.source === rows[0].source)).toBe(true);
    expect(both.length).toBeLessThanOrEqual(one.length);
  });
  it("stage means reached >= n; loops 8 means 8+", () => {
    expect(applyFilter(rows, { stage: 5 }).every((r) => r.reached_stage >= 5)).toBe(true);
    expect(applyFilter(rows, { loops: 8 }).every((r) => r.loops >= 8)).toBe(true);
  });
  it("unpriced sessions never contribute $0 to cost", () => {
    const unpriced = rows.find((r) => r.cost_usd === null)!;
    const v = views(d, { source: unpriced.source });
    if (rows.filter((r) => r.source === unpriced.source).every((r) => r.cost_usd === null)) expect(v.totals.cost).toBeNull();
  });
  it("patchFilter clears undefined keys; chips label them", () => {
    const f = patchFilter({ source: "cursor", intent: "bugfix" }, { source: undefined });
    expect(f).toEqual({ intent: "bugfix" });
    expect(chips({ from: "2026-09-01", to: "2026-09-01", cluster: -1 }).map((c) => c.label)).toEqual(["Sep 1", "No topic"]);
  });
  it("capZ caps huge z", () => { expect(capZ(412.3)).toBe("10+"); expect(capZ(3.14)).toBe("3.1"); });
  it("streaks", () => { expect(streaks(["2026-01-01", "2026-01-02", "2026-01-04"])).toEqual({ days: 3, longest: 2, current: 1 }); });
  it("legacy export (no sessions) still yields views", () => {
    const v = views(normalize({ schema: "1.0", totals: { sessions: 5 } }), { source: "cursor" });
    expect(v.legacy).toBe(true);
    expect(v.totals.sessions).toBe(5);
  });
});
