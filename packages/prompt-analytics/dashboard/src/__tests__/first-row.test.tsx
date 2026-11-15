import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const mount = () => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={d} />)); };

describe("first row: Brief ring and Key numbers tiles", () => {
  it("renders the named ring and six labelled tiles, each with an icon", () => {
    mount();
    const ring = el.querySelector(".brief .b-ring")!;
    expect(ring.querySelector("svg.ring")).not.toBeNull();
    expect(ring.getAttribute("aria-label")).toMatch(/^Struggle rate \d+(\.\d)?%, earlier \d+(\.\d)?%$/);
    const tiles = el.querySelectorAll(".kcard ul.kpis > li .kt");
    expect(tiles).toHaveLength(6);
    for (const t of tiles) { expect(t.querySelector(".ti svg")).not.toBeNull(); expect(t.querySelector("button.kpi-main")!.getAttribute("aria-label")).toBeTruthy(); }
  });
  it("the Brief shows at most 80 words: a title line and six widgets (screen-reader-only text excluded)", () => {
    mount();
    const c = el.querySelector(".brief")!.cloneNode(true) as HTMLElement;
    c.querySelectorAll(".sr-only").forEach((n) => n.remove());
    const words = (c.textContent ?? "").replace(/([a-z%])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(80);
    expect(words.length).toBeGreaterThan(5);
  });
});
