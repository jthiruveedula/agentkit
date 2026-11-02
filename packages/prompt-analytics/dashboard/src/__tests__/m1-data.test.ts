import { describe, expect, it } from "vitest";
import type { SessionRow } from "../data/types";
import { normalize } from "../data/load";
import { attribute, topDrivers } from "../lib/attribute";
import { briefing } from "../lib/briefing";
import { isReal, rateOf, struggled, struggledRate } from "../lib/metrics";
import { estSaving, fitMatrix, taskSize, tierOf } from "../lib/models";
import { capabilities } from "../lib/capabilities";
import { views } from "../lib/filter";
import sample from "../data/sample.dev.json";

let i = 0;
const row = (o: Partial<SessionRow> = {}): SessionRow => ({ id: `r${i++}`, source: "claude_code", date: "2026-10-05", project: "a", intent: "bugfix", prompts: 3, tokens: 10_000, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.1, cluster: 0, title: "", ...o });
const many = (n: number, o: Partial<SessionRow> = {}) => Array.from({ length: n }, () => row(o));

describe("metrics", () => {
  it("struggled rule and null rate", () => {
    expect(struggled(row({ loops: 3 }))).toBe(true);
    expect(struggled(row({ friction: 0.5 }))).toBe(true);
    expect(struggled(row({ loops: 2, friction: 0.49 }))).toBe(false);
    expect(struggled(row({ prompts: 0, loops: 9 }))).toBe(false);
    expect(struggledRate([row({ prompts: 0 })]).p).toBeNull();
    expect(struggledRate([row({ loops: 3 }), row()])).toEqual({ k: 1, n: 2, p: 0.5 });
  });
  it("isReal needs CI excluding 0, >= 3 pts and >= 10% relative", () => {
    expect(isReal(rateOf(40, 100), rateOf(10, 100))).toBe(true);
    expect(isReal(rateOf(11, 100), rateOf(10, 100))).toBe(false);   // tiny
    expect(isReal(rateOf(4, 10), rateOf(1, 10))).toBe(false);       // CI spans 0
    expect(isReal(rateOf(0, 0), rateOf(1, 10))).toBe(false);
  });
});

describe("attribute", () => {
  it("topDrivers folds the tail into Other so shown rows add up to the delta, and drivers carry project/intent", () => {
    const ps = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const prior = ps.flatMap((p, k) => [...many(k, { project: p, loops: 3 }), ...many(20 - k, { project: p })]);
    const cur = ps.flatMap((p, k) => [...many(6 - (k % 3), { project: p, loops: 3 }), ...many(14 + (k % 3), { project: p })]);
    const a = attribute(cur, prior, "project+intent");
    const rows = topDrivers(a);
    expect(a.drivers.length).toBeGreaterThan(4);
    expect(rows).toHaveLength(5);
    expect(rows[4].key).toBe("Other");
    expect(rows.reduce((t, r) => t + r.total, 0)).toBeCloseTo(a.delta, 10);
    expect(a.drivers[0]).toMatchObject({ project: expect.any(String), intent: "bugfix" });
  });
  const mk = (p: string, n: number, s: number) => [...many(s, { project: p, loops: 3 }), ...many(n - s, { project: p })];
  it("contributions sum exactly to the total change, with new, vanished and folded segments", () => {
    const prior = [...mk("a", 40, 4), ...mk("b", 30, 3), ...mk("gone", 12, 6), ...mk("tiny", 3, 0)];
    const cur = [...mk("a", 40, 20), ...mk("b", 20, 3), ...mk("new", 16, 8), ...mk("tiny2", 2, 2)];
    for (const by of ["project", "intent", "source", "project+intent"] as const) {
      const a = attribute(cur, prior, by);
      const all = [...a.drivers, ...(a.other ? [a.other] : [])];
      expect(all.reduce((t, d) => t + d.total, 0)).toBeCloseTo(a.delta, 12);
    }
    const a = attribute(cur, prior, "project");
    expect(a.other?.key).toBe("Other");
    expect(a.drivers.find((d) => d.key === "tiny")).toBeUndefined();
    expect(a.headline?.key).toBe("a");
  });
  it("headline needs n >= 15 in both windows; empty window gives no drivers", () => {
    const a = attribute([...mk("x", 14, 14)], [...mk("x", 20, 0)], "project");
    expect(a.headline).toBeNull();
    expect(attribute([], mk("x", 5, 1), "project").drivers).toEqual([]);
  });
});

