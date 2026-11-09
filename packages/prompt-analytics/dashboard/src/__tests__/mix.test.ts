import { describe, expect, it } from "vitest";
import type { SessionRow } from "../data/types";
import { aboveWeight, kpiDeltas, modelMix, pricedSum, spendTotal, tierMix, tokenTotal, toolMix } from "../lib/mix";
import { applyFilter, chips } from "../lib/filter";
import { fromHash, toHash } from "../lib/hash";
import { basis, type Basis } from "../lib/brief";
import { windowOf } from "../lib/compare";
import { openExposure } from "../lib/filter";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

let i = 0;
const row = (o: Partial<SessionRow> = {}): SessionRow => ({ id: `m${i++}`, source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: false, loops: 0, friction: 0.2, cluster: 0, title: "", model: "a", ...o });
const many = (n: number, o: Partial<SessionRow> = {}) => Array.from({ length: n }, () => row(o));

describe("spend and token totals", () => {
  it("sums priced spend only and reports coverage; nothing priced is null, not $0", () => {
    expect(spendTotal([row({ cost_usd: 2 }), row({ cost_usd: 3 }), row({ cost_usd: null }), row({ cost_usd: null })])).toEqual({ cost: 5, priced: 2, n: 4, coverage: 0.5 });
    expect(spendTotal(many(2, { cost_usd: null })).cost).toBeNull();
    expect(spendTotal([])).toEqual({ cost: null, priced: 0, n: 0, coverage: 0 });
    expect(pricedSum([row({ cost_usd: 0 })])).toBe(0);
  });
  it("tokens per session skip sessions that recorded no tokens", () => {
    expect(tokenTotal([row({ tokens: 100 }), row({ tokens: 300 }), row({ tokens: 0 })])).toEqual({ total: 400, counted: 2, perSession: 200 });
    expect(tokenTotal(many(2, { tokens: 0 })).perSession).toBeNull();
  });
});

