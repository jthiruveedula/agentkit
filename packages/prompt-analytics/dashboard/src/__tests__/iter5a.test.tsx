// Iteration 5a: caps vs capsAll scoping across shapes, stats helpers, summary "Where it went", title search, palette order.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import { SHAPES, onlySources } from "../data/shapes";
import sample from "../data/sample.dev.json";
import { capabilities, sectionsFor } from "../lib/capabilities";
import { views, titleHas, chips } from "../lib/filter";
import { fromHash, toHash } from "../lib/hash";
import { summarize, whereItWent } from "../lib/summary";
import { diffCI, pctChange, pts } from "../lib/stats";
import { loopCurve, loopHeadline, rephraseEffect } from "../lib/loops";
import { buildActions, rank, viewSummary } from "../lib/palette-actions";
import { serialize } from "../lib/export";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
type Raw = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const raw = sample as unknown as Raw;
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; try { localStorage.clear(); } catch { /* ignore */ } });
const mount = (r: Raw, hash = "") => { location.hash = hash; el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(r)} />)); };
const navIds = () => [...el.querySelectorAll<HTMLAnchorElement>("nav.side a")].map((a) => a.getAttribute("href")!.match(/s-[a-z]+/)![0]);
const heads = () => [...el.querySelectorAll("#s-sessions thead th")].map((t) => t.textContent?.replace(/[▾▴]/g, "").trim());
const zeroFinding = (r: Raw): Raw => ({ ...structuredClone(r), exposure: { sessions: 0, share: 0, by_category: [], by_kind: [], items: [] } });
const win = (d: ReturnType<typeof normalize>) => ({ from: d.range.start, to: d.range.end, days: 30 });
const mk = (r: Raw, f = {}) => { const d = normalize(r), v = views(d, f); return { d, view: { f, v, win: win(d), caps: capabilities(d, v), prior: null, cmp: "off" as const } }; };

describe("stats helpers", () => {
  it("pts and pctChange take the sign from the rounded value", () => {
    expect(pts(-0.003)).toBe("±0 pts"); expect(pts(0.04)).toBe("+4 pts"); expect(pts(-0.126)).toBe("-13 pts");
    expect(pctChange(-0.004)).toBeNull(); expect(pctChange(0.2)).toBe("+20%"); expect(pctChange(-0.2)).toBe("-20%");
  });
  it("diffCI flags a clear gap and an overlap", () => {
    expect(diffCI(80, 100, 40, 100).clear).toBe(true);
    const e = diffCI(52, 100, 50, 100); expect(e.clear).toBe(false); expect(e.lo).toBeLessThan(0); expect(e.hi).toBeGreaterThan(0);
  });
  it("rephraseEffect pools buckets 1+ against 0 and says inconclusive when the CI spans 0", () => {
    const rows = (loops: number, n: number, ok: number) => Array.from({ length: n }, (_, i) => ({ intent: "feature", prompts: 3, loops, applied: i < ok }));
    const worse = rephraseEffect(loopCurve([...rows(0, 40, 36), ...rows(1, 20, 10), ...rows(2, 20, 8)] as never))!;
    expect(worse.clear).toBe(true); expect(worse.text).toMatch(/^-\d+ pts \(CI -\d+ to -\d+ pts\)$/);
    const flat = rephraseEffect(loopCurve([...rows(0, 15, 8), ...rows(1, 15, 8)] as never))!;
    expect(flat.text).toMatch(/^inconclusive/);
    expect(rephraseEffect(loopCurve(rows(0, 5, 3) as never))).toBeNull();
  });
  it("loopHeadline never says no-gain when the CI excludes zero, and reports the pooled n", () => {
    const rows = (loops: number, n: number, ok: number) => Array.from({ length: n }, (_, i) => ({ intent: "feature", prompts: 3, loops, applied: i < ok }));
    const up = loopHeadline(rephraseEffect(loopCurve([...rows(0, 30, 6), ...rows(1, 40, 28), ...rows(2, 46, 36)] as never)))!;
    expect(up.n).toBe(116); expect(up.text).toMatch(/^Sessions that rephrase apply \d+ pts more often \(95% CI \+\d+ to \+\d+ pts\), confounded/); expect(up.text).not.toMatch(/no clear/i);
    expect(loopHeadline(rephraseEffect(loopCurve([...rows(0, 15, 8), ...rows(1, 15, 8)] as never)))!.text).toMatch(/not clearly related/);
    expect(loopHeadline(null)).toBeNull();
  });
});

