import { describe, expect, it } from "vitest";
import { buildTree, type MapNode } from "../lib/mindmap";
import { arcLine, arcOf, arcPath, BOUNDS, clip, easeInOut, edgeOf, fitNum, focusDepth, focusOf, glyphW, heat, labelFit, lerpWin, MIN_CLIP, MIN_SHARE, MIN_VIS, nameFit, partition, placeChart, radiusAt, ringsFor, spans, split2, stack, struggleNote, TAU, winOf } from "../lib/sunburst";
import type { SessionRow } from "../data/types";
import sample from "../data/sample.dev.json";
import { normalize } from "../data/load";

const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });
const rows = [
  row({ id: "a", source: "claude_code", intent: "bugfix", project: "web" }), row({ id: "b", source: "claude_code", intent: "feature", project: "api", cost_usd: 3 }),
  row({ id: "c", source: "cursor", intent: "bugfix", project: "web" }), row({ id: "d", source: "copilot", intent: "docs", project: "web", cost_usd: null }),
];
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const all = (n: MapNode): MapNode[] => [n, ...n.children.flatMap(all)];

describe("sunburst spans", () => {
  it("are proportional above the floor and sum to 1", () => {
    const s = spans([6, 3, 1]);
    expect(sum(s)).toBeCloseTo(1, 12); expect(s[0] / s[1]).toBeCloseTo(2, 9); expect(s[1] / s[2]).toBeCloseTo(3, 9);
  });
  it("pin tiny children to the floor and shrink the rest in proportion", () => {
    const s = spans([1000, 500, 1, 0]);
    expect(sum(s)).toBeCloseTo(1, 12); expect(s[2]).toBeCloseTo(MIN_SHARE, 12); expect(s[3]).toBeCloseTo(MIN_SHARE, 12); expect(s[0] / s[1]).toBeCloseTo(2, 9);
  });
  it("fall back to the second weights, then to equal, when every value is 0", () => {
    expect(spans([0, 0], [3, 1])).toEqual([0.75, 0.25]);
    expect(spans([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(spans([])).toEqual([]);
  });
  it("never let a floor above 1/n break the sum", () => {
    const s = spans(Array.from({ length: 50 }, (_, i) => (i === 0 ? 1e6 : 0)));
    expect(sum(s)).toBeCloseTo(1, 12); expect(Math.min(...s)).toBeGreaterThan(0);
  });
});

describe("sunburst partition", () => {
  const root = buildTree(rows), parts = partition(root);
  it("lays out every node, and the top level fills the whole turn", () => {
    expect(parts.size).toBe(all(root).length);
    const tools = [...parts.values()].filter((p) => p.depth === 1), w = winOf(parts.get("root")!);
    expect(sum(tools.map((p) => { const a = arcOf(p, w, 100); return a.a1 - a.a0; }))).toBeCloseTo(TAU, 9);
  });
  it("nests each child inside its parent, siblings contiguous and covering the parent", () => {
    for (const n of all(root)) {
      if (!n.children.length) continue;
      const p = parts.get(n.id)!, kids = n.children.map((c) => parts.get(c.id)!);
      expect(kids[0].x0).toBe(p.x0); expect(kids.at(-1)!.x1).toBe(p.x1);
      kids.forEach((k, i) => { expect(k.depth).toBe(p.depth + 1); expect(k.x0).toBeGreaterThanOrEqual(p.x0); expect(k.x1).toBeLessThanOrEqual(p.x1); if (i) expect(k.x0).toBe(kids[i - 1].x1); });
    }
  });
  it("follows the metric: cost gives the unpriced tool only the floor", () => {
    const c = partition(buildTree(rows, "cost"));
    expect(c.get("root/copilot")!.x1 - c.get("root/copilot")!.x0).toBeCloseTo(MIN_SHARE, 12);
    expect(c.get("root/claude_code")!.x1 - c.get("root/claude_code")!.x0).toBeGreaterThan(parts.get("root/claude_code")!.x1 - parts.get("root/claude_code")!.x0);
  });
  it("lays out the whole mock export (about 837 sessions)", () => {   // no timing assert: wall-clock limits flake on a loaded CI box
    const p = partition(buildTree(normalize(sample as never).sessions, "sessions", new Set(["root"])));
    expect(p.size).toBeGreaterThan(200);
  });
});

describe("sunburst focus and window", () => {
  const parts = partition(buildTree(rows));
  it("a shallow view stretches its rings to the rim; the hub keeps its size", () => {
    const tool = parts.get("root/claude_code")!;
    expect(ringsFor(parts, new Set(["root", "root/claude_code", "root/claude_code/bugfix"]), tool)).toBe(1);
    expect(ringsFor(parts, new Set(["root", "root/claude_code", "root/claude_code/bugfix", "root/claude_code/bugfix/web", "root/cursor/bugfix/web/c"]), tool)).toBe(2);
    expect([radiusAt(1, 100, 1), radiusAt(2, 100, 1)]).toEqual([30, 100]);
    expect(radiusAt(3, 100, 2)).toBeCloseTo(100, 9); expect(radiusAt(2, 100, 2)).toBeGreaterThan(radiusAt(2, 100));
    expect(radiusAt(2, 100, 2.5)).toBeCloseTo((radiusAt(2, 100, 2) + radiusAt(2, 100, 3)) / 2, 9);   // the ring count tweens too
  });
  it("puts the parent of the selection at the hub, never deeper than an intent", () => {
    expect([0, 1, 2, 3, 4].map(focusDepth)).toEqual([0, 0, 1, 2, 2]);
    expect(focusOf(parts, "root/claude_code")!.id).toBe("root");
    expect(focusOf(parts, "root/claude_code/bugfix")!.id).toBe("root/claude_code");
    expect(focusOf(parts, "root/claude_code/bugfix/web/a")!.id).toBe("root/claude_code/bugfix");
  });
  it("the focus slice opens to the full turn, outsiders collapse to nothing, rings move in by the focus depth", () => {
    const w = winOf(parts.get("root/claude_code")!);
    const intents = [...parts.values()].filter((p) => p.parent === "root/claude_code").map((p) => arcOf(p, w, 200));
    expect(sum(intents.map((a) => a.a1 - a.a0))).toBeCloseTo(TAU, 9);
    expect(intents[0].r0).toBeCloseTo(BOUNDS[1] * 200, 9);
    const other = arcOf(parts.get("root/cursor")!, w, 200);
    expect(other.a1 - other.a0).toBe(0);
  });
  it("sweep scales the angles for the reveal", () => {
    const a = arcOf(parts.get("root/claude_code")!, winOf(parts.get("root")!), 100, 0.5), b = arcOf(parts.get("root/claude_code")!, winOf(parts.get("root")!), 100);
    expect(a.a1).toBeCloseTo(b.a1 / 2, 9);
  });
  it("radii rise with the ring and clamp at the centre and the rim; the window tweens linearly", () => {
    expect([radiusAt(-1, 100), radiusAt(0, 100), radiusAt(1, 100), radiusAt(4, 100), radiusAt(9, 100)]).toEqual([0, 0, 30, 100, 100]);
    expect(radiusAt(1.5, 100)).toBeCloseTo(46, 9);
    expect(lerpWin({ x0: 0, x1: 1, d: 0, n: 3 }, { x0: 0.2, x1: 0.4, d: 1, n: 2 }, 0.5)).toEqual({ x0: 0.1, x1: 0.7, d: 0.5, n: 2.5 });
    expect([easeInOut(-1), easeInOut(0), easeInOut(0.5), easeInOut(1), easeInOut(2)]).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe("sunburst drawing", () => {
  it("a sector starts at 12 o'clock and a full turn draws an inner and outer ring", () => {
    expect(arcPath(100, 100, 10, 50, 0, Math.PI / 2).startsWith("M100.00 50.00A50.00 50.00 0 0 1 150.00 100.00")).toBe(true);
    expect(arcPath(100, 100, 10, 50, 0, TAU).match(/M/g)).toHaveLength(2);
    expect(arcPath(100, 100, 0, 50, 0, 1).includes("A0.00")).toBe(false);
  });
  it("labels run along a wide arc, along the radius on a thin one, and never upside down", () => {
    const wide = labelFit(0, 0, { a0: 0, a1: 1.2, r0: 80, r1: 140 }, 8)!;
    expect(wide.chars).toBeGreaterThanOrEqual(8); expect(wide.lines).toBe(2);
    const thin = labelFit(0, 0, { a0: 1, a1: 1.12, r0: 120, r1: 200 }, 12)!;
    if (thin.mode !== "rad") throw new Error("expected a radial label");
    expect(thin.chars).toBeGreaterThanOrEqual(4); expect(thin.rot).toBeCloseTo((1.06 * 180) / Math.PI - 90, 6);
    expect(labelFit(0, 0, { a0: 1, a1: 1.01, r0: 120, r1: 130 }, 12)).toBeNull();
    for (let a = 0; a < TAU; a += 0.3) {
      const f = labelFit(0, 0, { a0: a, a1: a + 0.25, r0: 100, r1: 160 }, 6);
      if (f?.mode === "rad") { expect(f.rot).toBeGreaterThanOrEqual(-90); expect(f.rot).toBeLessThanOrEqual(90); }
    }
  });
  it("label guides run clockwise on top, counter-clockwise below, and a full turn still draws", () => {
    expect(arcLine(0, 0, 100, 0, Math.PI / 2)).toMatch(/^M0\.00 -100\.00A100\.00 100\.00 0 0 1 .*A100\.00 100\.00 0 0 1 100\.00 -?0\.00$/);
    expect(arcLine(0, 0, 100, 0, Math.PI / 2, true)).toMatch(/^M100\.00 -?0\.00A100\.00 100\.00 0 0 0 .* 0 0 0 0\.00 -100\.00$/);
    expect(arcLine(0, 0, 100, 0, TAU)).not.toMatch(/A100\.00 100\.00 0 0 1 0\.00 -100\.00$/);   // endpoint stops short of the start
  });
  it("heat is 0 at or below the average, 1 from three times it, and off with no average", () => {
    expect([heat(0.02, 0.04), heat(0.04, 0.04), heat(0.08, 0.04), heat(0.12, 0.04), heat(1, 0.04), heat(1, 0)]).toEqual([0, 0, 0.5, 1, 1, 0]);
  });
  it("the struggle edge needs 15 sessions, is capped at half and faded under 30, full from 30", () => {
    expect(edgeOf({ struggled: 1, rated: 4 }, 0.1)).toBeNull();     // 1 of 4 struggled: too few to read
    expect(edgeOf({ struggled: 1, rated: 14 }, 0.1)).toBeNull();
    expect(edgeOf({ struggled: 1, rated: 15 }, 0.1)).toEqual({ k: 0.5, faded: true });
    expect(edgeOf({ struggled: 0.2, rated: 20 }, 0.1)).toEqual({ k: 0.5, faded: true });
    expect(edgeOf({ struggled: 0.15, rated: 20 }, 0.1)?.k).toBeCloseTo(0.25, 9);
    expect(edgeOf({ struggled: 1, rated: 30 }, 0.1)).toEqual({ k: 1, faded: false });
    expect(edgeOf({ struggled: 0.05, rated: 300 }, 0.1)).toBeNull();   // below the average
    expect(edgeOf({ struggled: 0.12, rated: 300 }, 0.1)).toBeNull();   // about the average (under 1.25 times it): no edge
    expect(edgeOf({ struggled: 0.125, rated: 300 }, 0.1)?.k).toBeCloseTo(0.125, 9);
    expect(struggleNote({ struggled: 0.25, rated: 4 })).toBe("struggled: too few to read");
    expect(struggleNote({ struggled: 0.25, rated: 40 })).toBe("25% of 40 struggled");
    expect([struggleNote({ struggled: 0.25, rated: 40 }, true), struggleNote({ struggled: 0.25, rated: 4 }, true)]).toEqual(["25% struggled", "too few to read"]);
  });
  it("a radial label too long for its ring wraps onto two lines when the arc is wide enough", () => {
    const f = labelFit(0, 0, { a0: 0.3, a1: 0.65, r0: 78, r1: 146 }, "billing-api".length, 7.2)!;
    expect(f.mode).toBe("rad"); expect(f.lines).toBe(2);
    expect(split2("billing-api", f.chars)).toEqual(["billing-", "api"]);
    expect(labelFit(0, 0, { a0: 0.3, a1: 0.34, r0: 78, r1: 146 }, 11)?.lines ?? 1).toBe(1);   // too thin for a second line
  });
  it("every tool name shows in full on the sample at 1440x900 (R 261) and 1280x720 (R 200-205; R 197 on a 740px card), small type only where needed", () => {
    const p = partition(buildTree(normalize(sample as never).sessions, "sessions", new Set(["root"]))), w = winOf(p.get("root")!);
    const shows = (name: string, R: number) => {
      const f = nameFit(0, 0, arcOf(p.get(`root/${name.toLowerCase()}`)!, w, R), name);
      return f && (f.chars >= name.length || (f.mode === "rad" && f.lines === 2 && !!split2(name, f.chars))) ? (f.small ? "small" : "full") : "clipped";
    };
    for (const name of ["Antigravity", "OpenCode"]) expect(shows(name, 261)).toBe("full");
    for (const R of [197, 200, 205]) for (const name of ["Antigravity", "OpenCode"]) expect(shows(name, R)).not.toBe("clipped");
    expect(glyphW("Antigravity")).toBeLessThan(7);   // narrow letters count less than the 7px average
    expect(glyphW("MW")).toBeGreaterThan(7);
  });
  it("split2 breaks at spaces, dashes and camelCase (the head may run one over), never mid-word", () => {
    expect(split2("OpenCode", 6)).toEqual(["Open", "Code"]);
    expect(split2("Claude Code", 8)).toEqual(["Claude", "Code"]);
    expect(split2("billing-api", 8)).toEqual(["billing-", "api"]);
    expect(split2("web", 8)).toBeNull();                    // fits on one line
    expect(split2("abcdefghijklmnopqrstu", 8)).toBeNull();   // does not fit on two
    expect(split2("billing-api", 7)).toEqual(["billing-", "api"]);   // head one over: still the natural break, not "billi-ng-api"
    expect([split2("billing-api", 5), split2("explain", 4), split2("Antigravity", 6)]).toEqual([null, null, null]);   // no break that fits: clip instead
  });
  it("a clipped label uses the size that keeps more of it, and a stub under MIN_CLIP characters is dropped", () => {
    expect(MIN_CLIP).toBe(6);
    // outer ring on a ~713px card: 12px keeps 4 ("bil…"), 10.5px keeps 5: both stubs, so no label
    const stub = { a0: 0, a1: 0.15, r0: 136, r1: 170 };
    expect(labelFit(0, 0, stub, 11, glyphW("billing-api"))?.chars).toBe(4);
    expect(nameFit(0, 0, stub, "billing-api")).toBeNull();
    // a little thicker: 12px keeps 5, 10.5px keeps 6 ("billi…"), so the smaller type wins
    expect(nameFit(0, 0, { a0: 0, a1: 0.15, r0: 130, r1: 170 }, "billing-api")).toMatchObject({ mode: "rad", chars: 6, small: true });
    // a name that fits whole is untouched
    expect(nameFit(0, 0, { a0: 0, a1: 0.6, r0: 130, r1: 170 }, "infra")).toMatchObject({ small: false });
  });
  it("clip cuts with an ellipsis", () => { expect(clip("billing-api", 20)).toBe("billing-api"); expect(clip("billing-api", 5)).toBe("bill…"); });
  it("callouts keep their order, the gap and the bounds", () => {
    const s = stack([10, 12, 13, 300, 305], 30, 20, 320);
    expect(s[0]).toBe(20);
    for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(30 - 1e-9);
    expect(s.at(-1)).toBeLessThanOrEqual(320);
  });
});

describe("sunburst value lines never ellipsize numbers (QA MED-1)", () => {
  it("drop the cents, then go compact, then keep the first value of a pair, then drop the label", () => {
    expect(fitNum("$504.12", 7)).toBe("$504.12");
    expect(fitNum("$504.12", 6)).toBe("$504");   // the hub at 1000px read "$504.…"
    expect(fitNum("$18.40", 4)).toBe("$18");   // the arc label at 1120px read "$18.…"
    expect(fitNum("$1,234", 5)).toBe("$1.2k");
    expect(fitNum("$143.90/$158.10 cost", 15)).toBe("$144/$158 cost");   // the callout read "$143.90/$158.1…"
    expect(fitNum("$15.17/$65.86 cost", 10)).toBe("$15 cost");
    expect(fitNum("$1,234/$5,678 cost", 10)).toBe("$1.2k cost");
    expect(fitNum("$504.12", 2)).toBe("");
    expect(fitNum("12% of cost", 9)).toBe("");   // a share has nothing shorter: dropped, not "12% of…"
  });
  it("never show a false $0, leave percentages and decimals alone, and clip plain text as before", () => {
    expect(fitNum("$0.40", 4)).toBe("<$1");
    expect(fitNum("$0.56", 4)).toBe("$1");
    expect(fitNum("12.5% share", 9)).toBe("");
    expect(fitNum("too few to read", 8)).toBe("too few…");
    expect(fitNum("unpriced", 20)).toBe("unpriced");
  });
  it("no output for any length ends in an ellipsis or a cut number", () => {
    for (const s of ["$504.12", "$143.90/$158.10 cost", "$12,345", "5/45 sessions", "837"])
      for (let n = 1; n <= s.length; n++) { const t = fitNum(s, n); expect(t.length).toBeLessThanOrEqual(n); expect(t).not.toContain("…"); }
  });
});

describe("sunburst beside an open side panel (QA MED-3)", () => {
  it("no panel, or too little left uncovered: placed as always", () => {
    expect(placeChart(958, 446)).toEqual({ R: 205, dx: 0, moved: false });
    expect(placeChart(685, 446, 685 - MIN_VIS + 1)).toMatchObject({ dx: 0, moved: false });
  });
  it("1280: centred in the 523px left of the panel, full size; 1100: smaller to fit", () => {
    const a = placeChart(958, 446, 435);
    expect(a).toMatchObject({ R: 205, moved: true });
    expect(958 / 2 + a.dx).toBeCloseTo(523 / 2, 6);   // the hub sits mid-way across the uncovered part
    expect(958 / 2 + a.dx + a.R).toBeLessThan(523);   // the whole disc clears the panel
    const b = placeChart(785, 446, 427);
    expect(b.R).toBeCloseTo(358 / 2 - 12, 6);
    expect(785 / 2 + b.dx + b.R).toBeLessThan(358);
  });
});