describe("models", () => {
  it("tierOf", () => {
    for (const m of ["claude-opus-4-1", "o3", "o1", "openai/o3", "o3-pro", "gpt-4 o1"]) expect(tierOf(m)).toBe(2);
    for (const m of ["pro1", "gpt-4o3b", "foo-o3x", "o1-mini", "o3-mini"]) expect(tierOf(m)).not.toBe(2);
    for (const m of ["claude-sonnet-4-5", "gpt-5", "gemini-2.5-pro"]) expect(tierOf(m)).toBe(1);
    for (const m of ["claude-haiku-4-5", "gpt-5-mini", "gemini-2.5-flash"]) expect(tierOf(m)).toBe(0);
    for (const m of [null, undefined, "", "mystery-1"]) expect(tierOf(m)).toBeNull();
  });
  it("taskSize, fitMatrix, estSaving", () => {
    expect(taskSize({ prompts: 2, tokens: 5000, loops: 0 })).toBe(0);
    expect(taskSize({ prompts: 6, tokens: 30_000, loops: 1 })).toBe(1);
    expect(taskSize({ prompts: 12, tokens: 90_000, loops: 0 })).toBe(2);
    const rs = [row({ model: "claude-opus-4-1", tokens: 10_000, cost_usd: 2 }), row({ model: "claude-haiku-4-5", tokens: 10_000, cost_usd: 0.2 }),
      row({ model: "claude-sonnet-4-5", prompts: 6, tokens: 30_000 }), row({ model: "claude-haiku-4-5", prompts: 12, tokens: 90_000, loops: 3 }), row({ model: null }), row({ model: "claude-opus-4-1", prompts: 0 })];
    const f = fitMatrix(rs);
    expect(f).toMatchObject({ n: 4, right: 2, over: 1, under: 1 });
    expect(f.m[0][2]).toBe(1); expect(f.m[0][0]).toBe(1); expect(f.m[1][1]).toBe(1); expect(f.m[2][0]).toBe(1);
    // Top median 2e-4/token; Mid median is the only Mid priced row, 1/30k -> saves 2 - 10k/30k
    expect(estSaving(rs)).toBeCloseTo(2 - 1 / 3, 9);
  });
  it("estSaving is null when unpriced", () => {
    expect(estSaving([row({ model: "claude-opus-4-1", cost_usd: null })])).toBeNull();
  });
});

describe("briefing", () => {
  it("is consistent and tolerates no prior", () => {
    const prior = [...many(40, { date: "2026-09-20" }), ...many(2, { date: "2026-09-21", loops: 3 })];
    const cur = [...many(30, { date: "2026-10-05" }), ...many(12, { date: "2026-10-06", loops: 3, applied: false })];
    const b = briefing(cur, prior);
    expect(b.sessions).toEqual({ now: 42, prev: 42 });
    expect(b.struggled.real).toBe(true);
    expect(b.struggled.diff).toBeGreaterThan(0);
    expect(b.weekly).toHaveLength(12);
    expect(b.weekly.at(-1)?.sessions).toBe(42);
    expect(b.drivers?.delta).toBeCloseTo(b.struggled.diff!, 12);
    const n = briefing(cur, null);
    expect(n.struggled.prev).toBeNull(); expect(n.drivers).toBeNull(); expect(n.struggled.real).toBe(false);
  });
});

describe("contract 1.3", () => {
  it("normalize keeps the real schema and tolerates absent ttr_min/model", () => {
    const base = { id: "a", source: "cursor", date: "2026-10-01" };
    const d = normalize({ schema: "1.3", sessions: [{ ...base, ttr_min: 4.5, model: "gpt-5" }, { ...base, ttr_min: -1, model: "" }, base] });
    expect(d.schema).toBe("1.3");
    expect(d.sessions[0]).toMatchObject({ ttr_min: 4.5, model: "gpt-5" });
    expect(d.sessions[1]).toMatchObject({ ttr_min: null, model: null });
    expect("ttr_min" in d.sessions[2]).toBe(false);
    expect(normalize({ schema: "1.1" }).schema).toBe("1.1");
  });
  it("caps flags", () => {
    const d = normalize(sample as never);
    const c = capabilities(d, views(d, {}));
    expect(c.hasTtrRows && c.hasModels).toBe(true);
    const o = normalize({ schema: "1.2", sessions: [{ id: "a", source: "cursor", date: "2026-10-01" }] });
    const c2 = capabilities(o, views(o, {}));
    expect(c2.hasTtrRows || c2.hasModels).toBe(false);
  });
});
