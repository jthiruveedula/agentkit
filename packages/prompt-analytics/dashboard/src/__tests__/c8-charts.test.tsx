import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const mount = (hash: string) => { location.hash = hash; el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(sample)} />)); };
const card = (t: string) => [...el.querySelectorAll<HTMLElement>(".card")].find((c) => c.getAttribute("aria-label") === t)!;

describe("cycle 8 chart fixes", () => {
  it("calendar keeps out-of-window days (dimmed) when a date filter is set", () => {
    const last = (sample as { range: { end: string } }).range.end;
    mount(`#/s-time?from=${last}&to=${last}`);
    const cal = el.querySelector(".cal")!;
    expect(cal.querySelectorAll(".cell[data-out]").length).toBeGreaterThan(0);
    expect(cal.querySelector(".cell[data-out]")!.getAttribute("aria-label")).toMatch(/outside this view/);
  });

  it("signals is a heat table with an All column and one per tool, values printed", () => {
    mount("#/s-friction");
    const t = card("Signals behind struggle").querySelector("table.sg")!;
    expect(t.querySelector("caption")).not.toBeNull();
    const heads = [...t.querySelectorAll("thead th")].map((h) => h.textContent);
    expect(heads.slice(0, 2)).toEqual(["Signal", "All"]);
    expect(heads.length).toBeGreaterThan(2);
    expect(t.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(t.querySelector("tbody td")!.textContent).toMatch(/^\d+(\.\d)?%$/);
  });

  it("loop breaker draws a segment only between adjacent buckets", () => {
    mount("#/s-friction");
    const lines = card("Loop breaker").querySelectorAll("line.lb-line");
    const ok = [...card("Loop breaker").querySelectorAll(".lb-dot")].length;
    expect(lines.length).toBeLessThanOrEqual(Math.max(0, ok - 1));
    expect(card("Loop breaker").querySelector("polyline.lb-line")).toBeNull();
  });

  it("Where it went scales bars to the longest share", () => {
    mount("#/s-overview");
    expect(el.querySelector(".wh-h .wh-t")!.textContent).toMatch(/^Share \(longest = \d+%\)$/);
    const w = [...el.querySelectorAll<HTMLElement>(".wh-b")].map((b) => parseFloat(b.style.getPropertyValue("--w")));
    expect(Math.max(...w)).toBeCloseTo(1, 5);
  });

  it("dumbbell within-noise now dot is hollow, not blue", () => {
    mount("#/s-friction?from=2026-09-01&to=2026-10-25&cmp=prev");
    const dots = [...card("Retries by intent").querySelectorAll(".dbt .c")];
    for (const c of dots) expect(c.className).toMatch(/\b(bad|good|n)\b|^c $/);
    expect(card("Retries by intent").textContent).toMatch(/hollow = within noise/);
  });
});