describe("model mix", () => {
  const rows = [
    ...many(5, { model: "big", tokens: 10, cost_usd: 1 }), ...many(3, { model: "mid", tokens: 100, cost_usd: null }),
    ...many(2, { model: "x", tokens: 1 }), ...many(1, { model: "y", tokens: 1 }), ...many(1, { model: "z", tokens: 1 }),
    ...many(2, { model: null, tokens: 5 }), row({ model: "", tokens: 5 }),
  ];
  it("groups the tail into Other (2+ models) and keeps Unknown separate and last", () => {
    const m = modelMix(rows, "sessions", 2);
    expect(m.slices.map((s) => [s.label, s.kind, s.value])).toEqual([["big", "model", 5], ["mid", "model", 3], ["Other", "other", 4], ["Unknown", "unknown", 3]]);
    expect(m.slices[2].models).toBe(3);
    expect(m.slices[3].key).toBe("");   // the unknown filter key
    expect(m.total).toBe(15);
    expect(m.top).toMatchObject({ label: "big", share: 5 / 15 });
    expect(m.slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  });
  it("a lone remainder keeps its name instead of becoming 'Other (1)'", () => {
    const m = modelMix(rows, "sessions", 4);
    expect(m.slices.map((s) => s.label)).toEqual(["big", "mid", "x", "y", "z", "Unknown"]);
  });
  it("switches the measure but keeps the session order, so slices never jump; top follows the measure", () => {
    const t = modelMix(rows, "tokens", 2);
    expect(t.slices.map((s) => [s.label, s.value])).toEqual([["big", 50], ["mid", 300], ["Other", 4], ["Unknown", 15]]);
    expect(t.top?.label).toBe("mid");
    const s = modelMix(rows, "spend", 5);
    expect(s.slices.map((x) => [x.label, x.value, x.priced])).toEqual([["big", 5, 5], ["mid", 0, 0], ["x", 2, 2], ["y", 1, 1], ["z", 1, 1], ["Unknown", 3, 3]]);
    expect(s.unpriced).toBe(3);
    expect(modelMix(rows, "sessions").unpriced).toBe(0);
  });
  it("no known model means no top; empty is empty", () => {
    expect(modelMix(many(2, { model: null }), "sessions").top).toBeNull();
    expect(modelMix([], "spend")).toEqual({ by: "spend", total: 0, slices: [], top: null, unpriced: 0 });
  });
  it("on the sample, sonnet leads and the 3-model tail folds into Other", () => {
    const m = modelMix(normalize(sample).sessions, "sessions");
    expect(m.top?.label).toBe("claude-sonnet-4-5");
    expect(m.slices.at(-1)).toMatchObject({ label: "Unknown", value: 50 });
    expect(m.slices.find((s) => s.kind === "other")?.models).toBe(3);   // gemini-2.5-pro, gemini-2.5-flash, o3
  });
});

describe("tool mix", () => {
  it("spend and tokens per tool, unpriced tools null and last", () => {
    const t = toolMix([...many(2, { source: "cursor", cost_usd: 1, tokens: 5 }), ...many(3, { source: "copilot", cost_usd: null, tokens: 50 }), row({ source: "claude_code", cost_usd: 4, tokens: 1 }), row({ source: "claude_code", cost_usd: null, tokens: 1 })]);
    expect(t).toEqual([
      { source: "claude_code", sessions: 2, tokens: 2, cost: 4, priced: 1 },
      { source: "cursor", sessions: 2, tokens: 10, cost: 2, priced: 2 },
      { source: "copilot", sessions: 3, tokens: 150, cost: null, priced: 0 },
    ]);
  });
});

describe("KPI deltas on the brief basis", () => {
  const win = { from: "2026-01-01", to: "2026-03-31", days: 90 }, none = new Set<string>();
  const prior = (cur: SessionRow[], base: SessionRow[]): Basis => ({ mode: "prior", cur, base, label: "" });
  it("prior window: relative change for sums and cost per applied, points for rates", () => {
    const base = [...many(20, { tokens: 10, cost_usd: 1, applied: true }), ...many(20, { tokens: 10, cost_usd: 1 })];
    const cur = [...many(30, { tokens: 10, cost_usd: 1, applied: true }), ...many(30, { tokens: 10, cost_usd: 1 })];
    const d = kpiDeltas(prior(cur, base), win, new Set(cur.slice(0, 6).map((r) => r.id)));
    expect(d.sessions?.pct).toBeCloseTo(0.5);
    expect(d.tokens?.pct).toBeCloseTo(0);   // tokens compare per session: 10 each side
    expect(d.spend?.pct).toBeCloseTo(0.5);
    expect(d.cpa?.pct).toBeCloseTo(0);
    expect(d.applied).toEqual({ pct: 0, text: "±0 pts", now: 0.5, was: 0.5, grey: "within range" });
    expect(d.exposed?.pct).toBeCloseTo(0.1);
    expect(d.exposed?.text).toBe("+10.0 pts");
    expect(d.exposed?.grey).toBeUndefined();   // 0% before is outside 6 of 60's Wilson interval (about 5% to 20%)
    expect(d.sessions?.unit).toBeUndefined();   // equal windows: a plain change
    expect(d.tokens?.unit).toBe("per session");
  });
  it("shows nothing without a basis or with too little data", () => {
    expect(kpiDeltas({ mode: "none", cur: many(40), base: null, label: "" }, win, none)).toEqual({});
    const d = kpiDeltas(prior(many(40), many(4)), win, none);
    expect(d).toEqual({});   // 4 base sessions: under MIN_PRIOR_N for sums, under MIN_N for rates
  });
  it("drops cost deltas when the priced share differs by more than the tolerance", () => {
    const d = kpiDeltas(prior(many(40, { applied: true }), [...many(20, { applied: true }), ...many(20, { cost_usd: null, applied: true })]), win, none);
    expect(d.spend).toBeUndefined();
    expect(d.cpa).toBeUndefined();
    expect(d.sessions).toBeDefined();
  });
  it("split mode compares sums per day: 28 days now against the days before the cut", () => {
    // cut Mar 4: Mar 4..Mar 31 = 28 days now, Jan 1..Mar 3 = 62 days before. Same per-day volume -> flat.
    const bs: Basis = { mode: "split", cur: many(28), base: many(62), label: "", cut: "2026-03-04" };
    const d = kpiDeltas(bs, win, none);
    expect(d.sessions).toMatchObject({ unit: "per week" });
    expect(d.sessions?.pct).toBeCloseTo(0);
    expect(d.applied).toBeUndefined();   // 28 change sessions now: under MIN_N, so no rate delta
  });
});

describe("honest deltas: grey when mixed or within range", () => {
  const win = { from: "2026-01-01", to: "2026-03-31", days: 90 }, none = new Set<string>();
  const prior = (cur: SessionRow[], base: SessionRow[]): Basis => ({ mode: "prior", cur, base, label: "" });
  it("cost per applied: the mean falls while the median rises -> mixed, with both medians", () => {
    // before: one $40 applied session among $1s (mean high, median $1); now: every applied session $2 (mean lower, median higher)
    const base = [row({ applied: true, cost_usd: 40 }), ...many(9, { applied: true, cost_usd: 1 })], cur = many(10, { applied: true, cost_usd: 2 });
    const d = kpiDeltas(prior(cur, base), win, none);
    expect(d.cpa?.pct).toBeLessThan(0);
    expect(d.cpa).toMatchObject({ grey: "mixed", med: [1, 2] });
  });
  it("cost per applied: mean and median agree -> not grey", () => {
    const d = kpiDeltas(prior(many(10, { applied: true, cost_usd: 2 }), many(10, { applied: true, cost_usd: 1 })), win, none);
    expect(d.cpa?.grey).toBeUndefined();
    expect(d.cpa?.pct).toBeCloseTo(1);
  });
  it("spend: down with its outliers, up without them -> mixed, with the change without them", () => {
    const base = [row({ cost_usd: 100 }), ...many(39, { cost_usd: 1 })], cur = many(40, { cost_usd: 2 });
    const d = kpiDeltas(prior(cur, base), win, none);
    expect(d.spend?.pct).toBeLessThan(0);
    expect(d.spend).toMatchObject({ grey: "mixed", nOut: 1 });
    expect(d.spend?.alt).toBeGreaterThan(0);
  });
  it("rates: grey 'within range' only when the earlier rate is inside the current Wilson interval", () => {
    const ap = (k: number, n: number) => [...many(k, { applied: true }), ...many(n - k)];
    expect(kpiDeltas(prior(ap(16, 40), ap(14, 40)), win, none).applied?.grey).toBe("within range");
    expect(kpiDeltas(prior(ap(36, 40), ap(8, 40)), win, none).applied?.grey).toBeUndefined();
  });
  it("on the sample (All: last 4 weeks vs the 22 before), cost per applied is mean -43% but the median rose $0.49 -> $0.79: mixed", () => {
    const d = normalize(sample), w = windowOf(d, {}), k = kpiDeltas(basis(d.sessions, null, w, "prev"), w, openExposure(d));
    expect(Math.round((k.cpa!.pct as number) * 100)).toBe(-43);
    expect(k.cpa!.med!.map((x) => +x.toFixed(2))).toEqual([0.49, 0.79]);
    expect(k.cpa!.grey).toBe("mixed");
    expect(k.sessions!.unit).toBe("per week");
  });
});

describe("above its weight and tiers", () => {
  it("names the model whose spend share beats its token share by 8+ pts, over priced sessions only", () => {
    const rs = [...many(4, { model: "cheap", tokens: 100, cost_usd: 1 }), ...many(1, { model: "dear", tokens: 100, cost_usd: 4 }), ...many(5, { model: "free", tokens: 1000, cost_usd: null })];
    expect(aboveWeight(rs)).toEqual({ model: "dear", tok: 0.2, spend: 0.5 });
    expect(aboveWeight(many(4, { model: "a", tokens: 10, cost_usd: 1 }))).toBeNull();   // one model: no gap
    expect(aboveWeight(many(4, { cost_usd: null }))).toBeNull();
  });
  it("on the sample, haiku costs above its weight", () => {
    expect(aboveWeight(normalize(sample).sessions)?.model).toBe("claude-haiku-4-5");
  });
  it("tier mix: Small/Mid/Top/Unknown by sessions, tokens and priced spend", () => {
    const t = tierMix([row({ model: "claude-haiku-4-5", tokens: 5, cost_usd: 1 }), row({ model: "claude-sonnet-4-5", tokens: 10, cost_usd: null }), row({ model: "claude-opus-4-1", tokens: 20, cost_usd: 3 }), row({ model: null, tokens: 1, cost_usd: null })]);
    expect(t).toEqual({ sessions: [1, 1, 1, 1], tokens: [5, 10, 20, 1], spend: [1, 0, 3, 0] });
    expect(tierMix(many(2, { cost_usd: null })).spend).toBeNull();
  });
});

describe("model filter", () => {
  const rs = [row({ id: "a", model: "gpt-5" }), row({ id: "b", model: null }), row({ id: "c", model: "" }), row({ id: "d", model: undefined })];
  it("matches by id; '' matches every session with no model", () => {
    expect(applyFilter(rs, { model: "gpt-5" }).map((r) => r.id)).toEqual(["a"]);
    expect(applyFilter(rs, { model: "" }).map((r) => r.id)).toEqual(["b", "c", "d"]);
  });
  it("has a crumb and round-trips through the hash, unknown included", () => {
    expect(chips({ model: "gpt-5" }).map((c) => c.label)).toEqual(["Model: gpt-5"]);
    expect(chips({ model: "" }).map((c) => c.label)).toEqual(["Model: Unknown"]);
    for (const f of [{ model: "claude-sonnet-4-5" }, { model: "" }, { model: "gemini/2.5 pro", source: "cursor" as const }]) {
      expect(fromHash(toHash({ f, list: false, cmp: "prev" })).nav.f).toEqual(f);
    }
  });
});
