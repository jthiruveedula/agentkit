import { describe, expect, it } from "vitest";
import { fromHash, toHash, type Nav } from "../lib/hash";
import { attention } from "../lib/attention";
import { views } from "../lib/filter";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

describe("hash state", () => {
  it("round-trips every filter key, panel, session and compare mode", () => {
    const nav: Nav = { f: { source: "copilot", intent: "bugfix", project: "atlas-api", from: "2026-02-01", to: "2026-02-14", cluster: 3, stage: 2, stageExact: 4, loops: 8, applied: false, frictionMin: 0.3, frictionMax: 0.4 }, sel: "s0835", list: true, cmp: "yoy" };
    const out = fromHash(toHash(nav, "s-funnel"));
    expect(out.nav).toEqual(nav);
    expect(out.sec).toBe("s-funnel");
  });
  it("defaults on an empty or unknown hash", () => {
    expect(fromHash("")).toEqual({ nav: { f: {}, sel: undefined, list: false, cmp: "prev" }, sec: "s-overview" });
    expect(fromHash("#/nope?src=cursor").sec).toBe("s-overview");
    expect(toHash({ f: {}, list: false, cmp: "prev" })).toBe("#/s-overview");
  });
});

describe("needs attention ranking", () => {
  const d0 = normalize(sample);
  it("orders by severity rank, at most six rows", () => {
    const items = attention(d0, views(d0, {}), {}, null);
    expect(items.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < items.length; i++) expect(items[i].rank).toBeGreaterThanOrEqual(items[i - 1].rank);
  });
  it("open secret outranks a spike, which outranks open PII", () => {
    const base = normalize({ schema: "1.0" });
    const it = (id: string, category: "secret" | "pii") => ({ id, session: id, source: "claude_code" as const, date: "2026-03-01", session_title: null, category, kinds: ["k"], preview: null, status: "open" as const });
    const d = { ...base, anomalies: [{ date: "2026-03-01", metric: "cost" as const, value: 9, z: 7 }], exposure: { ...base.exposure, items: [it("a", "pii"), it("b", "secret")] } };
    const ids = attention(d, views(d, {}), {}, null).map((x) => x.id);
    expect(ids[0]).toBe("exp-secret");
    expect(ids.indexOf("exp-pii")).toBeGreaterThan(1);
  });
});
