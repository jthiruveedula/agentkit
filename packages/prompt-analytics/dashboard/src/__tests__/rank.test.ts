import { describe, expect, it } from "vitest";
import { rankSections } from "../lib/rank";
import type { Item } from "../lib/attention";
import type { Row } from "../lib/next";
import { normalize } from "../data/load";

const d = normalize({ schema: "1.0" });
const MID = ["s-time", "s-models", "s-friction", "s-works", "s-exposure", "s-funnel", "s-tools"];
const ORDER = ["s-overview", ...MID, "s-sessions", "s-map"];
const ALL = new Set(ORDER);
const item = (id: string, rank: number): Item => ({ id, rank, sev: "bad", headline: "h", act: "a", impact: "1 session", num: "1", date: "", action: { kind: "scroll", id: "s-exposure" } });
const row = (id: string, sec?: string): Row => ({ id, action: `Do ${id}`, impact: "1 session", tone: "warn", ...(sec ? { evidence: { sec } } : {}) });

describe("rankSections", () => {
  it("order is the fixed narrative sequence whatever the signal", () => {
    expect(rankSections(ALL, [], d, []).order).toEqual(ORDER);
    expect(rankSections(ALL, [item("exp-secret", 1)], d, []).order).toEqual(ORDER);
  });
  it("only ids in secs appear", () => {
    expect(rankSections(new Set(["s-overview", "s-friction", "s-time"]), [], d, []).order).toEqual(["s-overview", "s-time", "s-friction"]);
  });
  it("zero-score middle sections are quiet; overview, sessions and map never are", () => {
    const r = rankSections(ALL, [item("exp-secret", 1)], d, []);
    expect(r.quiet).toEqual(new Set(MID.filter((id) => id !== "s-exposure")));
  });
  it("a section is tagged only by the lowest row that points at it, with a (+n more) count", () => {
    const r = rankSections(ALL, [], d, [], [row("a", "s-time"), row("b", "s-friction"), row("c", "s-time"), row("d")]);
    expect(r.why).toEqual({ "s-time": { n: 1, text: "Do a (+1 more)" }, "s-friction": { n: 2, text: "Do b" } });
  });
  it("a recommendation citing a chapter keeps its section out of the quiet set", () => {
    const dd = { ...d, insights: [{ id: "i1", chapter: "time" }], recommendations: [{ title: "Fix A", evidence_insight: "i1" }] } as never;
    const r = rankSections(ALL, [], dd, []);
    expect(r.score["s-time"]).toBe(3);
    expect(r.quiet.has("s-time")).toBe(false);
  });
});
