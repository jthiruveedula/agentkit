import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

// No layout in jsdom, so this checks the span props against the grid rules in styles.css: 12 columns, sparse auto-placement.
// > 1000px container: each card's sN. <= 1000px: 12, except .half (6). <= 600px: always 12 (nothing to check).
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });

const span = (c: Element, narrow: boolean) => { const n = +(/\bs(\d+)\b/.exec(c.className)?.[1] ?? 12); return narrow && n < 12 ? (c.classList.contains("half") ? 6 : 12) : n; };
/** Rows that leave empty columns: an item that does not fit wraps and strands the rest of its row; the last row must close too. */
function holes(grid: Element, narrow: boolean): string[] {
  const bad: string[] = []; let used = 0, row: string[] = [];
  const close = () => { if (used && used < 12) bad.push(`${row.join(" + ")} = ${used}/12`); used = 0; row = []; };
  for (const c of grid.children) {
    if (c.classList.contains("sr-only")) continue;
    const s = span(c, narrow);
    if (used + s > 12) close();
    used += s; row.push(`${c.getAttribute("aria-label") ?? c.id ?? c.className} (${s})`);
    if (used === 12) close();
  }
  close();
  return bad;
}

describe("widget rows", () => {
  it("no row leaves empty columns, wide or at <=1000px", () => {
    const bad: string[] = []; let n = 0;
    for (const h of ["#/s-overview", "#/s-tools", "#/s-models"]) {   // a quiet section stays collapsed until its hash opens it
      location.hash = h;
      el = document.createElement("div"); document.body.append(el);
      root = createRoot(el);
      act(() => root!.render(<Dashboard d={d} />));
      n += el.querySelectorAll(".grid").length;
      for (const g of el.querySelectorAll(".grid")) for (const narrow of [false, true]) bad.push(...holes(g, narrow).map((x) => `${narrow ? "<=1000" : "wide"} ${g.closest("section")?.id}: ${x}`));
      act(() => root?.unmount()); el.remove(); root = null;
    }
    expect(n).toBeGreaterThan(8);   // the check really walked the section grids
    expect([...new Set(bad)]).toEqual([]);
  });
});
