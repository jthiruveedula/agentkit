// Bundle 2+3 review round 2: Applied delta guard, week-aligned sparks, verdict-gated baseline, prior-mode baseline, Drivers side, outlier share.
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider, useStore } from "../state";
import { Overview } from "../components/Overview";
import { WeekChart } from "../components/Trend";
import { fmtPct } from "../lib/format";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
type S = Record<string, unknown>;
const base = sample as unknown as { sessions: S[] };
let n = 0;
const sess = (o: S): S => ({ ...base.sessions[0], id: `r${n++}`, title: `T${n}`, prompts: 3, cost_usd: 1, reached_stage: 6, applied: true, loops: 0, friction: 0.1, source: "cursor", date: "2026-10-20", project: "p0", intent: "bugfix", model: "gpt-5", ...o });
const many = (c: number, o: (i: number) => S) => Array.from({ length: c }, (_, i) => sess(o(i)));
const DATED = { from: "2026-10-15", to: "2026-10-28" };   // prior window: Oct 1 - Oct 14
const data = (sessions: S[], range = { start: "2026-10-01", end: "2026-10-28" }) => normalize({ ...sample, sessions, range } as never);
const html = (sessions: S[], initial: object = DATED, range?: { start: string; end: string }) =>
  renderToStaticMarkup(<StoreProvider d={data(sessions, range)} initial={initial}><Overview /></StoreProvider>);
const text = (h: string) => h.replace(/<[^>]+>/g, "");
const tile = (h: string, id: string) => h.split(`data-kpi="${id}"`)[1].split('data-kpi="')[0];

describe("Applied delta needs MIN_N change sessions on both sides", () => {
  const ap = (p: number, c: number) => [...many(p, (i) => ({ date: "2026-10-05", applied: i < p / 2 })), ...many(c, (i) => ({ date: "2026-10-20", applied: i < c * 0.8 }))];
  it("shows at 30 vs 30", () => expect(tile(html(ap(30, 30)), "applied")).toContain(" pts"));
  it("hidden when the prior has 29", () => expect(tile(html(ap(29, 30)), "applied")).not.toContain(" pts"));
  it("hidden when the current has 29", () => expect(tile(html(ap(30, 29)), "applied")).not.toContain(" pts"));
});

describe("KPI sparks are whole weeks ending on the last day", () => {
  it("a 17-day window drops its first 3 days: 2 weekly points, not 3", () => {
    // Oct 12-14 (5 sessions) is the leftover; Oct 15-21 has 1, Oct 22-28 has 2
    const rows = [...many(5, () => ({ date: "2026-10-13" })), ...many(1, () => ({ date: "2026-10-16" })), ...many(2, () => ({ date: "2026-10-26" }))];
    const h = html(rows, { from: "2026-10-12", to: "2026-10-28" });
    expect(tile(h, "sessions").match(/class="wc-b[ "]/g)).toHaveLength(2);
  });
});

describe("weekly chart baseline follows the Brief verdict", () => {
  const rs = (c0: number, c1: number, date0: string) => [...many(c0, (i) => ({ date: date0, friction: i < c0 / 4 ? 0.9 : 0.1 })), ...many(c1, (i) => ({ date: "2026-10-20", friction: i < c1 / 2 ? 0.9 : 0.1 }))];
  const split = { start: "2026-08-01", end: "2026-10-28" };
  it("split mode: both sides >= 30 draws the line and '% before'", () => {
    const h = html(rs(40, 40, "2026-08-10"), {}, split);
    expect(h).toContain('class="wk-ref"');
    expect(text(h)).toMatch(/last 4 weeks · [\d.]+% before/);
  });
  it("split mode: one side under 30 has neither", () => {
    const h = html(rs(10, 40, "2026-08-10"), {}, split);
    expect(text(h)).toContain("last 4 weeks");
    expect(h).not.toContain('class="wk-ref"');
    expect(text(h)).not.toMatch(/% before/);
  });
  it("prior mode: under 30 draws no baseline, 30 draws it tagged 'this window'", () => {
    expect(html(rs(10, 40, "2026-10-05"))).not.toContain('class="wk-ref"');
    const h = html(rs(40, 40, "2026-10-05"));
    expect(h).toMatch(/class="wk-tag"[^>]*>this window</);
    expect(h).toContain('class="wk-ref"');
  });
});

