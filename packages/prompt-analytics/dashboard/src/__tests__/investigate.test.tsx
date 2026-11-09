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
const card = (t: string) => [...el.querySelectorAll<HTMLElement>(".card")].find((c) => c.getAttribute("aria-label") === t);

describe("investigate sections", () => {
  it("cards carry data-src, tools have logos, dumbbells keep a text value", () => {
    el = document.createElement("div"); document.body.append(el); root = createRoot(el);
    act(() => root!.render(<Dashboard d={normalize(sample)} />));
    act(() => el.querySelector<HTMLButtonElement>("#s-tools.quiet button")?.click());   // the sample flags nothing on tools, so its section starts quiet
    for (const t of ["Resolved rate", "Struggled by tool", "Time to resolve", "Retries by intent", "Signals behind struggle", "Net value per intent"]) expect(card(t)?.dataset.src, t).toBeTruthy();
    expect(card("Resolved rate")!.querySelectorAll(".bar-l svg.lg").length).toBeGreaterThan(0);
    const db = card("Time to resolve")!.querySelector(".db");
    expect(db?.querySelector(".dbt")?.getAttribute("aria-label")).toMatch(/Cursor|Claude|Antigravity|All resolved/);
    expect(db?.lastElementChild?.textContent).toMatch(/\d/);
    // opted into Dumb's median rule and sort: "All resolved" pinned first, then slowest first, one "median" label, a rule in every row
    const ttr = card("Time to resolve")!, now = [...ttr.querySelectorAll(".db > b")].map((b) => parseFloat(b.textContent!.split("\u2192").at(-1)!));
    expect(ttr.querySelector(".db .dbt")!.getAttribute("aria-label")).toMatch(/^All resolved/);
    expect(now.slice(1)).toEqual([...now.slice(1)].sort((a, b) => b - a));
    expect(ttr.querySelector(".dbm")?.textContent).toBe("median");
    expect(ttr.querySelectorAll(".dbt .md")).toHaveLength(now.length);
  });
});
