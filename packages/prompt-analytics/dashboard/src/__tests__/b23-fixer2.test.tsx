import { htmlText } from "./text";
// Bundle 2+3 review round 1, Fixer 2: insights denominators, no-gain chart scale and whiskers, funnel prior guard, switch headers.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider } from "../state";
import { Works } from "../components/Works";
import { Funnel } from "../components/Funnel";
import { netValue, noGain, promptBuckets } from "../lib/insights";
import sample from "../data/sample.dev.json";
import type { SessionRow } from "../data/types";

type S = Record<string, unknown>;
const base = sample as unknown as { sessions: S[] };
const text = (h: string) => htmlText(h);
const render = (el: React.ReactNode, sessions: S[], extra: S = {}, initial: object = {}) =>
  renderToStaticMarkup(<StoreProvider d={normalize({ ...sample, sessions, ...extra } as never)} initial={initial}>{el}</StoreProvider>);
let n = 0;
const sess = (o: S): S => ({ ...base.sessions[0], id: `f2-${n++}`, title: "T", intent: "bugfix", prompts: 3, cost_usd: 1, tokens: 100, applied: true, loops: 0, friction: 0.1, reached_stage: 5, ...o });
const row = (o: Partial<SessionRow>): SessionRow => ({ id: "x", source: "claude_code", date: "2026-03-02", project: "p", intent: "bugfix", prompts: 2, tokens: 10, cost_usd: 1, reached_stage: 5, applied: true, loops: 0, friction: 0.2, cluster: 0, title: "", ...o });

describe("insights use change sessions", () => {
  it("promptBuckets and noGain leave explain sessions out", () => {
    const xs = Array.from({ length: 40 }, (_, i) => row({ id: `e${i}`, intent: "explain", prompts: 8, applied: false }));
    expect(promptBuckets(xs).every((b) => b.n === 0)).toBe(true);
    const mid = Array.from({ length: 40 }, (_, i) => row({ id: `m${i}`, prompts: 8, applied: i < 20 }));
    const over = Array.from({ length: 40 }, (_, i) => row({ id: `o${i}`, prompts: 15, applied: i < 20 }));
    expect(noGain([...mid, ...over, ...xs])?.mid).toMatchObject({ n: 40, k: 20 });   // explain would make it 80 / 20
  });
  it("netValue counts only sessions with a prompt, and keeps the explain row", () => {
    const nv = netValue([row({ prompts: 0, applied: false }), row({ prompts: 2 }), row({ intent: "explain", applied: false })]);
    expect(nv.find((x) => x.intent === "bugfix")).toMatchObject({ n: 1, rate: 1 });
    expect(nv.find((x) => x.intent === "explain")).toMatchObject({ n: 1, rate: 0 });
    expect(netValue([row({ prompts: 0 })])).toEqual([]);
  });
});

describe("no-gain chart", () => {
  const many = (k: number, c: number, prompts: number) => Array.from({ length: c }, (_, i) => sess({ prompts, applied: i < k }));
  const h = render(<Works />, [...many(20, 40, 8), ...many(10, 40, 15)]);
  const card = h.slice(h.indexOf('id="s-nogain"'));
  it("draws columns on a 0-100% scale with a labelled top", () => {
    expect(card).toMatch(/aria-label="6–10 prompts: 50% applied[^"]*"[^>]*><i style="height:50%/);   // 50% fills half, not the whole column
    expect(text(card)).toContain("100%");
  });
  it("draws one Wilson whisker per non-empty column", () => {
    const ci = card.slice(card.indexOf('class="ng-ci"'), card.indexOf('class="ng-x"'));
    expect(ci.match(/<i /g)).toHaveLength(2);   // 6-10 and 11-20 have sessions; the rest are empty
  });
});

describe("funnel previous-period drop", () => {
  const cur = (k: number) => Array.from({ length: k }, (_, i) => sess({ date: "2026-03-10", reached_stage: i % 2 ? 5 : 3 }));
  const pri = (k: number) => Array.from({ length: k }, () => sess({ date: "2026-03-03", reached_stage: 2 }));
  const f = { from: "2026-03-08", to: "2026-03-14" }, range = { range: { start: "2026-03-01", end: "2026-03-14" } };
  it("prints 'was' only when the prior period has at least MIN_PRIOR_N sessions", () => {
    expect(text(render(<Funnel />, [...cur(10), ...pri(4)], range, f))).not.toMatch(/, was /);
    expect(text(render(<Funnel />, [...cur(10), ...pri(5)], range, f))).toMatch(/, was /);
  });
});

describe("tool switch headers", () => {
  it("wrap long tool names at a break hint instead of truncating, with the full name in the title", () => {
    const ss = [sess({ source: "claude_code" }), sess({ source: "antigravity" })];
    const h = render(<Funnel />, ss, { tool_switch: [{ from: "claude_code", to: "antigravity", count: 3 }, { from: "antigravity", to: "claude_code", count: 2 }] });
    expect(h).toMatch(/class="mx-h" title="to Antigravity">Anti­gravity</);
  });
});
