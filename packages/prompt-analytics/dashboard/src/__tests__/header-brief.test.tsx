// Header + brief redesign: the date crumb hides on a preset period, the CI bar draws the interval against zero with a text equivalent.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { ciGeom } from "../components/Overview";
import { normalize } from "../data/load";
import { attention } from "../lib/attention";
import { fromHash } from "../lib/hash";
import { views } from "../lib/filter";
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
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const pressed = () => el.querySelector('.top-tools [aria-label="Period"] [aria-pressed="true"]')!.textContent;
const params = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const click = (b: Element | null) => act(() => { (b as HTMLElement).click(); });
const esc = (t: EventTarget = document.body) => act(() => { t.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
const type_ = (i: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(i, v); i.dispatchEvent(new Event("input", { bubbles: true })); });
const blur = (i: HTMLInputElement) => act(() => { i.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
const dates = () => [...el.querySelectorAll<HTMLInputElement>('#hdr-filters input[type="date"]')];
const fbtn = () => el.querySelector<HTMLButtonElement>(".fbtn")!;
const period = (t: string) => [...el.querySelectorAll('.top-tools [aria-label="Period"] button')].find((b) => b.textContent === t)!;

describe("header crumbs", () => {
  it("a preset period shows no date crumb and no crumbs row", () => {
    mount("#/s-overview?from=2026-09-26");   // a preset writes from only
    expect(pressed()).toBe("30d");
    expect(el.querySelector(".top-r3")).toBeNull();
    expect(el.querySelector(".crumbs")).toBeNull();
  });
  it("a preset period keeps the other chips, without the date", () => {
    mount("#/s-overview?from=2026-09-26&prj=billing-api");
    expect([...el.querySelectorAll(".crumbs .crumb")].map((c) => c.textContent)).toEqual(["billing-api×"]);
  });
  it("a custom range keeps its date crumb", () => {
    mount("#/s-overview?from=2026-10-01&to=2026-10-10");
    expect(pressed()).toBe("Custom");
    expect(el.querySelector(".crumbs")!.textContent).toMatch(/Oct 1 – Oct 10/);
  });
  it("one meta line: range, sessions link, engine text with its version in the title", () => {
    mount("#/s-overview?from=2026-09-26");
    const meta = el.querySelector(".top-meta")!;
    expect(meta.querySelector("button.count")!.getAttribute("aria-label")).toMatch(/sessions in view.*Open the list$/);
    const eng = meta.querySelector(".eng-t")!;
    expect(eng.textContent).toBe("analyzed with ML");
    expect(eng.getAttribute("title")).toMatch(/scikit-learn/);
    expect(el.querySelector("canvas.pulse")).toBeNull();
  });
});

describe("CI bar", () => {
  it("geometry: the domain holds zero; dot and range sit on the same scale", () => {
    expect(ciGeom(0.008, 0.132, 0.071, 120)).toEqual({ zero: 6, x0: 12.5, x1: 114, dot: 64.1 });
    const g = ciGeom(-0.05, 0.05, 0, 120);
    expect(g.zero).toBe(60); expect(g.dot).toBe(60); expect([g.x0, g.x1]).toEqual([6, 114]);
    expect(ciGeom(-0.1, -0.02, -0.06, 120).zero).toBe(114);   // all below zero: the tick sits at the right end
  });
  it("renders with a visible range caption, a labelled zero tick and plain sample sizes", () => {
    mount("#/s-overview");
    const ci = el.querySelector(".brief .ci")!;
    expect(ci.querySelector("svg.ci-bar")!.getAttribute("aria-hidden")).toBe("true");
    expect(ci.querySelector(".ci-n")!.textContent).toBe("likely +4.2 to +14.2");
    expect(ci.querySelector("text.ci-0")!.textContent).toBe("0");
    expect(el.querySelector(".brief .b-foot")!.textContent).toBe("164 vs 623 sessions with a prompt");
    const [zero, rng, dot] = [".ci-zero", ".ci-rng", ".ci-dot"].map((s) => ci.querySelector(s)!);
    expect(+zero.getAttribute("x1")!).toBeLessThan(+rng.getAttribute("x")!);   // the whole range is above zero
    expect(+dot.getAttribute("cx")!).toBeGreaterThan(+rng.getAttribute("x")!);
  });
});

describe("period detection", () => {
  it("from = end - 89 is 90d", () => {
    mount("#/s-overview?from=2026-07-28");
    expect(pressed()).toBe("90d");
    expect(el.querySelector(".top-r3")).toBeNull();
  });
});

describe("Escape never resets a preset period", () => {
  it("bare Escape on 30d with nothing visible to clear does nothing", () => {
    mount("#/s-overview?from=2026-09-26");
    const before = location.hash;
    esc();
    expect(location.hash).toBe(before);
    expect(pressed()).toBe("30d");
  });
  it("Escape on 30d clears only the visible project chip", () => {
    mount("#/s-overview?from=2026-09-26&prj=billing-api");
    esc();
    expect(params().get("prj")).toBeNull();
    expect(params().get("from")).toBe("2026-09-26");
    expect(pressed()).toBe("30d");
    esc();   // nothing visible left
    expect(params().get("from")).toBe("2026-09-26");
  });
  it("Escape in the engine popover only closes the popover", () => {
    mount("#/s-overview?from=2026-09-26&prj=billing-api");
    const t = el.querySelector(".eng-t")!;
    expect(t.getAttribute("aria-label")).toBe("analyzed with ML: change analysis tier");
    click(t);
    expect(el.querySelector("#eng-pop")).not.toBeNull();
    esc(t);
    expect(el.querySelector("#eng-pop")).toBeNull();
    expect([params().get("prj"), params().get("from")]).toEqual(["billing-api", "2026-09-26"]);
    expect(pressed()).toBe("30d");
  });
});

describe("Clear all on a preset", () => {
  it("keeps 30d pressed, drops the crumbs row and adds one history entry", () => {
    mount("#/s-overview?from=2026-09-26&prj=billing-api&int=bugfix");
    const n = history.length;
    click([...el.querySelectorAll(".crumbs .link")].find((b) => b.textContent === "Clear all")!);
    expect(pressed()).toBe("30d");
    expect(el.querySelector(".top-r3")).toBeNull();
    expect(history.length).toBe(n + 1);
    expect([params().get("prj"), params().get("int"), params().get("from")]).toEqual([null, null, "2026-09-26"]);
  });
});

describe("Custom", () => {
  it("opens Filters on a focused From date prefilled with the range in view, and stays custom while editing", () => {
    mount("#/s-overview?from=2026-09-26");
    click(period("Custom"));
    expect(el.querySelector(".top")!.hasAttribute("data-fopen")).toBe(true);
    const [from, to] = [...el.querySelectorAll<HTMLInputElement>('#hdr-filters input[type="date"]')];
    expect(document.activeElement).toBe(from);
    expect([from.value, to.value]).toEqual(["2026-09-26", "2026-10-25"]);
    expect(pressed()).toBe("Custom");
    // a range that happens to equal a preset still reads Custom until a preset is picked; the date commits on blur, not per keystroke
    type_(from, "2026-07-28");
    expect(params().get("from")).toBe("2026-09-26");
    blur(from);
    expect(params().get("from")).toBe("2026-07-28");
    expect(pressed()).toBe("Custom");
    click(period("90d"));
    expect(pressed()).toBe("90d");
    expect(el.querySelector(".top-r3")).toBeNull();
  });
  it("dates changed from outside the inputs (Back to a 30d URL) leave custom mode", () => {
    mount("#/s-overview?from=2026-09-26");
    click(period("Custom"));
    act(() => { history.replaceState(null, "", "#/s-overview?from=2026-09-26"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(pressed()).toBe("30d");
    expect(el.querySelector(".top-r3")).toBeNull();
  });
});

describe("pluralisation", () => {
  it("one open secret in one session reads singular", () => {
    const one = d.exposure.items.find((i) => i.category === "secret")!;
    const dd = { ...d, exposure: { ...d.exposure, items: [{ ...one, status: "open" as const }] } };
    const it = attention(dd, views(dd, {}), {}, null).find((x) => x.id === "exp-secret")!;
    expect(it.headline).toBe("1 open secret in 1 session");
    expect(it.sessions).toBe(1);
  });
});

describe("date robustness (H1)", () => {
  const r = { start: d.range.start, end: d.range.end };
  it("the hash parser rejects partial or invalid years and clamps to the data range", () => {
    expect(fromHash("#/s-overview?from=0002-09-01").nav.f.from).toBeUndefined();
    expect(fromHash("#/s-overview?from=0002-09-01", r).nav.f.from).toBeUndefined();
    expect(fromHash("#/s-overview?from=2026-02-31", r).nav.f.from).toBeUndefined();
    expect(fromHash("#/s-overview?from=202-09-01", r).nav.f.from).toBeUndefined();
    expect(fromHash("#/s-overview?from=2001-01-01&to=9999-12-31", r).nav.f).toEqual({ from: r.start, to: r.end });
    expect(fromHash("#/s-overview?from=2026-10-10&to=2026-10-01", r).nav.f).toEqual({ from: "2026-10-10" });
    expect(fromHash("#/s-overview?from=2026-10-01", r).nav.f.from).toBe("2026-10-01");
  });
  it("from=0002-09-01 in the URL is ignored and the page renders quickly", () => {
    const t = performance.now();
    mount("#/s-overview?from=0002-09-01");
    expect(performance.now() - t).toBeLessThan(5000);   // unclamped, this built a centuries-wide window and hung
    expect(pressed()).toBe("All");
  });
  it("a half-typed year in the From input never reaches the filter; blur reverts it", () => {
    mount("#/s-overview?from=2026-09-26");
    click(period("Custom"));
    const [from] = dates();
    for (const y of ["0002", "0020", "0202"]) { type_(from, `${y}-09-26`); expect(params().get("from")).toBe("2026-09-26"); }
    type_(from, "0202-09-26"); blur(from);
    expect(params().get("from")).toBe("2026-09-26");
    expect(from.value).toBe("2026-09-26");
    type_(from, "2001-01-01"); blur(from);   // whole but before the data: clamped to its first day
    expect(params().get("from")).toBe(d.range.start);
  });
});

describe("custom mode lives in the URL (L7)", () => {
  it("a Custom range equal to 30d reloads as Custom", () => {
    mount("#/s-overview?from=2026-09-26");
    click(period("Custom"));
    const h = location.hash;
    act(() => root?.unmount()); el.remove();
    mount(h);
    expect(pressed()).toBe("Custom");
    expect(el.querySelector(".crumbs")!.textContent).toMatch(/Sep 26 – Oct 25/);
  });
  it("the Filters panel offers Custom dates when not custom (the 320px path)", () => {
    mount("#/s-overview?from=2026-09-26");
    click(fbtn());
    const b = el.querySelector<HTMLButtonElement>("#hdr-filters .f-custom")!;
    click(b);
    expect(pressed()).toBe("Custom");
    expect(document.activeElement).toBe(dates()[0]);
    expect(el.querySelector("#hdr-filters .f-custom")).toBeNull();
  });
});

describe("Filters badge and focus", () => {
  it("the badge counts the model filter (M9 / L8)", () => {
    mount("#/s-overview?prj=billing-api&mdl=gpt-5");
    expect(fbtn().querySelector(".badge")!.textContent).toBe("2");
    expect(el.querySelector(".crumbs")!.textContent).toMatch(/Model: gpt-5/);
  });
  it("removing a chip focuses the next chip, then the Filters button (M11)", () => {
    mount("#/s-overview?from=2026-09-26&prj=billing-api&int=bugfix");
    const chips = () => [...el.querySelectorAll<HTMLButtonElement>(".crumbs .fchip")];
    expect(chips()).toHaveLength(2);
    const second = chips()[1].textContent;
    chips()[0].focus(); click(chips()[0]);
    expect(document.activeElement).toBe(chips()[0]);
    expect(chips()[0].textContent).toBe(second);
    click(chips()[0]);
    expect(el.querySelector(".crumbs")).toBeNull();
    expect(document.activeElement).toBe(fbtn());
  });
  it("Escape in the open Filters panel closes it and returns focus to the Filters button (M11)", () => {
    mount("#/s-overview?from=2026-09-26");
    click(fbtn());
    const sel = el.querySelector<HTMLSelectElement>("#hdr-filters select")!;
    sel.focus(); esc(sel);
    expect(el.querySelector(".top")!.hasAttribute("data-fopen")).toBe(false);
    expect(document.activeElement).toBe(fbtn());
  });
  it("one Escape with Filters and the engine popover open closes only the popover (L12)", () => {
    mount("#/s-overview?from=2026-09-26");
    click(fbtn());
    click(el.querySelector(".eng-t"));
    expect(el.querySelector("#eng-pop")).not.toBeNull();
    esc(el.querySelector(".eng-t")!);
    expect(el.querySelector("#eng-pop")).toBeNull();
    expect(el.querySelector(".top")!.hasAttribute("data-fopen")).toBe(true);
    esc(el.querySelector(".eng-t")!);
    expect(el.querySelector(".top")!.hasAttribute("data-fopen")).toBe(false);
  });
  it("the phone sticky bar wraps only the toolbar: the Filters panel and chips sit outside it (M8)", () => {
    mount("#/s-overview?from=2026-09-26&prj=billing-api");
    click(fbtn());
    const bar = el.querySelector(".top-bar")!;
    expect(bar.querySelector(".top-tools")).not.toBeNull();
    expect(bar.querySelector("#hdr-filters, .crumbs")).toBeNull();
  });
});

describe("brief honesty (H2) and empty actions (M7 / L11)", () => {
  it("cost per applied change on the sample is not a green win: grey, mixed, one sign", () => {
    mount("#/s-overview");
    const tag = [...el.querySelectorAll(".brief .movers .tag")].find((t) => t.textContent!.startsWith("Cost per applied change"));
    expect(tag).toBeDefined();
    expect(tag!.querySelector("b")!.getAttribute("data-tone")).not.toBe("good");
    expect(tag!.querySelector(".mv-g")!.textContent!.trim()).toBe("mixed");
    expect(tag!.textContent).not.toMatch(/[↑↓]\s*[+-]/);
    expect(tag!.getAttribute("aria-label") ?? tag!.textContent).toMatch(/down 43% mixed/);   // the tile reads "↓43% mean | mixed"
  });
  it("no Also moved chip carries a double sign", () => {
    for (const h of ["#/s-overview", "#/s-overview?from=2026-09-26"]) {
      mount(h);
      for (const t of el.querySelectorAll(".brief .movers .tag")) expect(t.textContent).not.toMatch(/[↑↓]\s*[+-]\d/);
      act(() => root?.unmount()); el.remove();
    }
  });
  it("never offers an action that opens 0 sessions", () => {
    for (const prj of ["infra", "auth-service", "mobile-app"]) {
      mount(`#/s-overview?from=2026-09-26&prj=${prj}`);
      for (const b of el.querySelectorAll(".brief button")) expect(b.textContent).not.toMatch(/\b0 sessions/);
      act(() => root?.unmount()); el.remove();
    }
  });
  it("the Weekly Wrapped live region is mounted even before it has news (L10)", () => {
    mount("#/s-overview");
    expect(el.querySelector('.brief .b-acts [role="status"]')).not.toBeNull();
  });
});
