import { describe, expect, it } from "vitest";
import { rankSections } from "../lib/rank";
import type { Item } from "../lib/attention";
import { normalize } from "../data/load";

const d = normalize({ schema: "1.0" });
const MID = ["s-tools", "s-time", "s-funnel", "s-friction", "s-works", "s-models", "s-exposure", "s-recs"];
const ALL = new Set(["s-overview", ...MID, "s-sessions", "s-map"]);
const item = (id: string, rank: number, headline: string): Item => ({ id, rank, sev: "bad", headline, num: "1", date: "", action: { kind: "scroll", id: "s-exposure" } });

describe("rankSections", () => {
  it("secret exposure item puts s-exposure first in the middle, with its headline as why", () => {
    const r = rankSections(ALL, [item("exp-secret", 1, "3 open secrets in 2 sessions")], d, []);
    expect(r.order[1]).toBe("s-exposure");
    expect(r.why["s-exposure"]).toBe("3 open secrets in 2 sessions");
    expect(r.score["s-exposure"]).toBe(9);
  });
  it("zero-score middle sections are quiet; head/tail never are", () => {
    const r = rankSections(ALL, [item("exp-secret", 1, "x")], d, []);
    expect(r.quiet).toEqual(new Set(MID.filter((id) => id !== "s-exposure")));
    expect(r.quiet.has("s-overview") || r.quiet.has("s-sessions") || r.quiet.has("s-map")).toBe(false);
  });
  it("head and tail are fixed and ties keep base order", () => {
    const r = rankSections(ALL, [item("exp-secret", 1, "x")], d, []);
    expect(r.order[0]).toBe("s-overview");
    expect(r.order.slice(-2)).toEqual(["s-sessions", "s-map"]);
    expect(r.order.slice(2, -2)).toEqual(MID.filter((id) => id !== "s-exposure"));
  });
  it("only ids in secs appear; (+N more) and prefix mapping", () => {
    const r = rankSections(new Set(["s-overview", "s-time", "s-friction"]), [item("anom-1", 2, "spike"), item("anom-2", 4, "dip"), item("loops", 3, "loopy")], d, []);
    expect(r.order).toEqual(["s-overview", "s-time", "s-friction"]);
    expect(r.why["s-time"]).toBe("spike (+1 more)");
    expect(r.why["s-friction"]).toBe("loopy");
  });
  it("a recommendation adds 3 (first) / 2 and falls back to 'Cited by'", () => {
    const dd = { ...d, insights: [{ id: "i1", chapter: "time" }, { id: "i2", chapter: "funnel" }], recommendations: [{ title: "Fix A", evidence_insight: "i1" }, { title: "Fix B", evidence_insight: "i2" }] } as never;
    const r = rankSections(ALL, [], dd, []);
    expect(r.score["s-time"]).toBe(3);
    expect(r.score["s-funnel"]).toBe(2);
    expect(r.why["s-time"]).toBe("Cited by: Fix A");
    expect(r.score["s-recs"]).toBe(4);
    expect(r.why["s-recs"]).toBe("2 recommendations to act on");
  });
});
