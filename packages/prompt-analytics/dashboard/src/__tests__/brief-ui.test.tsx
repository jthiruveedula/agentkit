import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider } from "../state";
import { Overview } from "../components/Overview";
import sample from "../data/sample.dev.json";

type S = Record<string, unknown>;
const base = sample as unknown as { sessions: S[]; insights: S[]; recommendations: S[] };
let n = 0;
const sess = (o: S): S => ({ ...base.sessions[0], id: `x${n++}`, title: `T${n}`, prompts: 3, cost_usd: 1, reached_stage: 6, applied: true, loops: 0, friction: 0.1, source: "cursor", date: "2026-10-20", project: "p0", intent: "bugfix", model: "gpt-5", ...o });
const RANGE = { start: "2026-10-01", end: "2026-10-28" }, DATED = { from: "2026-10-15", to: "2026-10-28" };
const html = (sessions: S[], extra: S = {}, initial: object = DATED) =>
  renderToStaticMarkup(<StoreProvider d={normalize({ ...sample, sessions, range: RANGE, ...extra } as never)} initial={initial}><Overview /></StoreProvider>);
// `count` sessions in the prior window (Oct 5) and in the current one (Oct 20), `bad` of each struggled
const rows = (p: string, c0: number, b0: number, c1: number, b1: number, intent = "bugfix") => [["2026-10-05", c0, b0], ["2026-10-20", c1, b1]].flatMap(([date, c, b]) =>
  Array.from({ length: c as number }, (_, i) => sess({ project: p, intent, date, friction: i < (b as number) ? 0.9 : 0.1 })));

describe("brief states", () => {
  it("no-prompt window: headline, Last prompt, Show all time", () => {
    const old = sess({ date: "2026-09-02" }), quiet = [sess({ prompts: 0 }), sess({ prompts: 0 })];
    const h = html([old, ...quiet]);
    expect(h).toMatch(/2 sessions, none with a prompt/);
    expect(h).toMatch(/Last prompt Sep 2/);
    expect(h).toMatch(/>Show all time</);
    expect(h).not.toMatch(/class="b-num"/);
    expect(html([old], {}, DATED)).toMatch(/No prompts in this window/);
    expect(h).toMatch(/No prompts</);
  });
  it("Last prompt honours the non-date filters", () => {
    const h = html([sess({ project: "p9", date: "2026-10-10" }), sess({ date: "2026-09-02" }), sess({ prompts: 0 })], {}, { ...DATED, project: "p0" });
    expect(h).toMatch(/Last prompt Sep 2/);
  });
  it("split mode with no prompts scopes the headline to the last 4 weeks", () => {
    const h = html([sess({ date: "2026-08-10" }), sess({ prompts: 0, date: "2026-10-20" })], { range: { start: "2026-08-01", end: "2026-10-28" } }, {});
    expect(h).toMatch(/1 session, none with a prompt in the last 4 weeks/);
  });
  it("equal 1-in-N phrasing falls back to percentages", () => {
    const h = html(rows("p0", 100, 35, 100, 39));
    expect(h.replace(/<[^>]+>/g, "")).toMatch(/of sessions struggled: 39\.0%, about the same as 35\.0%/);
  });
  it("CI ends never print -0.0", () => {
    const h = html(rows("p0", 30, 17, 60, 46));   // lo is about -0.03 pts
    expect(h).toMatch(/could be ±0 to \+39\.6/);
    expect(h).not.toMatch(/-0\.0/);
  });
  it("no-prompt window with a non-date filter offers Clear filters", () => {
    const h = html([sess({ prompts: 0 })], {}, { project: "p0" });
    expect(h).toMatch(/>Clear filters</);
    expect(h).not.toMatch(/Show all time/);
  });
  it("under 30 sessions a side: Too few sessions footnote", () => {
    const h = html(rows("p0", 10, 2, 10, 5));
    expect(h).toMatch(/Too few to compare/);
    expect(h).not.toMatch(/No baseline/);
    expect(h).toMatch(/Too few sessions with a prompt to compare yet \(n 10 vs 10\)/);
    expect(h).not.toMatch(/likely|could be/);
  });
  it("noise headline is led by a mover", () => {
    // same struggled rate (10%), 3x the sessions now: a Sessions mover leads, and is not repeated in Also moved
    const h = html(rows("p0", 40, 4, 120, 12));
    expect(h).toMatch(/Within noise/);
    expect(h).toMatch(/<h3[^>]*>[^<]*; struggling held</);
    expect(h).not.toMatch(/Struggling held at about/);
  });
});

describe("Do next matching", () => {
  const ins = (filter: S) => ({ insights: [{ ...base.insights[0], id: "iX", drill: { chapter: "friction", filter } }],
    recommendations: [{ ...base.recommendations[0], id: "rX", title: "RECTITLE", evidence_insight: "iX" }] });
  const driver = () => rows("p0", 40, 4, 40, 24);   // driver = p0 / bugfix
  it("shows the recommendation when its project matches the driver", () => {
    const h = html(driver(), ins({ project: "p0" }));
    expect(h).toMatch(/RECTITLE/);
    expect(h).toMatch(/>Show evidence</);
  });
  it("shows the recommendation when project matches and only one side has an intent", () => {
    expect(html(driver(), ins({ project: "p0", intent: "bugfix" }))).toMatch(/RECTITLE/);
    expect(html(driver(), ins({ project: "p0" }))).toMatch(/RECTITLE/);
  });
  it("falls back to the top attention item on a different project, a different intent, or no project", () => {
    for (const f of [{ project: "other" }, { project: "p0", intent: "refactor" }, {}, { intent: "bugfix" }]) {
      const h = html(driver(), ins(f));
      expect(h).not.toMatch(/RECTITLE/);
      expect(h).not.toMatch(/>Show evidence</);
      expect(h).toMatch(/<dt>Do next<\/dt>/);
    }
  });
  it("Open N sessions counts what the drill-down returns, prompt-less sessions included", () => {
    const h = html([...driver(), ...Array.from({ length: 3 }, () => sess({ prompts: 0 }))]);
    expect(h).toMatch(/of its 40 sessions struggled/);
    expect(h.match(/aria-label="Open 43 sessions: p0 \/ bugfix">Open 43 sessions</g)).toHaveLength(2);   // Brief and Drivers panel
  });
  it("with no driver the recommendation always shows", () => {
    expect(html(rows("p0", 40, 4, 40, 4), ins({ project: "other" }))).toMatch(/RECTITLE/);
  });
});