describe("title search filter", () => {
  it("matches every word, case-insensitively, and round-trips through the hash", () => {
    expect(titleHas("Fix Login Bug", "login fix")).toBe(true); expect(titleHas("Fix Login", "logout")).toBe(false); expect(titleHas("", "  ")).toBe(true);
    const h = toHash({ f: { q: "login" }, list: false, cmp: "prev" }); expect(h).toContain("q=login");
    expect(fromHash(h).nav.f.q).toBe("login");
    expect(chips({ q: "login" }).map((c) => c.label)).toEqual(["Title: login"]);
    const d = normalize(raw), t = d.sessions.find((r) => r.title)!.title.split(/\s+/)[0];
    expect(views(d, { q: t }).rows.every((r) => titleHas(r.title, t))).toBe(true);
  });
});

describe("palette actions", () => {
  const ctx = { sections: [{ id: "s-time", text: "Time" }], sources: [], intents: [], projects: [], hasFilters: false, hasRows: true, views: [{ name: "Mine", hash: "#/s-time?src=cursor" }] };
  it("empty query lists saved views, then actions, then jumps; view rows summarise their filters", () => {
    const g = rank(buildActions(ctx), "").map((a) => a.group), order = (x: string) => g.indexOf(x);
    expect(order("Views")).toBe(0); expect(g.lastIndexOf("Views")).toBeLessThan(order("Share")); expect(order("Share")).toBeLessThan(order("Jump"));
    expect(viewSummary("#/s-time?src=cursor")).toBe("Cursor"); expect(viewSummary("#/s-time")).toBe("no filters");
    expect(buildActions(ctx).find((a) => a.id === "view:Mine")!.sub).toBe("Cursor");
  });
});

describe("Markdown summary", () => {
  it("adds Where it went from aggregates: by cost when priced, by tokens when not", () => {
    const { d, view } = mk(raw), md = summarize(d, view);
    expect(md).toContain("## Where it went (share of priced cost)"); expect(md).toMatch(/\*\*Projects\*\*\n\n- .*%, mean friction/);
    const np = mk(SHAPES["no-prices"](raw)); expect(summarize(np.d, np.view)).toContain("## Where it went (share of tokens)");
    expect(whereItWent(mk(SHAPES.empty(raw)).view.v, mk(SHAPES.empty(raw)).view.caps)).toEqual([]);
  });
  it("drops whole-export insights and recommendations under a filter and says so", () => {
    const { d, view } = mk(raw, { intent: "bugfix" }), md = summarize(d, view);
    expect(md).not.toContain("## Top insights"); expect(md).not.toContain("## Recommendations"); expect(md).toContain("omitted");
    expect(md).toContain("## Where it went");
  });
  it("never prints -0% / -0 pts, and omits a cost delta when the priced share moved by more than 10 points", () => {
    const { d, view } = mk(raw), v = view.v;
    const prior = { win: view.win, v: { ...v, totals: { ...v.totals, sessions: v.totals.sessions, unpriced: v.totals.sessions - 1, cost: 10 } } };
    const md = summarize(d, { ...view, prior: prior as never, cmp: "prev" });
    expect(md).not.toMatch(/-0%|-0 pts/);
    if (v.totals.unpriced / v.totals.sessions < 0.9) expect(md).toContain("no change shown");
  });
});

