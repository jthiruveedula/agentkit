import { describe, expect, it } from "vitest";
import type { SessionRow } from "../data/types";
import { story } from "../lib/story";

let i = 0;
const row = (o: Partial<SessionRow> = {}): SessionRow => ({ id: `r${i++}`, source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 1000, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const bad = (o: Partial<SessionRow> = {}) => row({ loops: 4, ...o });

describe("story", () => {
  it("is null when nothing struggled", () => {
    expect(story([row(), row()], {}).why).toBeNull();
  });
  it("names struggled sessions over-represented in priced spend, with singular wording for one", () => {
    expect(story([bad({ cost_usd: 6 }), row({ cost_usd: 2 })], {}).why).toBe("1 struggled session is 50% of priced sessions but 75% of priced spend.");
    expect(story([bad({ cost_usd: 3 }), bad({ cost_usd: 3 }), row({ cost_usd: 1 }), row({ cost_usd: 1 })], {}).why).toBe("2 struggled sessions are 50% of priced sessions but 75% of priced spend.");
  });
  it("is null when struggled sessions cost no more than their share", () => {
    expect(story([bad({ cost_usd: 2 }), row({ cost_usd: 6 })], {}).why).toBeNull();
    expect(story([bad({ cost_usd: 2 }), row({ cost_usd: 2 })], {}).why).toBeNull();
  });
  it("falls back to tokens when nothing is priced", () => {
    const w = story([bad({ cost_usd: null, tokens: 3000 }), row({ cost_usd: null, tokens: 1000 })], {}).why!;
    expect(w).toBe("1 struggled session is 50% of sessions but 75% of all tokens.");
  });
  it("prefers a recommendation over an attention item", () => {
    expect(story([], { rec: "R", attention: "A" }).next).toEqual({ text: "R", kind: "rec" });
    expect(story([], { attention: "A" }).next).toEqual({ text: "A", kind: "attention" });
    expect(story([], {}).next).toBeNull();
  });
});
