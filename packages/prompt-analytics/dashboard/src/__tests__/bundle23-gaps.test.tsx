import { htmlText } from "./text";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider } from "../state";
import { Overview } from "../components/Overview";
import { WeekChart } from "../components/Trend";
import { Repeats } from "../components/Repeats";
import { Works } from "../components/Works";
import { Friction } from "../components/Friction";
import { summarize } from "../lib/summary";
import { views } from "../lib/filter";
import { capabilities } from "../lib/capabilities";
import { noGain, promptBuckets } from "../lib/insights";
import sample from "../data/sample.dev.json";
import type { SessionRow } from "../data/types";

const win = (d: ReturnType<typeof normalize>) => ({ from: d.range.start, to: d.range.end, days: 30 });
type S = Record<string, unknown>;
const base = sample as unknown as { sessions: S[] };
const text = (h: string) => htmlText(h);
const render = (el: React.ReactNode, sessions: S[], extra: S = {}, initial: object = {}) =>
  renderToStaticMarkup(<StoreProvider d={normalize({ ...sample, sessions, ...extra } as never)} initial={initial}>{el}</StoreProvider>);
let n = 0;
const sess = (o: S): S => ({ ...base.sessions[0], id: `g${n++}`, title: `T${n}`, prompts: 3, cost_usd: 1, tokens: 100, applied: true, loops: 0, friction: 0.1, ...o });

describe("Trend WeekChart split mode", () => {
  const wk = (week: string, s: number, k: number) => ({ week, struggled: s, n: k, sessions: k, prompts: k, spend: null });
  const weekly = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"].map((w) => wk(w, 0.1, 40));
  const svg = (base: object | null, w = weekly) => renderToStaticMarkup(<WeekChart weekly={w} metric="struggled" view="area" base={base as never} />);
  const ref = { p: 0.026, was: ["2026-09-01", "2026-10-11"], now: ["2026-10-12", "2026-10-25"], tag: "last 4 weeks" };
  const attr = (h: string, re: RegExp) => { const m = h.match(re); return m ? [+m[1]] : []; };
  it("shades the compared weeks, labels the band, and draws the dashed earlier line up to it", () => {
    const h = svg(ref);
    expect(h).toMatch(/class="wk-cmp"/);
    expect(h).toContain("earlier 2.6%");
    expect(h).toMatch(/class="wk-ref"/);
    expect(h).toMatch(/class="wk-tag"[^>]*>last 4 weeks</);
    // 720 wide, 4 weeks: x(i) = 46 + 214.67i; the Oct 12 week starts half a step before x(2)
    const [sx] = attr(h, /class="wk-cmp" x="([\d.]+)"/), [x2] = attr(h, /<line x1="[\d.]+" x2="([\d.]+)" y1="[\d.]+" y2="[\d.]+"><\/line><text x="[\d.]+" y="[\d.]+" text-anchor="end">earlier/);
    expect(sx).toBeCloseTo(46 + 214.67 * 1.5, 0);
    expect(x2).toBeCloseTo(sx, 5);   // the line ends where the shading starts
  });
  it("a mid-week cut clips the shading at the cut, never a whole extra week", () => {
    const [sx] = attr(svg({ ...ref, was: ["2026-09-01", "2026-10-14"], now: ["2026-10-15", "2026-10-25"] }), /class="wk-cmp" x="([\d.]+)"/);
    expect(sx).toBeCloseTo(46 + 214.67 * (1.5 + 3 / 7), 0);
  });
  it("the earlier label sits at the line's right end and drops below when a dot is there", () => {
    const flat = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"].map((w) => wk(w, 0.028, 40));
    const cut = { ...ref, was: ["2026-09-01", "2026-10-09"], now: ["2026-10-10", "2026-10-25"] };   // the line ends 46px past the Oct 5 dot
    const [ly] = attr(svg(cut, flat), /<text x="[\d.]+" y="([\d.]+)" text-anchor="end">earlier/);
    const [lineY] = attr(svg(cut, flat), /<line x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)"[^>]*><\/line><text[^>]*>earlier/);
    expect(ly).toBeGreaterThan(lineY);   // 2.8% dots sit on the 2.6% line, so the label goes under it
    const h = svg(cut), [ly2] = attr(h, /<text x="[\d.]+" y="([\d.]+)" text-anchor="end">earlier/), [lineY2] = attr(h, /<line x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)"[^>]*><\/line><text[^>]*>earlier/);
    expect(ly2).toBeLessThan(lineY2);   // 10% dots are far above: the label stays over the line
  });
  it("keys the hollow dots in a caption only when one is shown", () => {
    expect(svg(ref)).not.toContain("under 25 sessions");
    expect(svg(null, [...weekly.slice(0, 3), wk("2026-10-19", 0.3, 10)])).toContain("\u25cb = under 25 sessions");
  });
  it("no cut means no shading, but the reference line stays", () => {
    const h = svg({ p: 0.026 });
    expect(h).not.toMatch(/wk-cmp/); expect(h).toContain("earlier 2.6%");
  });
  it("a week with n<25 is a hollow dot titled too few to read alone", () => {
    const h = svg(null, [...weekly.slice(0, 3), wk("2026-10-19", 0.3, 10)]);
    expect(h).toMatch(/data-low="true"[^>]*><title>[^<]*too few to read alone/);
    expect(h.match(/data-low="true"/g)).toHaveLength(1);
  });
  it("headline reads '11.0% last 4 weeks · 2.6% before' on sample data, period All", () => {
    const h = text(render(<Overview />, base.sessions));
    expect(h).toContain("11.0%last 4 weeks · 2.6% before");
  });
});

