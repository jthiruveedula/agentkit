import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { collapse, groupBySession } from "../components/ReviewQueue";
import { normalize } from "../data/load";
import { views } from "../lib/filter";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
let root: Root | null = null;
let el: HTMLDivElement;
const mount = () => {
  el = document.createElement("div"); document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(<Dashboard d={d} />));
};
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const kpi = (name: string) => [...el.querySelectorAll(".kpi")].find((k) => k.querySelector("dt")?.textContent === name)!.querySelector("dd")!.textContent!;
const click = (n: Element | null) => act(() => { (n as HTMLElement).click(); });

describe("dashboard drilldown", () => {
  it("starts with no drawer, all sessions in the KPI strip", () => {
    mount();
    expect(el.querySelector("#drawer")).toBeNull();
    expect(kpi("Sessions")).toBe(String(d.sessions.length));
  });
  it("clicking a source bar filters everything and opens the drawer on those sessions", () => {
    mount();
    const row = el.querySelector<HTMLButtonElement>('ul[aria-label="Sessions by source"] .bar-row')!;
    const src = views(d, {}).sources[0];
    click(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(kpi("Sessions")).toBe(String(src.sessions));
    const drawer = el.querySelector("#drawer")!;
    expect(drawer).not.toBeNull();
    expect(drawer.querySelectorAll(".srow").length).toBe(Math.min(100, src.sessions));
    // breadcrumb chip in the filter bar clears it
    click(el.querySelector(".crumbs .crumb"));
    expect(kpi("Sessions")).toBe(String(d.sessions.length));
  });
  it("clicking the same mark again toggles the filter off", () => {
    mount();
    const sel = 'ul[aria-label="Sessions by intent"] .bar-row';
    click(el.querySelector(sel));
    expect(el.querySelector(sel)!.getAttribute("aria-pressed")).toBe("true");
    click(el.querySelector(sel));
    expect(kpi("Sessions")).toBe(String(d.sessions.length));
  });
  it("a calendar day opens the drawer for that day", () => {
    mount();
    click(el.querySelector("#tab-time"));
    const cell = el.querySelector<HTMLButtonElement>("button.cell")!;
    click(cell);
    const day = cell.getAttribute("aria-label")!;
    expect(el.querySelector("#drawer")).not.toBeNull();
    expect(day).toMatch(/sessions/);
    expect(el.querySelectorAll(".drawer .srow").length).toBeGreaterThan(0);
    expect(el.querySelectorAll(".drawer .srow time").length).toBe(el.querySelectorAll(".drawer .srow").length);
  });
  it("a funnel stage filters to sessions that reached it", () => {
    mount();
    click(el.querySelector("#tab-funnel"));
    click(el.querySelectorAll('ul[aria-label="Sessions reaching each funnel stage"] .bar-row')[4]);
    expect(kpi("Sessions")).toBe(String(views(d, { stage: 5 }).totals.sessions));
  });
  it("insight Evidence applies the insight's drill filter and switches tab", () => {
    mount();
    click(el.querySelector("#tab-recommend"));
    const ins = d.insights.find((i) => Object.keys(i.drill.filter).length > 0)!;
    click(el.querySelector(`button[aria-label="Evidence for: ${ins.claim}"]`));
    expect(el.querySelector("#drawer")).not.toBeNull();
    expect(el.querySelector(".crumbs .crumb")).not.toBeNull();
  });
  it("Escape closes the drawer; sort control reorders rows", () => {
    mount();
    click(el.querySelector('ul[aria-label="Sessions by source"] .bar-row'));
    const first = () => el.querySelector(".drawer .srow time")!.getAttribute("datetime");
    const a = first();
    click(el.querySelector('.drawer button[aria-label^="Descending"]'));
    expect(first()).not.toBe(a);
    act(() => { el.querySelector("#drawer")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(el.querySelector("#drawer")).toBeNull();
  });
});

describe("exposure grouping", () => {
  it("groups items by session and keeps order", () => {
    const items = d.exposure.items;
    const g = groupBySession(items);
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(items.length);
    expect(g.length).toBeLessThan(items.length); // sample has multi-finding sessions
    for (const x of g) expect(new Set(x.items.map((i) => i.session ?? i.id)).size).toBe(1);
  });
  it("queue renders one group per session", () => {
    mount();
    click(el.querySelector("#tab-friction"));
    const groups = el.querySelectorAll(".rq-group");
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.length).toBeLessThanOrEqual(8);
    expect(el.querySelector(".rq-prev.blur")).not.toBeNull(); // masked + blurred until revealed
  });
  it("cross-filter narrows the queue to the selected sessions", () => {
    const src = d.exposure.items[0].source;
    const ids = new Set(views(d, { source: src }).rows.map((r) => r.id));
    const want = groupBySession(d.exposure.items.filter((i) => i.session !== undefined && ids.has(i.session))).length;
    const all = groupBySession(d.exposure.items).length;
    expect(want).toBeLessThan(all);
    el = document.createElement("div"); document.body.append(el);
    root = createRoot(el);
    act(() => root!.render(<Dashboard d={d} initialFilter={{ source: src }} />));
    click(el.querySelector("#tab-friction"));
    expect(el.querySelectorAll(".rq-group").length).toBe(Math.min(8, want));
  });
});

describe("review queue collapse", () => {
  it("merges identical previews within a session and keeps every id", () => {
    const it = (id: string, preview: string | null) => ({ id, session: "s", source: "copilot" as const, date: "2026-01-01", session_title: null, category: "pii" as const, kinds: ["email"], preview, status: "open" as const });
    const out = collapse([it("a", "x"), it("b", "x"), it("c", "y"), it("d", null), it("e", null)]);
    expect(out.map((g) => g.map((i) => i.id))).toEqual([["a", "b"], ["c"], ["d"], ["e"]]);
  });
});
