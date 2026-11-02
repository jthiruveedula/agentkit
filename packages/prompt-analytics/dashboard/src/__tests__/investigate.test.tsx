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
    for (const t of ["Resolved rate", "Struggled by tool", "Time to resolve", "Retries by intent", "Signals behind struggle", "Step rates"]) expect(card(t)?.dataset.src, t).toBeTruthy();
    expect(card("Resolved rate")!.querySelectorAll(".bar-l svg.lg").length).toBeGreaterThan(0);
    const db = card("Time to resolve")!.querySelector(".db");
    expect(db?.querySelector(".dbt")?.getAttribute("aria-label")).toMatch(/Cursor|Claude|All resolved/);
    expect(db?.lastElementChild?.textContent).toMatch(/\d/);
  });
});