describe("Markdown summary Applied line", () => {
  it("states change sessions and explain excluded", () => {
    const d = normalize(sample as never), v = views(d, {});
    const md = summarize(d, { f: {}, v, win: win(d), caps: capabilities(d, v), prior: null, cmp: "off" });
    expect(md).toMatch(/- Applied: \d+(\.\d+)?% of [\d,]+ change sessions, explain excluded \(95% CI /);
  });
});

describe("Repeats so line", () => {
  it("names the most-typed prompt and its count", () => {
    const ss = [sess({ id: "a", cost_usd: null }), sess({ id: "b", cost_usd: null })];
    const h = text(render(<Repeats />, ss, { repeats: [{ cluster: 1, count: 5, exemplar: "do the thing", sessions: ["a", "b"] }] }));
    expect(h).toContain("You typed \u201cdo the thing\u201d 5 times: make it a slash command.");
  });
});

describe("no-gain card", () => {
  const row = (o: Partial<SessionRow>) => ({ ...(base.sessions[0] as unknown as SessionRow), ...o });
  const many = (k: number, c: number, prompts: number) => Array.from({ length: c }, (_, i) => sess({ prompts, applied: i < k }));
  it("pure helpers: null under MIN_N, flat=false when clearly higher", () => {
    const rs = (a: S[]) => a as unknown as SessionRow[];
    expect(noGain(rs([...many(10, 40, 8), ...many(5, 10, 15)]))).toBeNull();
    expect(noGain(rs([...many(8, 40, 8), ...many(36, 40, 15)]))?.flat).toBe(false);
    expect(promptBuckets([row({ prompts: 0 })]).every((b) => b.n === 0)).toBe(true);
  });
  it("renders 'no comparison yet' with too little data", () => {
    const h = text(render(<Works />, [...many(10, 40, 8), ...many(5, 10, 15)]));
    expect(h).toContain("Not enough sessions yet: 10 of 30 needed.");
  });
  it("renders the neutral 'more often' text, not 'no more often', when clearly higher", () => {
    const h = text(render(<Works />, [...many(8, 40, 8), ...many(36, 40, 15)]));
    expect(h).toContain("Past 10 prompts, applied rate rises to");
    expect(h).not.toContain("falls to");
  });
  it("renders the flat text when not clearly higher", () => {
    const h = text(render(<Works />, [...many(20, 40, 8), ...many(18, 40, 15)]));
    expect(h).toMatch(/applied rate (falls to|stays)/);
  });
});