describe("shape table: caps vs capsAll", () => {
  const five = normalize(raw), copilot = onlySources(raw, ["copilot"]);
  const priced = (r: Raw) => normalize(r).sessions.some((s) => s.cost_usd !== null);
  const shapes: [string, Raw, string][] = [
    ["empty", SHAPES.empty(raw), ""], ["single-claude", onlySources(raw, ["claude_code"]), ""], ["single-copilot (unpriced)", copilot, ""],
    ["small", SHAPES.small(raw), ""], ["zero-finding", zeroFinding(raw), ""], ["five tools filtered to unpriced copilot", raw, "#/s-tools?src=copilot"],
    ["five tools filtered to one priced tool", raw, "#/s-tools?src=claude_code"],
  ];
  for (const [name, r, hash] of shapes) {
    it(`${name}: nav, Sessions columns, palette, Markdown and export agree`, () => {
      mount(r, hash);
      const { d, view } = mk(r, hash ? { source: new URLSearchParams(hash.split("?")[1]).get("src") } : {});
      const secs = sectionsFor(view.caps, d, view.v);
      expect(navIds().sort()).toEqual([...secs].sort());
      expect(secs.has("s-exposure")).toBe(view.caps.hasExposure);
      const inView = view.v.rows.some((x) => x.cost_usd !== null);
      if (!view.caps.empty && secs.has("s-sessions") && view.v.rows.length) {
        expect(heads().includes("Cost")).toBe(inView);
        expect([...el.querySelectorAll("#s-sessions .tag")].some((t) => t.textContent === "not priced") && !inView).toBe(false);   // no "not priced" tags without a price in view
        expect(heads().includes("Tool")).toBe(view.caps.multiTool);   // one tool in view: the column is redundant
      }
      if (hash.includes("copilot")) {
        expect(el.querySelector("#s-tools h2")!.textContent).toBe("Tools");
        expect(el.querySelector("#s-tools")!.textContent).toContain("Tool: Copilot, click to clear");
        expect(el.querySelector("#s-tools .q")!.textContent).toBe("How does Copilot land your work?");
        expect(el.querySelector("#s-tools")!.textContent).not.toMatch(/1 of 1/);
      }
      const md = summarize(d, view);   // never throws, never claims cost without prices
      if (view.caps.empty) expect(md).toContain("No sessions in this view");
      else if (!inView) expect(md).not.toMatch(/- Cost:/);
      for (const fmt of ["csv", "json", "xlsx"] as const) expect(() => serialize(fmt, view.v.rows, {})).not.toThrow();
      expect(priced(r) || !inView).toBe(true);
      act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); });
      const labels = [...document.querySelectorAll('[role="option"]')].map((o) => o.getAttribute("aria-label") ?? "");
      expect(labels.some((l) => l.startsWith("Filter tool:"))).toBe(false);   // typed-only, and never with one tool in view
      expect(document.querySelector(".app")!.hasAttribute("inert")).toBe(true);
      if (!view.caps.empty) expect(labels.some((l) => /Go to Exposure/.test(l))).toBe(secs.has("s-exposure"));
      act(() => { document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      expect(document.querySelector(".app")!.hasAttribute("inert")).toBe(false);
    });
  }
  it("empty: no date range, as-of line, engine pill or filters-off note in the header", () => {
    mount(SHAPES.empty(raw));
    expect(el.querySelector(".brand .sub")).toBeNull(); expect(el.querySelector(".top .note")).toBeNull();
    expect(five.sessions.length).toBeGreaterThan(0);
  });
  it("palette names the section Tools for a multi-tool export even when filtered to one tool", () => {
    mount(raw, "#/s-tools?src=copilot");
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); });
    const labels = [...document.querySelectorAll('[role="option"]')].map((o) => o.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.startsWith("Go to Tools"))).toBe(true); expect(labels.some((l) => l.startsWith("Go to Projects"))).toBe(false);
    expect([...el.querySelectorAll("nav.side a")].some((a) => a.textContent === "Tools")).toBe(true);
  });
  it("title search box filters the table and the hash", () => {
    mount(raw);
    const t = normalize(raw).sessions.find((r) => r.title)!.title.split(/\s+/)[0], input = el.querySelector<HTMLInputElement>("#s-sessions .s-search input")!;
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(input, t); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(location.hash).toContain("q="); expect(el.querySelector(".crumbs")!.textContent).toContain("Title:");
  });
});
