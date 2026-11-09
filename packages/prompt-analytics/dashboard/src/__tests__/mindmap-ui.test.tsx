// Mind map sunburst in the DOM: tree semantics, click / double-click / keyboard, zoom, session leaf, metric switch, hotspots, narrow list.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";
import { BASIS_NOTE } from "../lib/share";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.classList.remove("fx"); });
const mount = () => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(sample as never)} />)); return el.querySelector<HTMLElement>("#s-map")!; };
const tree = (s: HTMLElement) => s.querySelector<SVGSVGElement>('svg[role="tree"]')!;
const item = (s: HTMLElement, id: string) => s.querySelector<SVGElement>(`[data-id="${id}"]`)!;
const hub = (s: HTMLElement) => s.querySelector<SVGElement>(".sb-hub")!;
const key = (t: Element, k: string) => act(() => { t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
const click = (t: Element, detail = 1) => act(() => { t.dispatchEvent(new MouseEvent("click", { bubbles: true, detail })); });

describe("mind map sunburst", () => {
  it("is a labelled tree with one tab stop, tools and intents open on first view", () => {
    const s = mount(), t = tree(s);
    expect(t.getAttribute("aria-label")).toMatch(/^Mind map sunburst: 837 sessions by tool, intent and project/);
    expect(document.getElementById(t.getAttribute("aria-describedby")!)?.textContent).toMatch(/Enter applies the filter.*End goes to the last node/);
    const items = [...s.querySelectorAll('[role="treeitem"]')];
    expect(items.filter((x) => x.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(hub(s).getAttribute("tabindex")).toBe("0");
    const tool = item(s, "root/claude_code");
    expect(tool.getAttribute("aria-level")).toBe("2"); expect(tool.getAttribute("aria-expanded")).toBe("true");
    expect(item(s, "root/claude_code/bugfix")).not.toBeNull();
    expect(s.querySelector("table caption")?.textContent).toBe("Mind map nodes");
    expect(s.textContent).toContain(BASIS_NOTE.sessions);
  });
  it("the first click on an open node selects it, the next collapses, the next expands; labels are drawn", () => {
    const s = mount();
    click(item(s, "root/claude_code"));
    expect(item(s, "root/claude_code").getAttribute("aria-selected")).toBe("true");
    expect(item(s, "root/claude_code").getAttribute("aria-expanded")).toBe("true");
    click(item(s, "root/claude_code"));
    expect(item(s, "root/claude_code").getAttribute("aria-expanded")).toBe("false");
    expect(item(s, "root/claude_code/bugfix")).toBeNull();
    click(item(s, "root/claude_code"));
    expect(item(s, "root/claude_code/bugfix")).not.toBeNull();
    expect(s.querySelectorAll(".sb-labels text").length).toBeGreaterThan(5);
  });
  it("the red edge only stands on 15+ sessions with a prompt, faded under 30; readouts show n or 'too few to read'", () => {
    const s = mount(), edges = [...s.querySelectorAll<SVGElement>(".sb-edge")];
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) {
      const n = Number(/of ([\d,]+) struggled/.exec(item(s, e.dataset.edge!).getAttribute("aria-label")!)![1].replace(/,/g, ""));
      expect(n).toBeGreaterThanOrEqual(15);
      expect(e.hasAttribute("data-faded")).toBe(n < 30);
    }
    const few = [...s.querySelectorAll<SVGElement>(".sb-arc")].filter((a) => a.getAttribute("aria-label")!.includes("struggled: too few to read"));
    expect(few.length).toBeGreaterThan(0);
    for (const a of few) expect(s.querySelector(`.sb-edge[data-edge="${a.dataset.id}"]`)).toBeNull();
    expect(hub(s).textContent).toMatch(/\d+% (of [\d,]+ )?struggled/);   // the short form on a small hub (jsdom: R 188)
    expect(s.querySelector(".k-heat")?.textContent).toContain("15+ sessions");
  });
  it("pointer focus does not select; a double-click applies the node its first click picked", () => {
    const s = mount(), cursor = item(s, "root/cursor");
    act(() => { cursor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); cursor.focus(); });
    expect(cursor.getAttribute("aria-selected")).toBe("false");
    click(cursor);
    expect(item(s, "root/cursor").getAttribute("aria-selected")).toBe("true");
    click(item(s, "root/copilot"), 2);   // the arcs moved under the pointer: the second click lands elsewhere
    expect(location.hash).toContain("src=cursor");
    expect(location.hash).not.toContain("src=copilot");
  });
  it("Space or Enter on the root hub never collapses the chart; End goes to the last node", () => {
    const s = mount();
    act(() => hub(s).focus());
    key(hub(s), " "); key(hub(s), "Enter");
    expect(item(s, "root/claude_code")).not.toBeNull();
    key(hub(s), "End");
    const rows = [...s.querySelectorAll("table tbody tr")];
    expect(s.querySelector('[aria-selected="true"]')?.getAttribute("data-id")).toBe(`root/${rows.at(-1)!.firstElementChild!.textContent}`);
  });
  it("keeps keyboard focus on the selection through an animated zoom (html.fx, rAF stubbed)", () => {
    const s = mount();
    act(() => item(s, "root/claude_code").focus());
    key(item(s, "root/claude_code"), "ArrowRight");   // into the first intent: the tool becomes the hub
    const intent = s.querySelector<SVGElement>('[aria-selected="true"]')!;
    expect(document.activeElement).toBe(intent);
    expect(hub(s).getAttribute("data-id")).toBe("root/claude_code");
    if (intent.getAttribute("aria-expanded") === "true") key(intent, "ArrowLeft");   // close it first, so the next ArrowLeft steps out
    document.documentElement.classList.add("fx");
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 400, left: 0, right: 700, width: 700, height: 400, x: 0, y: 0, toJSON() {} } as DOMRect);
    key(document.activeElement!, "ArrowLeft");   // zoom out to the root: the tool arc grows back out of the hub
    expect(hub(s).getAttribute("data-id")).toBe("root");
    const cur = () => s.querySelector<SVGElement>('.sb-arc[aria-selected="true"]');
    expect(cur()?.getAttribute("data-id")).toBe("root/claude_code");
    expect(document.activeElement).toBe(cur());   // first frame, mid-tween
    for (let i = 0; i < 3 && frames.length; i++) act(() => frames.shift()!(performance.now() + 100 * (i + 1)));
    expect(document.activeElement).toBe(cur());
    act(() => { while (frames.length) frames.shift()!(performance.now() + 5000); });
    expect(document.activeElement).toBe(cur());
    expect(document.activeElement?.getAttribute("data-id")).toBe("root/claude_code");
  });
  it("double-click drills: pushes the node's filter", () => {
    const s = mount();
    click(item(s, "root/cursor"), 2);
    expect(location.hash).toContain("src=cursor");
  });
  it("arrows move around the ring, Enter drills, Home returns to the centre", () => {
    const s = mount(), first = item(s, "root/claude_code");
    act(() => first.focus());
    key(first, "ArrowDown");
    const sel = s.querySelector('[aria-selected="true"]')!;
    expect(sel.getAttribute("data-id")).toBe("root/copilot");
    expect(sel.getAttribute("tabindex")).toBe("0");
    key(sel, "Enter");
    expect(location.hash).toContain("src=copilot");
    key(item(s, "root/copilot"), "Home");
    expect(hub(s).getAttribute("aria-selected")).toBe("true");
  });
  it("picking an intent zooms into its tool; the hub and the Zoom out button go back", () => {
    const s = mount();
    click(item(s, "root/claude_code/bugfix"));
    expect(hub(s).getAttribute("data-id")).toBe("root/claude_code");
    expect(hub(s).getAttribute("aria-label")).toMatch(/^Claude Code: .*Centre: zoom out$/);
    expect(item(s, "root/cursor")).toBeNull();
    const out = [...s.querySelectorAll("button")].find((b) => b.textContent === "Zoom out to Your AI work")!;
    click(out);
    expect(hub(s).getAttribute("data-id")).toBe("root");
    click(item(s, "root/claude_code/bugfix"));
    click(hub(s));
    expect(hub(s).getAttribute("data-id")).toBe("root");
  });
  it("a session leaf opens the side panel", () => {
    const s = mount();
    const proj = s.querySelector<SVGElement>('.sb-arc[data-kind="project"]')!;
    click(proj);
    const ses = s.querySelector<SVGElement>('.sb-arc[data-kind="session"]')!;
    expect(ses).not.toBeNull();
    click(ses);
    expect(location.hash).toMatch(/sel=s\d+/);
  });
  it("the metric switch resizes arcs and relabels the hub", () => {
    const s = mount(), d0 = item(s, "root/copilot").getAttribute("d");
    expect(s.querySelector('.sb-edge[data-edge^="root/copilot/"]')).not.toBeNull();   // copilot/bugfix struggles on sessions
    click([...s.querySelectorAll<HTMLButtonElement>('[aria-label="Size nodes by"] button')].find((b) => b.textContent === "Cost")!);
    expect(item(s, "root/copilot").getAttribute("d")).not.toBe(d0);
    expect(tree(s).getAttribute("aria-label")).toContain("arcs sized by cost");
    expect(hub(s).textContent).toMatch(/\$/);
    // Copilot has no priced session: it reads "unpriced" (not $0) and is hatched
    expect(item(s, "root/copilot").getAttribute("aria-label")).toContain("cost unpriced");
    expect([...s.querySelectorAll<SVGPathElement>(".sb-deco path")].some((p) => p.style.fill.includes("hatch"))).toBe(true);
    expect(s.querySelector('.sb-edge[data-edge^="root/copilot"]')).toBeNull();   // no red edge on an unpriced sliver: its size means nothing
  });
  it("the hub readout follows real pointer moves only, and clears off the arcs", () => {
    const s = mount(), move = (t: Element, dx: number) => act(() => {
      const e = new PointerEvent("pointermove", { bubbles: true });
      Object.defineProperties(e, { movementX: { value: dx }, movementY: { value: 0 } });
      t.dispatchEvent(e);
    });
    const root = hub(s).textContent;
    move(item(s, "root/cursor"), 0);   // an arc sliding under a still pointer (a zoom): ignored
    expect(hub(s).textContent).toBe(root);
    move(item(s, "root/cursor"), 2);
    expect(hub(s).textContent).toContain("Cursor");
    move(tree(s), 2);   // empty chart space
    expect(hub(s).textContent).toBe(root);
  });
  it("hotspots get a dashed arc or a callout and a chip; the callout says how much of the project is in that branch", () => {
    const s = mount();
    expect(s.querySelectorAll(".mm-hots .chip").length).toBeGreaterThan(0);
    expect(s.querySelectorAll(".sb-call").length).toBe(s.querySelectorAll(".mm-hots .chip").length);
    expect(s.querySelector(".sb-call .sb-rank")?.textContent).toBe("1");
    for (const c of s.querySelectorAll(".sb-call")) expect(c.textContent).toMatch(/[\d,]+ of [\d,]+ sessions here|[\d,]+\/[\d,]+ sessions/);
    expect(s.querySelectorAll(".sb-call .sb-hit")).toHaveLength(s.querySelectorAll(".sb-call").length);
    // the chip row stays short (share and friction; the lede names the basis), the chip's name keeps the count
    expect(s.querySelector(".mm-hots > .muted")!.textContent).toBe("Hotspots by cost × friction (% of sessions):");
    for (const c of s.querySelectorAll(".mm-hots .chip")) {
      expect(c.querySelector(".meta")!.textContent).toMatch(/^\d+% · friction \d\.\d\d$/);
      expect(c.getAttribute("aria-label")).toMatch(/[\d,]+ sessions · \d+% of sessions, friction \d\.\d\d\./);
    }
    // a small hub drops its share line, so every arc speaks it
    expect(item(s, "root/cursor").getAttribute("aria-label")).toMatch(/^Cursor: [\d,]+ sessions, \d+% of sessions, /);
  });
  it("hotspots hide once a single project is filtered", () => {
    const s = mount();
    click(s.querySelector(".mm-hots .chip")!);
    expect(location.hash).toContain("prj=");
    expect(s.querySelector(".mm-hots")).toBeNull();
    expect(s.querySelectorAll(".sb-call")).toHaveLength(0);
  });
  it("narrow cards (375px) get the indented list instead", () => {
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("mm") ? ({ width: 343, height: 600, top: 0, left: 0, right: 343, bottom: 600, x: 0, y: 0, toJSON() {} } as DOMRect) : real.call(this);
    });
    const s = mount();
    expect(tree(s)).toBeNull();
    const list = s.querySelector(".mm-list")!;
    expect(list.getAttribute("aria-label")).toBe("Mind map as an indented list");
    // only the root and the hotspot paths start open, so the list is a short summary (not ~120 rows)
    const n = list.querySelectorAll(".mm-row").length;
    expect(n).toBeLessThan(60);
    const hotTools = new Set([...s.querySelectorAll(".mm-name .sr-only")].map((x) => x.closest<HTMLElement>(".mm-row")!.dataset.id!.split("/").slice(0, 2).join("/")));
    for (const r of list.querySelectorAll<HTMLButtonElement>('.mm-row[data-id^="root/"]')) if (r.dataset.id!.split("/").length === 2) expect(r.getAttribute("aria-expanded")).toBe(String(hotTools.has(r.dataset.id!)));
    // the Filter chips stay out of the tab order (the bar's "Apply filter" does the same for the selected row)
    const chips = list.querySelectorAll(".mm-go");
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) expect(c.getAttribute("tabindex")).toBe("-1");
    const row = list.querySelector<HTMLButtonElement>('[data-id="root/cursor"]')!;
    const was = row.getAttribute("aria-expanded");
    click(row);
    expect(row.getAttribute("aria-expanded")).toBe(was === "true" ? "false" : "true");
  });
});
