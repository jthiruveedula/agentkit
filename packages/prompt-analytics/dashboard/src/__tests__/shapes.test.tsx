// What renders for each data shape: one tool of each source, two tools, five, nothing priced, basic engine,
// a first week, an older export with fields missing, and an empty one. Plus the pure capabilities() flags.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import { SHAPES, onlySources } from "../data/shapes";
import { capabilities, sectionsFor, unlockText, unpricedNote } from "../lib/capabilities";
import { views } from "../lib/filter";
import { SOURCES } from "../lib/palette";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
type Raw = Record<string, unknown>;
const raw = sample as unknown as Raw;
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; try { localStorage.clear(); } catch { /* ignore */ } });
const mount = (r: Raw) => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(r)} />)); act(() => el.querySelector<HTMLButtonElement>("#s-tools.quiet button")?.click()); };
const caps = (r: Raw) => { const d = normalize(r); return capabilities(d, views(d, {})); };
const navIds = () => [...el.querySelectorAll<HTMLAnchorElement>("nav.side a")].map((a) => a.getAttribute("href")!.match(/s-[a-z]+/)![0]);
const has = (sel: string) => el.querySelector(sel) !== null;

const FULL = ["s-overview", "s-tools", "s-time", "s-funnel", "s-friction", "s-works", "s-exposure", "s-sessions", "s-map"];

describe("capabilities()", () => {
  it("counts tools, prices and span from the rows in view", () => {
    const all = caps(raw);
    expect(all).toMatchObject({ multiTool: true, sourceCount: 5, hasCost: true, hasGalaxy: true, hasWhatWorks: true, enoughForTrend: true, tooSmall: false, empty: false });
    expect(all.unpriced.length).toBeGreaterThan(0);
    const one = caps(onlySources(raw, ["claude_code"]));
    expect(one).toMatchObject({ multiTool: false, sourceCount: 1, sources: ["claude_code"], names: "Claude Code" });
  });
  it("is recomputed from the filtered rows, so a one-tool filter behaves like a one-tool user", () => {
    const d = normalize(raw);
    const c = capabilities(d, views(d, { source: "copilot" }));
    expect(c).toMatchObject({ multiTool: false, sources: ["copilot"], hasCost: false, allUnpriced: true });
    expect(unpricedNote(c)).toBe("Copilot doesn't record prices.");
  });
  it("flags basic engine, a first week and empty exports", () => {
    expect(caps(SHAPES.basic(raw))).toMatchObject({ hasGalaxy: false, hasWhatWorks: false, hasModel: false });
    const s = caps(SHAPES.small(raw));
    expect(s.tooSmall).toBe(true); expect(s.moreDays).toBeGreaterThan(0);
    expect(unlockText(s, false)).toMatch(/\d+ more days?/);
    const e = normalize(SHAPES.empty(raw));
    expect(capabilities(e, views(e, {})).empty).toBe(true);
    expect(sectionsFor(capabilities(e, views(e, {})), e, views(e, {})).size).toBe(0);
  });
  it("an older export without optional tables does not crash", () => {
    const c = caps(SHAPES.missing(raw));
    expect(c.hasHourApplied).toBe(false); expect(c.hasTtr).toBe(false);
  });
});

describe("what renders per shape", () => {
  for (const src of SOURCES) {
    it(`one tool: ${src}`, () => {
      mount(onlySources(raw, [src]));
      for (const id of FULL) expect(has(`#${id}`), id).toBe(true);
      expect(navIds()).toContain("s-tools");
      expect(has(".sc")).toBe(false);                    // no per-tool scorecard ("1 of 1")
      expect(has("#s-router")).toBe(true);               // pivoted to intent x project
      expect(el.querySelector("#s-tools h2")?.textContent).toBe("Projects");
      expect(has(".hint")).toBe(true);                   // pointer to other tools
    });
  }
  it("two tools: pairwise phrasing and a scorecard", () => {
    mount(onlySources(raw, ["claude_code", "cursor"]));
    expect(has(".sc")).toBe(true);
    expect(el.querySelector("#s-tools .sec-h")?.textContent).toMatch(/Claude Code or Cursor/);
    expect(has(".hint")).toBe(false);
  });
  it("five tools: full tool comparison", () => {
    mount(raw);
    expect(navIds()).toEqual(expect.arrayContaining(FULL));
    expect(has(".sc")).toBe(true);
    expect(el.querySelector("#s-tools h2")?.textContent).toBe("Tools");
    expect(has('.kpi[data-kpi="cpa"]')).toBe(true);
  });
  it("Copilot only: no cost KPIs or charts, tokens stand in", () => {
    mount(onlySources(SHAPES["no-prices"](raw), ["copilot"]));
    expect(has('.kpi[data-kpi="cpa"]')).toBe(false);
    expect(has('.kpi[data-kpi="tpa"]')).toBe(true);
    expect(has("#s-tokens")).toBe(true);
    const txt = (s: string) => el.querySelector(s)?.textContent ?? "";
    for (const s of [".kpis", "#s-time", "#s-tools"]) expect(txt(s), s).not.toMatch(/\$\d/);
    expect(txt("#s-time")).not.toMatch(/Cost, weekly/);
    expect(txt(".kpis")).toMatch(/Copilot doesn't record prices/);
    expect(el.querySelector('[aria-label="Metric"]')?.textContent ?? "").not.toMatch(/Cost/);
  });
  it("no prices anywhere: no $0, tokens per applied change", () => {
    mount(SHAPES["no-prices"](raw));
    expect(has('.kpi[data-kpi="cpa"]')).toBe(false);
    expect(el.querySelector(".kpis")!.textContent).not.toMatch(/\$0/);
    expect(has("#s-tokens")).toBe(true);
  });
  it("basic engine: no playbook or galaxy, with a note on what unlocks them", () => {
    mount(SHAPES.basic(raw));
    expect(has("#s-playbook.unlock")).toBe(true);
    expect(el.querySelector("#s-playbook")?.textContent).toMatch(/ML engine|prompt-analytics\[ml\]/);
    expect(has(".banner")).toBe(true);
  });
  it("a first week: not-enough-data state naming what unlocks it, no trend sections", () => {
    mount(SHAPES.small(raw));
    expect(el.querySelector(".unlock")?.textContent).toMatch(/\d+ more days?/);
    expect(navIds()).not.toContain("s-time");
    expect(has("#s-time")).toBe(false);
    expect(has("#s-overview")).toBe(true);
  });
  it("an older export with fields missing still renders every section", () => {
    mount(SHAPES.missing(raw));
    for (const id of ["s-overview", "s-tools", "s-time", "s-sessions"]) expect(has(`#${id}`), id).toBe(true);
  });
  it("empty: a friendly empty state and no nav", () => {
    mount(SHAPES.empty(raw));
    expect(el.querySelector(".empty-state")?.textContent).toMatch(/No sessions yet/);
    expect(navIds()).toEqual([]);
    expect(has(".kpis")).toBe(false);
  });
  it("the other-tools tip dismisses and stays dismissed", () => {
    mount(onlySources(raw, ["claude_code"]));
    act(() => { el.querySelector<HTMLButtonElement>(".hint button")!.click(); });
    expect(has(".hint")).toBe(false);
    expect(localStorage.getItem("pa.hint.tools")).toBe("1");
  });
});