describe("WeekChart prior-mode line extent", () => {
  const weekly = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"].map((week) => ({ week, struggled: 0.1, n: 40, sessions: 40, prompts: 40, spend: null }));
  const line = (was: [string, string]) => { const h = renderToStaticMarkup(<WeekChart weekly={weekly} metric="struggled" view="area" base={{ p: 0.05, was, now: ["2026-10-12", "2026-10-25"], tag: "this window" }} />); const m = h.match(/class="wk-ref"><line x1="([\d.]+)" x2="([\d.]+)"/)!; return [+m[1], +m[2]]; };
  it("spans only the `was` dates", () => {
    const [a, b] = line(["2026-10-05", "2026-10-11"]);   // 720 wide, step 214.67: Oct 5 starts half a step before x(1), Oct 12 half a step before x(2)
    expect(a).toBeCloseTo(46 + 214.67 * 0.5, 0); expect(b).toBeCloseTo(46 + 214.67 * 1.5, 0);
  });
  it("year-over-year (`was` off the chart) spans the whole plot", () => {
    const [a, b] = line(["2025-10-05", "2025-10-25"]);
    expect(a).toBe(46); expect(b).toBe(690);
  });
});

describe("Drivers zero line", () => {
  const seg = (p: string, c0: number, b0: number, c1: number, b1: number) => [["2026-10-05", c0, b0], ["2026-10-20", c1, b1]].flatMap(([date, c, b]) => many(c as number, (i) => ({ project: p, date, friction: i < (b as number) ? 0.9 : 0.1 })));
  const side = (h: string) => h.match(/<ul class="drv"([^>]*)>/)![1].match(/data-side="(\w+)"/)?.[1];
  it("all contributions positive -> pos; all negative -> neg; mixed -> neither", () => {
    expect(side(html(seg("p0", 40, 4, 40, 24)))).toBe("pos");
    expect(side(html(seg("p0", 40, 24, 40, 4)))).toBe("neg");
    expect(side(html([...seg("p0", 40, 4, 40, 24), ...seg("p1", 40, 24, 40, 4)]))).toBeUndefined();
  });
});

describe("spend outlier rows", () => {
  const rows = [...many(30, () => ({ cost_usd: 1 })), sess({ id: "big", title: "BIGONE", cost_usd: 30 }), ...many(5, () => ({ cost_usd: null }))];
  it("shows row cost / total priced spend and opens that session on click", () => {
    const share = fmtPct(30 / 60);
    const h = html(rows, {});
    expect(h).toContain(`aria-label="Open session: BIGONE, ${share} of priced spend"`);
    const Probe = () => <i id="sel">{useStore().sel}</i>;
    const el = document.createElement("div"); document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(<StoreProvider d={data(rows)} initial={{}}><Overview /><Probe /></StoreProvider>));
    const b = el.querySelector<HTMLButtonElement>("button.kpi-out")!;
    expect(b.querySelector("b")!.textContent).toBe(share);
    expect(el.querySelector("#sel")!.textContent).toBe("");
    act(() => b.click());
    expect(el.querySelector("#sel")!.textContent).toBe("big");
    act(() => root.unmount()); el.remove();
  });
});

describe("WeekChart 'earlier' label never sits on the series", () => {
  const wk = (vals: number[]) => vals.map((struggled, i) => ({ week: `2026-${String(8 + Math.floor((i * 7 + 3) / 30)).padStart(2, "0")}-${String(((i * 7 + 3) % 30) + 1).padStart(2, "0")}`, struggled, n: 40, sessions: 40, prompts: 40, spend: null }));
  const render = (vals: number[]) => renderToStaticMarkup(<WeekChart weekly={wk(vals)} metric="struggled" view="area" base={{ p: 0.05, was: ["2025-01-01", "2025-01-31"] }} />);
  it("moves to the key when the series crosses every slot", () => {
    const h = render([0, 0.1, 0, 0.1, 0, 0.1, 0, 0.1, 0, 0.1, 0, 0.1]);
    expect(h).not.toMatch(/class="wk-ref"><line[^>]*><\/line><text/);
    expect(h).toMatch(/class="wk-key-ref">earlier 5%/);
  });
  it("stays in the chart when the series is clear of it", () => {
    const h = render(Array(12).fill(0.2));
    expect(h).toMatch(/class="wk-ref">.*<text[^>]*>earlier 5%<\/text>/);
    expect(h).not.toContain("wk-key-ref");
  });
});
