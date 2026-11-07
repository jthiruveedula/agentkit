import { describe, expect, it } from "vitest";
import type { SessionRow } from "../data/types";
import type { Briefing } from "../lib/briefing";
import { story } from "../lib/story";

let i = 0;
const row = (o: Partial<SessionRow> = {}): SessionRow => ({ id: `r${i++}`, source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 1000, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const bad = (o: Partial<SessionRow> = {}) => row({ loops: 4, ...o });
const brief = (o: Partial<Briefing> = {}) => ({ struggled: { real: false }, drivers: null, ...o }) as unknown as Briefing;
const drv = (total: number, delta: number) => brief({ struggled: { real: true } as Briefing["struggled"], drivers: { delta, headline: { key: "web / bugfix", total } } as Briefing["drivers"] });

describe("story", () => {
  it("is null when nothing struggled", () => {
    expect(story(brief(), [row(), row()], {}).why).toBeNull();
  });
  it("prices struggled sessions, with singular wording for one", () => {
    expect(story(brief(), [bad({ cost_usd: 2 }), row({ cost_usd: 6 })], {}).why).toBe("1 struggled session cost $2.00, 25% of priced spend.");
    expect(story(brief(), [bad(), bad(), row({ cost_usd: 2 })], {}).why).toMatch(/^2 struggled sessions cost \$2\.00, 50%/);
  });
  it("falls back to tokens when nothing is priced", () => {
    const w = story(brief(), [bad({ cost_usd: null, tokens: 1000 }), row({ cost_usd: null, tokens: 3000 })], {}).why!;
    expect(w).toMatch(/^1 struggled session used 1k tokens, 25% of all tokens\.$/i);
  });
  it("ends with mostly/partly <driver> only for a real change", () => {
    const rows = [bad(), row()];
    expect(story(drv(0.6, 1), rows, {}).why).toMatch(/, mostly web \/ bugfix\.$/);
    expect(story(drv(0.2, 1), rows, {}).why).toMatch(/, partly web \/ bugfix\.$/);
    expect(story(brief({ drivers: { delta: 1, headline: { key: "x", total: 1 } } as Briefing["drivers"] }), rows, {}).why).not.toMatch(/mostly|partly/);
  });
  it("prefers a recommendation over an attention item", () => {
    expect(story(brief(), [], { rec: "R", attention: "A" }).next).toEqual({ text: "R", kind: "rec" });
    expect(story(brief(), [], { attention: "A" }).next).toEqual({ text: "A", kind: "attention" });
    expect(story(brief(), [], {}).next).toBeNull();
  });
});
