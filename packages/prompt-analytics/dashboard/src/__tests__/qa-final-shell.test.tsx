// Final QA: Escape steps the panel back one level, attention honours the filters,
// the Wrapped live region mounts empty, and the header's accessible names.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import { UNFILTERED, attention } from "../lib/attention";
import { views } from "../lib/filter";
import { WRAP_KEY } from "../lib/wrapped";
import { SAY_MS } from "../components/Wrapped";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
let root: Root | null = null, el: HTMLDivElement;
const mount = (hash: string) => {
  location.hash = hash;
  el = document.createElement("div"); document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(<Dashboard d={d} />));
};
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; vi.useRealTimers(); });
const click = (b: Element | null) => act(() => { (b as HTMLElement).click(); });
const esc = () => act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
const mode = () => el.querySelector(".panel")?.getAttribute("data-mode") ?? "none";

describe("side panel", () => {
  it("Sessions list -> Session detail: one Escape closes only the detail, the next closes the list", () => {
    mount("#/s-overview");
    click(el.querySelector(".top .count"));
    click(el.querySelector(".panel .srow"));
    expect(mode()).toBe("detail");
    esc();
    expect(mode()).toBe("list");
    const row = el.querySelector(".panel .srow[aria-current]");
    expect(row).not.toBeNull();
    expect(document.activeElement).toBe(row);
    esc();
    expect(mode()).toBe("none");
  });
  it("an open session adds no header chip (the panel names it), so the sticky header does not grow", () => {
    mount(`#/s-overview?sel=${d.sessions[0].id}`);
    expect(mode()).toBe("detail");
    expect(el.querySelector(".top-r3")).toBeNull();
  });
});

describe("header names", () => {
  it("the Filters button reads 'Filters, 2 active' and the unknown model chip 'Model: Unknown'", () => {
    mount("#/s-overview?prj=billing-api&mdl=");
    expect(el.querySelector(".fbtn")!.getAttribute("aria-label")).toBe("Filters, 2 active");
    expect(el.querySelector(".crumbs")!.textContent).toMatch(/Model: Unknown/);
  });
});

describe("attention honours the filters", () => {
  const model = "gpt-5-mini";   // the QA case: no sessions on the Aug 12 cost spike, none from Antigravity
  const at = (f: Parameters<typeof views>[1]) => { const v = views(d, f); return attention(d, v, f, new Set(v.rows.map((r) => r.id))); };
  it("gpt-5-mini drops the whole-export cost spike and Antigravity's data health", () => {
    expect(attention(d, views(d, {}), {}, null).map((x) => x.id)).toContain("anom-2026-08-12");
    const ids = at({ model }).map((x) => x.id);
    expect(ids).not.toContain("anom-2026-08-12");
    expect(ids).not.toContain("src-antigravity");
  });
  it("under a model filter, global items show only when the view has sessions they touch, and say they are not filtered", () => {
    const f = { model }, v = views(d, f), its = attention(d, v, f, new Set(v.rows.map((r) => r.id)));
    const tools = new Set<string>(v.rows.map((r) => r.source)), days = new Set(v.rows.map((r) => r.date));
    for (const it of its) {
      if (it.id.startsWith("src-") || it.id.startsWith("aband-")) expect(tools.has(it.id.split("-")[1])).toBe(true);
      if (it.id.startsWith("src-")) expect(it.headline.endsWith(UNFILTERED)).toBe(true);
      if (it.id.startsWith("anom-")) { expect(days.has(it.id.slice(5))).toBe(true); expect(it.headline.endsWith(UNFILTERED)).toBe(true); }
    }
  });
  it("a tool filter hides another tool's data health", () => {
    const deg = d.sources.find((s) => s.status === "degraded")!;
    const other = [...new Set(d.sessions.map((r) => r.source))].find((s) => s !== deg.source)!;
    const f = { source: other }, v = views(d, f);
    expect(attention(d, v, f, new Set(v.rows.map((r) => r.id))).map((x) => x.id)).not.toContain(`src-${deg.source}`);
  });
});

describe("Weekly Wrapped live region", () => {
  it("mounts empty and is filled a beat later, so screen readers announce it", () => {
    vi.useFakeTimers();
    localStorage.removeItem(WRAP_KEY);
    mount("#/s-overview");
    const live = el.querySelector('.brief .b-acts [role="status"]')!;
    expect(el.querySelector(".brief .b-acts .btn[data-due]")).not.toBeNull();
    expect(live.textContent).toBe("");
    act(() => { vi.advanceTimersByTime(SAY_MS); });
    expect(live.textContent).toBe("Your weekly Wrapped is ready");
  });
});
