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

  it("the brief number replaces the Struggled tile, drills in place and opens the list", () => {
    mount();
    expect(el.querySelector('button.kpi[data-kpi="struggled"]')).toBeNull();
    expect(el.querySelectorAll(".kpis.k5 > li")).toHaveLength(5);
    click(el.querySelector(".brief button.b-num"));
    expect(params().get("sg")).toBe("1");
    expect(params().get("pn")).toBe("list");
    expect(el.querySelector(".panel")!.getAttribute("data-mode")).toBe("list");
  });

  it("no nested buttons; new controls are typed and named", () => {
    mount();
    const go = el.querySelectorAll("button.kpi-go");
    expect(go.length).toBeGreaterThan(0);
    for (const g of go) expect(g.closest("button.kpi")).toBeNull();
    const ctl = el.querySelectorAll<HTMLButtonElement>("button.kpi, button.kpi-go, .drv li > button, p.movers button, dl.story button, section.quiet button, .brief button");
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

  it("story has both rows and the driver button opens its sessions", () => {
    mount();
    const dl = el.querySelector("dl.story")!;
    expect(dl.textContent).toContain("Why");
    expect(dl.textContent).toContain("Do next");
    expect([...dl.querySelectorAll("button")].some((b) => b.textContent === "Open")).toBe(true);   // the rec is not about the driver, so Do next is the top attention item
    click(dl.querySelector(".btn.primary"));
    expect(params().get("prj")).toBe("billing-api");
    expect(params().get("pn")).toBe("list");
  });

  it("All period: compares the last 4 weeks to the rest (acceptance numbers)", () => {
    mount("#/s-overview");
    const br = el.querySelector(".brief")!, txt = (s: string) => br.querySelector(s)!.textContent;
    expect(txt(".eyebrow")).toBe("Clear rise");
    expect(txt(".b-basis")).toBe("Last 4 weeks vs the 22 before · 182 days");
    expect(txt("h3")).toBe("Struggling rose in the last 4 weeks");
    expect(txt(".b-num")).toBe("11.0%");
    expect(txt(".was")).toBe("was 2.6%");
    expect(txt(".b-cap")).toBe("of sessions struggled: 1 in 9, up from 1 in 39");
    expect(txt(".ci")).toBe("+8.4 pts · likely +4.2 to +14.2 · n 164 vs 623");
    expect(txt("dl.story dd")).toMatch(/^billing-api \/ bugfix: 12 of its 15 sessions struggled, up from 4 of 37\. Open 15 sessions$/);
    expect(el.querySelectorAll(".kpis.k5 > li")).toHaveLength(5);
    expect(el.querySelector("#s-driver")!.textContent).not.toMatch(/Needs an earlier window/);
    expect(el.querySelector("#s-driver .meta")!.textContent).toBe("Last 4 weeks vs the 22 before");
    click(br.querySelector(".btn.primary"));
    expect([params().get("prj"), params().get("int"), params().get("from"), params().get("pn")]).toEqual(["billing-api", "bugfix", "2026-09-28", "list"]);
  });

  it("movers row renders chips on the 30d window", () => {
    mount();
    expect(el.querySelectorAll("p.movers .tag").length).toBeGreaterThan(0);
  });
});
