import { describe, expect, it } from "vitest";
import { netValue, noGain, promptBuckets, repeatSpend } from "../lib/insights";
import type { SessionRow } from "../data/types";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
/** n sessions with `prompts` prompts, the first k applied. */
const many = (n: number, k: number, prompts: number) => Array.from({ length: n }, (_, i) => row({ id: `${prompts}-${i}`, prompts, applied: i < k }));

describe("no gain after 10 prompts", () => {
  it("buckets sessions with a prompt by prompt count, with Wilson CIs", () => {
    const bs = promptBuckets([...many(4, 2, 1), ...many(2, 2, 2), ...many(3, 0, 7), ...many(1, 1, 25), row({ prompts: 0 })]);
    expect(bs.map((b) => b.label)).toEqual(["1–2", "3–5", "6–10", "11–20", "21+"]);
    expect(bs.map((b) => b.n)).toEqual([6, 0, 3, 0, 1]);
    expect(bs[0].rate).toBeCloseTo(4 / 6);
    expect(bs[1].rate).toBeNull();   // empty bucket: no rate, never 0
    expect(bs[0].lo).toBeLessThan(bs[0].rate!); expect(bs[0].hi).toBeGreaterThan(bs[0].rate!);
  });
  it("is flat when past 10 is lower or overlaps, not when it is clearly higher, and silent under MIN_N", () => {
    expect(noGain([...many(40, 20, 8), ...many(40, 18, 15)])?.flat).toBe(true);    // lower
    expect(noGain([...many(40, 16, 8), ...many(40, 20, 15)])?.flat).toBe(true);    // higher but CIs overlap
    expect(noGain([...many(40, 8, 8), ...many(40, 36, 15)])?.flat).toBe(false);    // clearly higher
    expect(noGain([...many(40, 20, 8), ...many(29, 10, 15)])).toBeNull();           // 29 < MIN_N past 10
    const g = noGain([...many(40, 20, 8), ...many(20, 4, 15), ...many(20, 5, 30)])!;
    expect(g.over.n).toBe(40); expect(g.over.rate).toBeCloseTo(9 / 40);           // 11-20 and 21+ pooled
  });
});

describe("net value per intent", () => {
  it("computes sessions, applied rate, priced cost per applied and median prompts, cheapest first", () => {
    const rows = [
      row({ intent: "feature", cost_usd: 4, prompts: 3 }), row({ intent: "feature", cost_usd: 2, applied: false, prompts: 9 }),
      row({ intent: "bugfix", cost_usd: 1, prompts: 1 }), row({ intent: "bugfix", cost_usd: null, prompts: 5 }),
      row({ intent: "explain", cost_usd: 3, applied: false }),
    ];
    const nv = netValue(rows);
    expect(nv.map((x) => x.intent)).toEqual(["bugfix", "feature", "explain"]);
    expect(nv[0]).toMatchObject({ n: 2, applied: 2, rate: 1, cpa: 1, medPrompts: 3 });   // the unpriced applied session adds no cost and no denominator
    expect(nv[1]).toMatchObject({ n: 2, applied: 1, rate: 0.5, cpa: 6, medPrompts: 6 });
    expect(nv[2].cpa).toBeNull();   // nothing applied: shown as a dash, sorted last
  });
});

describe("repeated prompts spend", () => {
  const byId = new Map([["a", { tokens: 100, cost_usd: 2 }], ["b", { tokens: 50, cost_usd: 1 }], ["c", { tokens: 900, cost_usd: null }]]);
  const rep = (cluster: number, sessions: string[]) => ({ cluster, count: 3, exemplar: `p${cluster}`, sessions });
  it("counts each session once across clusters, dollars from priced sessions only, and names the costliest cluster", () => {
    const s = repeatSpend([rep(1, ["a", "c"]), rep(2, ["a", "b", "gone"])], byId);
    expect(s).toMatchObject({ sessions: 3, cost: 3, priced: 2, tokens: 1050 });
    expect(s.top?.r.cluster).toBe(2);   // $3 beats $2, although cluster 1 has more tokens
  });
  it("falls back to tokens when nothing is priced", () => {
    const s = repeatSpend([rep(1, ["c"]), rep(2, ["b"])], new Map([["b", { tokens: 50, cost_usd: null }], ["c", { tokens: 900, cost_usd: null }]]));
    expect(s.cost).toBeNull(); expect(s.tokens).toBe(950); expect(s.top?.r.cluster).toBe(1);
  });
});
