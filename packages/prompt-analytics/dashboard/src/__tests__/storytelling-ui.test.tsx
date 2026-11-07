import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
const WINDOW = "#/s-overview?from=2026-09-26&to=2026-10-25";
let root: Root | null = null;
let el: HTMLDivElement;
const mount = (hash = WINDOW) => {
  location.hash = hash;
  el = document.createElement("div"); document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(<Dashboard d={d} />));
};
beforeEach(() => { el = undefined as never; });
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const click = (n: Element | null) => act(() => { (n as HTMLElement).click(); });
const ids = () => [...el.querySelectorAll("main > section.sec")].map((s) => s.id);
const raf = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
const params = () => new URLSearchParams(location.hash.split("?")[1] ?? "");

describe("storytelling UI", () => {
  it("orders sections by signal and collapses quiet ones", () => {
    mount();
    const order = ids();
    expect(order[0]).toBe("s-overview");
    expect(order.slice(-2)).toEqual(["s-sessions", "s-map"]);
    expect(order.indexOf("s-exposure")).toBeLessThan(order.indexOf("s-tools"));
    const quiet = el.querySelectorAll("section.sec.quiet");
    expect(quiet.length).toBeGreaterThan(0);
    for (const q of quiet) expect(q.querySelector("button")!.getAttribute("aria-expanded")).toBe("false");
    expect(el.querySelectorAll("p.why-tag").length).toBeGreaterThan(0);
  });

  it("Show un-quiets the section and focuses its heading", async () => {
    mount();
    click(el.querySelector("#s-tools.quiet button"));
    expect(el.querySelector("#s-tools.quiet")).toBeNull();
    await raf();
    expect(document.activeElement?.id).toBe("s-tools-h");
  });

  it("a hash to a quiet section starts it expanded", () => {
    mount("#/s-tools?from=2026-09-26&to=2026-10-25");
    expect(el.querySelector("#s-tools")).not.toBeNull();
    expect(el.querySelector("#s-tools.quiet")).toBeNull();
    expect(el.querySelector("#s-models.quiet")).not.toBeNull();
  });

  it("struggled KPI drills in place and opens the list", () => {
    mount();
    click(el.querySelector('button.kpi[data-kpi="struggled"]'));
    expect(params().get("sg")).toBe("1");
    expect(params().get("pn")).toBe("list");
    expect(el.querySelector(".panel")!.getAttribute("data-mode")).toBe("list");
  });

  it("no nested buttons; new controls are typed and named", () => {
    mount();
    const go = el.querySelectorAll("button.kpi-go");
    expect(go.length).toBeGreaterThan(0);
    for (const g of go) expect(g.closest("button.kpi")).toBeNull();
    const ctl = el.querySelectorAll<HTMLButtonElement>("button.kpi, button.kpi-go, .drv li > button, p.movers button, dl.story button, section.quiet button");
    for (const b of ctl) {
      expect(b.getAttribute("type")).toBe("button");
      expect((b.getAttribute("aria-label") || b.textContent || "").trim()).not.toBe("");
      expect(b.querySelector("button")).toBeNull();
    }
  });

  it("a driver button applies a project filter and opens the list", () => {
    mount();
    const btns = el.querySelectorAll<HTMLButtonElement>(".drv li > button");
    expect(btns.length).toBeGreaterThan(0);
    const prj = [...btns].find((b) => { click(b); const ok = params().has("prj"); if (!ok) click(el.querySelector(".panel .btn:last-child")); return ok; });
    expect(prj).toBeDefined();
    expect(params().get("pn")).toBe("list");
  });

  it("story has both rows and Show evidence opens the list", () => {
    mount();
    const dl = el.querySelector("dl.story")!;
    expect(dl.textContent).toContain("Why it matters");
    expect(dl.textContent).toContain("Do next");
    click([...dl.querySelectorAll("button")].find((b) => b.textContent === "Show evidence") ?? null);
    expect(params().get("pn")).toBe("list");
  });

  it("movers row renders chips on the 30d window", () => {
    mount();
    expect(el.querySelectorAll("p.movers .tag").length).toBeGreaterThan(0);
  });
});
