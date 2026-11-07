import { describe, expect, it } from "vitest";
import type { SessionRow } from "../data/types";
import { MIN_PRIOR_N } from "../lib/compare";
import { movers } from "../lib/movers";

let i = 0;
const row = (o: Partial<SessionRow> = {}): SessionRow => ({ id: `r${i++}`, source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const many = (n: number, o: Partial<SessionRow> = {}) => Array.from({ length: n }, () => row(o));
/** n sessions, `ok` of them applied. */
const mix = (n: number, ok: number, o: Partial<SessionRow> = {}) => [...many(ok, { ...o, applied: true }), ...many(n - ok, { ...o, applied: false })];

describe("movers", () => {
  it("returns nothing without a prior window", () => {
    expect(movers(many(50), null)).toEqual([]);
    expect(movers(many(50), [])).toEqual([]);
  });
  it("returns a large significant applied-rate change with sign and good flag", () => {
    const up = movers(mix(100, 80), mix(100, 40)).find((m) => m.id === "applied")!;
    expect(up.text).toBe("+40.0 pts"); expect(up.good).toBe(true); expect(up.filter).toEqual({ applied: true });
    const down = movers(mix(100, 40), mix(100, 80)).find((m) => m.id === "applied")!;
    expect(down.text).toBe("-40.0 pts"); expect(down.good).toBe(false);
  });
  it("excludes a tiny change", () => {
    expect(movers(mix(100, 51), mix(100, 50))).toEqual([]);
  });
  it("cost per applied: lower is good; tokens variant only when cost is not computable", () => {
    const cur = many(MIN_PRIOR_N + 5, { cost_usd: 2 }), prior = many(MIN_PRIOR_N + 5, { cost_usd: 1 });
    const c = movers(cur, prior, 5).find((m) => m.id === "cpa")!;
    expect(c.text).toBe("+100%"); expect(c.good).toBe(false);
    expect(movers(cur, prior, 5).some((m) => m.id === "tpa")).toBe(false);
    const t = movers(many(MIN_PRIOR_N + 5, { cost_usd: null, tokens: 5 }), many(MIN_PRIOR_N + 5, { cost_usd: null, tokens: 10 }), 5);
    expect(t.some((m) => m.id === "cpa")).toBe(false);
    expect(t.find((m) => m.id === "tpa")).toMatchObject({ text: "-50%", good: true });
  });
  it("skips a percentage change from a zero base", () => {
    const m = movers(many(MIN_PRIOR_N + 5, { cost_usd: 1 }), many(MIN_PRIOR_N + 5, { cost_usd: 0 }), 5);
    expect(m.some((x) => x.id === "cpa")).toBe(false);
    for (const x of m) expect(Number.isFinite(x.strength)).toBe(true);
  });
  it("sorts by strength and k caps the list", () => {
    const cur = many(MIN_PRIOR_N * 4, { prompts: 6 }), prior = many(MIN_PRIOR_N, { prompts: 2 });   // sessions +300%, prompts +200%
    const all = movers(cur, prior, 5);
    expect(all.map((m) => m.id)).toEqual(["sessions", "prompts"]);
    expect(all[0].strength).toBeGreaterThan(all[1].strength);
    expect(all[0]).toMatchObject({ good: null }); expect(all[0].filter).toBeUndefined();
    expect(movers(cur, prior, 1).map((m) => m.id)).toEqual(["sessions"]);
  });
});
