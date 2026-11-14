import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
let root: Root | null = null;
let el: HTMLDivElement;
const mount = (hash: string) => {
  location.hash = hash;
  el = document.createElement("div"); document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(<Dashboard d={d} />));
};
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });

const BANNED = /tercile|Wilson|\bCI\b|FDR|p90|median|friction score/i;
const words = (s: string) => s.trim().split(/\s+/).length;
/** Not built with <Card>: the Overview brief panels, out of scope for the so-what line. */
const NOT_CARD = ["Per week", "Needs attention", "Where it went"];
const notCard = (t: string) => !t || NOT_CARD.includes(t) || t.startsWith("Where the ");

describe("so-what line on every Card", () => {
  it("each card has a short, jargon-free finding", () => {
    const seen = new Set<string>(), bad: string[] = [];
    // one page holds every section, but a quiet one stays collapsed until its hash opens it
    for (const h of ["#/s-overview", "#/s-tools", "#/s-models"]) {
      mount(h);
      check();
      act(() => root?.unmount()); el.remove(); root = null;
    }
    function check() {
    for (const c of el.querySelectorAll(".card")) {
      const title = c.getAttribute("aria-label") ?? "";
      if (notCard(title)) continue;
      const so = c.querySelector(":scope > .so")?.textContent?.trim() ?? "";
      seen.add(title);
      if (!so) bad.push(`${title}: no so line`);
      else if (words(so) > 16) bad.push(`${title}: ${words(so)} words: ${so}`);
      else if (BANNED.test(so)) bad.push(`${title}: banned word: ${so}`);
      else if (c.querySelectorAll(":scope > .so b").length > 1) bad.push(`${title}: two bold numbers`);
      else console.log(`SO ${title}: ${so}`);
    }
    }
    expect(bad).toEqual([]);
    for (const t of ["Tool scorecard", "Resolved rate", "Struggled by tool", "Task size × model tier", "What to change"]) expect(seen).toContain(t);
  });
});
