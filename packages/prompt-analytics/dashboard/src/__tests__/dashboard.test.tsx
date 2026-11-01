import { afterEach, describe, expect, it, vi } from "vitest";
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
    click(el.querySelector(".top .count"));
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
    expect(el.querySelectorAll("#s-sessions tbody tr").length).toBe(Math.min(10, src.sessions));
    expect(el.querySelector('nav[aria-label="Sessions pages"]')!.textContent).toContain(`of ${src.sessions}`);
    expect(el.querySelector(".crumbs")!.textContent).not.toMatch(/All sessions/);   // no duplicate scope text, only removable chips
    expect(el.querySelectorAll(".crumbs .crumb").length).toBe(1);
    expect(el.querySelector(".top .count")!.textContent).toContain(fmtInt(src.sessions));
    click(el.querySelector(".crumbs .crumb"));   // removing the only chip clears
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
    expect(el.querySelectorAll(".crumbs .crumb").length).toBeGreaterThan(0);
  });
  it("Escape closes the panel first, then drops the last selection", () => {
    mount();
    click(toolRow(0));
    click(el.querySelector(".top .count"));
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

describe("iteration 3: unit economics and nav", () => {
  const mountWith = (data: typeof d) => {
    el = document.createElement("div"); document.body.append(el);
    root = createRoot(el);
    act(() => root!.render(<Dashboard d={data} />));
  };
  it("basic tier renders hour-by-weekday without hour_week[].applied (schema 1.0)", () => {
    const raw = JSON.parse(JSON.stringify(sample));
    raw.schema = "1.0"; raw.engine = { ...raw.engine, mode: "basic" };
    raw.hour_week = raw.hour_week.map(({ dow, hour, prompts }: { dow: number; hour: number; prompts: number }) => ({ dow, hour, prompts }));
    mountWith(normalize(raw));
    expect(el.querySelector("#s-time .hw")).not.toBeNull();
    expect(el.querySelector('[aria-label="Heatmap shows"]')).toBeNull();
    expect(el.textContent).not.toContain("Golden hours");
  });
  it("golden hours toggle appears with the field and switches the heatmap", () => {
    mount();
    const seg = el.querySelector('[aria-label="Heatmap shows"]');
    expect(seg).not.toBeNull();
    click([...seg!.querySelectorAll("button")].find((b) => b.textContent === "Success")!);
    expect(el.querySelector("#s-golden h3")?.textContent).toBe("Hours with the highest applied rate");
  });
  it("router hatches thin cells with text and a cell click drills to tool + intent", () => {
    mount();
    const cells = [...el.querySelectorAll<HTMLButtonElement>(".rt .cell")];
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells.filter((c) => c.dataset.low !== undefined)) { expect(c.textContent).toBe("–"); expect(c.title).toMatch(/not enough data/); }
    const ok = cells.find((c) => c.dataset.low === undefined)!;
    click(ok);
    expect(location.hash).toMatch(/src=/); expect(location.hash).toMatch(/int=/);
    expect(kpi("sessions")).not.toBe(total());
  });
  it("with no prices, the cost KPI swaps to tokens per applied change (never $0)", () => {
    const raw = JSON.parse(JSON.stringify(sample));
    raw.sessions = raw.sessions.map((s: Record<string, unknown>) => ({ ...s, cost_usd: null }));
    mountWith(normalize(raw));
    expect(el.querySelector('.kpi[data-kpi="cpa"]')).toBeNull();
    const card = el.querySelector('.kpi[data-kpi="tpa"]')!;
    expect(card.hasAttribute("data-primary")).toBe(true);
    expect(card.textContent).toMatch(/record prices/);
    expect(el.querySelector(".kpis")!.textContent).not.toMatch(/\$0/);
  });
  it("cost KPI reconciles its denominators", () => {
    mount();
    expect(el.querySelector('.kpi[data-kpi="cpa"] .sub')!.textContent).toMatch(/^per applied · [\d,]+ priced of [\d,]+ applied$/);
    expect(el.querySelector('.kpi[data-kpi="applied"] .sub')!.textContent).toMatch(/of [\d,]+ sessions with prompts$/);
  });
  it("mobile More names the current section in its label (no aria-current), and closes on Esc", () => {
    // jsdom lays everything out at top 0, which the scroll-spy reads as "scrolled past every section"
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2100, left: 0, right: 0, width: 0, height: 0, x: 0, y: 2000, toJSON() {} });
    mount();
    const more = el.querySelector<HTMLButtonElement>(".bar > button")!;
    expect(more.getAttribute("aria-label")).toBe("More");
    expect(more.getAttribute("aria-controls")).toBeNull();
    click(more);
    expect(more.getAttribute("aria-controls")).toBe("more");
    expect(document.activeElement).toBe(el.querySelector("#more a"));
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(el.querySelector("#more")).toBeNull();
    click(more);
    click(el.querySelector<HTMLAnchorElement>('#more a[href*="s-sessions"]'));
    expect(more.getAttribute("aria-current")).toBeNull();
    expect(more.getAttribute("aria-label")).toBe("More, current: Sessions");
    rect.mockRestore();
  });
});
