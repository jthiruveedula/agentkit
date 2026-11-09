import { describe, expect, it } from "vitest";
import { buildTree, hotspots, visible, type MapNode } from "../lib/mindmap";
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
  it("carries the struggled rate over sessions with a prompt (empty chats never struggle)", () => {
    const t = buildTree([...rows, row({ id: "e", source: "cursor", prompts: 0, friction: 0.9 }), row({ id: "f", source: "cursor", loops: 3 })]);
    expect(t.children[0].children.find((c) => c.label === "bugfix")!.struggled).toBe(0.5);
    expect(t.children.find((c) => c.label === "cursor")!.struggled).toBe(0.5);   // d (no) and f (loops) count; e has no prompt
  });
  it("caps sessions at 4 (projects at 6) and folds the rest into one +N more node; opening the parent lifts the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => row({ id: `s${i}`, prompts: 10 - i }));
    const t = buildTree(many, "prompts");
    const proj = t.children[0].children[0].children[0];
    expect(proj.children).toHaveLength(5);
    const more = proj.children[4];
    expect(more.kind).toBe("more"); expect(more.label).toBe("+6 more"); expect(more.value).toBe(6 + 5 + 4 + 3 + 2 + 1);
    expect(proj.children[0].session).toBe("s0");   // biggest first
    expect(buildTree(many, "prompts", new Set([proj.id])).children[0].children[0].children[0].children).toHaveLength(10);
    expect(buildTree(Array.from({ length: 5 }, (_, i) => row({ id: `t${i}` }))).children[0].children[0].children[0].children).toHaveLength(5);   // +1 more is never worth a node
  });
  it("an empty project keeps the parent filter, and visible() follows the open set", () => {
    const t = buildTree([row({ project: "" })]);
    const p = t.children[0].children[0].children[0];
    expect(p.label).toBe("(no project)"); expect(p.filter).toEqual({ source: "claude_code", intent: "bugfix" });
    expect(visible(t, new Set()).map((x) => x.depth)).toEqual([0]);
    expect(visible(t, new Set([t.id, t.children[0].id])).map((x) => x.node.kind)).toEqual(["root", "tool", "intent"]);
  });
  it("counts the sessions a rate stands on (rated) and the priced ones; a '+N more' node carries the priced count", () => {
    const t = buildTree([...rows, row({ id: "e", source: "cursor", prompts: 0 }), row({ id: "f", source: "cursor", cost_usd: null })]);
    const cur = t.children.find((c) => c.label === "cursor")!;
    expect([cur.sessions, cur.rated, cur.priced]).toEqual([3, 2, 2]);
  });
});

describe("mindmap hotspots", () => {
  const all = (n: MapNode): MapNode[] => [n, ...n.children.flatMap(all)];
  // project web: one costly claude_code session, three cheap cursor ones
  const rs = [row({ id: "a", source: "claude_code", intent: "bugfix", project: "web", cost_usd: 10, friction: 0.5 }),
    ...["b", "c", "d"].map((id) => row({ id, source: "cursor", intent: "feature", project: "web", cost_usd: 1, friction: 0.5 })),
    row({ id: "e", project: "api", cost_usd: 2, friction: 0.5 })];
  it("outline the project's biggest branch on the CURRENT metric, with the part of the project inside it", () => {
    const cost = hotspots(rs, 3, "cost").find((h) => h.label === "web")!, ses = hotspots(rs, 3, "sessions").find((h) => h.label === "web")!;
    expect([cost.id, cost.here, cost.value]).toEqual(["root/claude_code/bugfix/web", 10, 13]);
    expect([ses.id, ses.here, ses.value]).toEqual(["root/cursor/feature/web", 3, 4]);
    expect(ses.rank).toBe(cost.rank);   // the rank is still cost x friction
  });
  it("ids match the tree's, even for an empty intent or project", () => {
    const blank = [row({ id: "a", intent: "" as never, project: "", friction: 0.5 }), row({ id: "b", project: "api", friction: 0.5 })];
    const ids = new Set(all(buildTree(blank, "sessions", new Set(["root"]))).map((n) => n.id));
    for (const h of hotspots(blank)) expect(ids.has(h.id)).toBe(true);
    expect(hotspots(blank).map((h) => h.id)).toContain("root/claude_code/(none)/(none)");
  });
});
