import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { collapse, groupBySession } from "../components/ReviewQueue";
import { normalize } from "../data/load";
import { views } from "../lib/filter";
import { fmtInt } from "../lib/format";
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
const kpi = (name: string) => el.querySelector(`.kpi[data-kpi="${name}"] .val`)!.textContent!;
const click = (n: Element | null) => act(() => { (n as HTMLElement).click(); });
const total = () => fmtInt(d.sessions.length);
const toolRow = (i = 0) => el.querySelectorAll<HTMLButtonElement>(".sc tbody th button")[i];

describe("one-page drilldown", () => {
  it("renders every section on one page with no tabs or story", () => {
    mount();
    for (const id of ["s-overview", "s-tools", "s-time", "s-funnel", "s-friction", "s-works", "s-exposure", "s-recs", "s-sessions"]) expect(el.querySelector(`#${id}`)).not.toBeNull();
    expect(el.querySelector('[role="tab"]')).toBeNull();
    expect(el.querySelector(".panel")).toBeNull();
    expect(kpi("sessions")).toBe(total());
  });
  it("every chart has an sr-only table", () => {
    mount();
    expect(el.querySelectorAll(".sr-only table").length).toBeGreaterThanOrEqual(8);
  });
  it("tool row -> filter -> list panel -> session detail -> back", () => {
    mount();
    const src = views(d, {}).sources[0];
    const row = toolRow(0);
    click(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(kpi("sessions")).toBe(fmtInt(src.sessions));
    expect(location.hash).toContain(`src=${src.key}`);
    expect(el.querySelector(".panel")).toBeNull();
    click([...el.querySelectorAll<HTMLButtonElement>(".metaline .link")].at(-1)!);
    const panel = el.querySelector(".panel")!;
    expect(panel.getAttribute("data-mode")).toBe("list");
    expect(panel.querySelectorAll(".srow").length).toBe(Math.min(100, src.sessions));
    click(panel.querySelector(".srow"));
    expect(el.querySelector(".panel")!.getAttribute("data-mode")).toBe("detail");
    expect(el.querySelector(".facts")).not.toBeNull();
    expect(el.querySelectorAll(".track li").length).toBe(6);
    expect(location.hash).toContain("sel=");
    click([...el.querySelectorAll<HTMLButtonElement>(".panel-h .btn")].find((b) => b.textContent === "Back")!);
    expect(el.querySelector(".panel")!.getAttribute("data-mode")).toBe("list");
    click([...el.querySelectorAll<HTMLButtonElement>(".panel-h .btn")].find((b) => b.textContent === "Close")!);
    expect(el.querySelector(".panel")).toBeNull();
    expect(kpi("sessions")).toBe(fmtInt(src.sessions));   // closing the panel keeps the filter
  });
  it("clicking the same mark again toggles the filter off", () => {
    mount();
    click(toolRow(0));
    click(toolRow(0));
    expect(kpi("sessions")).toBe(total());
  });
  it("numbers agree between the KPI strip, the sessions table and the breadcrumb under one filter", () => {
    mount();
    const src = views(d, {}).sources[0];
    click(toolRow(0));
    expect(el.querySelectorAll("#s-sessions tbody tr").length).toBe(Math.min(100, src.sessions));
    expect(el.querySelector(".crumbs")!.textContent).toMatch(/All sessions/);
    expect(el.querySelectorAll(".crumbs .crumb").length).toBe(2);
    click(el.querySelector(".crumbs .crumb"));   // "All sessions" clears
    expect(kpi("sessions")).toBe(total());
  });
  it("a calendar day filters to that date", () => {
    mount();
    const cell = el.querySelector<HTMLButtonElement>(".cal button.cell:not([data-zero])")!;
    click(cell);
    expect(cell.getAttribute("aria-pressed")).toBe("true");
    expect(location.hash).toMatch(/from=\d{4}-\d\d-\d\d/);
    expect(Number(kpi("sessions").replace(/,/g, ""))).toBeLessThan(d.sessions.length);
  });
  it("a funnel stage filters to sessions that reached it", () => {
    mount();
    click(el.querySelectorAll('ul[aria-label="Sessions reaching each funnel stage"] .bar-row')[4]);
    expect(kpi("sessions")).toBe(fmtInt(views(d, { stage: 5 }).totals.sessions));
  });
  it("Show evidence applies the insight filter and opens the list", () => {
    mount();
    const rec = d.recommendations.find((r) => { const i = d.insights.find((x) => x.id === r.evidence_insight); return i && Object.keys(i.drill.filter).length > 0; })!;
    click(el.querySelector(`[data-rec="${rec.id}"] button`));
    expect(el.querySelector(".panel")).not.toBeNull();
    expect(el.querySelectorAll(".crumbs .crumb").length).toBeGreaterThan(1);
  });
  it("Escape closes the panel first, then drops the last selection", () => {
    mount();
    click(toolRow(0));
    click([...el.querySelectorAll<HTMLButtonElement>(".metaline .link")].at(-1)!);
    const esc = () => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    esc();
    expect(el.querySelector(".panel")).toBeNull();
    expect(kpi("sessions")).not.toBe(total());
    esc();
    expect(kpi("sessions")).toBe(total());
  });
  it("a pasted hash restores the filter", () => {
    const src = views(d, {}).sources[0];
    location.hash = `#/s-friction?src=${src.key}`;
    mount();
    expect(kpi("sessions")).toBe(fmtInt(src.sessions));
  });
  it("sorting the sessions table reorders rows", () => {
    mount();
    const first = () => el.querySelector("#s-sessions tbody time")!.getAttribute("datetime");
    const a = first();
    click(el.querySelector('#s-sessions th[aria-sort] .th-b'));
    expect(first()).not.toBe(a);
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
