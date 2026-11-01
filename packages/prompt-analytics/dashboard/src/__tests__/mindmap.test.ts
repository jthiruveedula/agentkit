import { describe, expect, it } from "vitest";
import { buildTree, visible } from "../lib/mindmap";
import type { SessionRow } from "../data/types";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });

describe("mindmap tree", () => {
  const rows = [
    row({ id: "a", source: "claude_code", intent: "bugfix", project: "web" }), row({ id: "b", source: "claude_code", intent: "bugfix", project: "web", applied: false, friction: 0.6 }),
    row({ id: "c", source: "claude_code", intent: "feature", project: "api" }), row({ id: "d", source: "cursor", intent: "bugfix", project: "web" }),
  ];
  it("groups tool > intent > project > session with a drill filter on every node", () => {
    const t = buildTree(rows);
    expect(t.sessions).toBe(4);
    expect(t.children.map((c) => [c.label, c.sessions])).toEqual([["claude_code", 3], ["cursor", 1]]);
    const bug = t.children[0].children.find((c) => c.label === "bugfix")!;
    expect(bug.filter).toEqual({ source: "claude_code", intent: "bugfix" });
    const web = bug.children[0];
    expect(web.filter).toEqual({ source: "claude_code", intent: "bugfix", project: "web" });
    expect(web.children.map((s) => s.session).sort()).toEqual(["a", "b"]);
    expect(bug.friction).toBeCloseTo(0.4); expect(bug.applied).toBe(0.5);
  });
  it("caps children at 6 and folds the rest into one +N more node; opening the parent lifts the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => row({ id: `s${i}`, prompts: 10 - i }));
    const t = buildTree(many, "prompts");
    const proj = t.children[0].children[0].children[0];
    expect(proj.children).toHaveLength(7);
    const more = proj.children[6];
    expect(more.kind).toBe("more"); expect(more.label).toBe("+4 more"); expect(more.value).toBe(4 + 3 + 2 + 1);
    expect(proj.children[0].session).toBe("s0");   // biggest first
    expect(buildTree(many, "prompts", new Set([proj.id])).children[0].children[0].children[0].children).toHaveLength(10);
    expect(buildTree(Array.from({ length: 7 }, (_, i) => row({ id: `t${i}` }))).children[0].children[0].children[0].children).toHaveLength(7);   // +1 more is never worth a node
  });
  it("an empty project keeps the parent filter, and visible() follows the open set", () => {
    const t = buildTree([row({ project: "" })]);
    const p = t.children[0].children[0].children[0];
    expect(p.label).toBe("(no project)"); expect(p.filter).toEqual({ source: "claude_code", intent: "bugfix" });
    expect(visible(t, new Set()).map((x) => x.depth)).toEqual([0]);
    expect(visible(t, new Set([t.id, t.children[0].id])).map((x) => x.node.kind)).toEqual(["root", "tool", "intent"]);
  });
});
