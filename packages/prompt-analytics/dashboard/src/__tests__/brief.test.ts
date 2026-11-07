import { describe, expect, it } from "vitest";
import { basis, oneIn, segCount, verdict } from "../lib/brief";
import { rateOf } from "../lib/metrics";
import type { SessionRow } from "../data/types";
import type { Prior } from "../lib/compare";
import sample from "../data/sample.dev.json";
import { normalize } from "../data/load";
import { views } from "../lib/filter";
import { capabilities } from "../lib/capabilities";
import { summarize } from "../lib/summary";

const proto = (sample as unknown as { sessions: SessionRow[] }).sessions[0];
const row = (date: string, bad = false): SessionRow => ({ ...proto, date, prompts: 3, loops: bad ? 3 : 0, friction: 0 });
const win = (from: string, to: string, days: number) => ({ from, to, days });

describe("basis", () => {
  it("uses the prior window when there is one", () => {
    const rows = [row("2026-10-20")], pr = { win: win("2026-09-01", "2026-09-30", 30), v: { rows: [row("2026-09-10")] } } as unknown as Prior;
    const b = basis(rows, pr, win("2026-10-01", "2026-10-30", 30), "prev");
    expect(b.mode).toBe("prior");
    expect(b.cur).toBe(rows);
    expect(b.base).toBe(pr.v.rows);
    expect(b.label).toMatch(/^vs /);
  });
  it("splits at to - 27 days from 56 days: cut day is in the last 4 weeks", () => {
    const rows = [row("2026-09-29"), row("2026-09-30"), row("2026-10-27")];
    const b = basis(rows, null, win("2026-09-01", "2026-10-27", 56), "prev");
    expect(b.mode).toBe("split");
    expect(b.cut).toBe("2026-09-30");
    expect(b.cur.map((r) => r.date)).toEqual(["2026-09-30", "2026-10-27"]);
    expect(b.base!.map((r) => r.date)).toEqual(["2026-09-29"]);
    expect(b.label).toBe("Last 4 weeks vs the 4 before");
  });
  it("has no basis under 56 days", () => {
    const b = basis([row("2026-10-01")], null, win("2026-09-01", "2026-10-25", 55), "prev");
    expect(b).toMatchObject({ mode: "none", base: null, label: "" });
    expect(b.cut).toBeUndefined();
  });
  it("does not split when the comparison is off", () => {
    expect(basis([row("2026-10-01")], null, win("2026-09-01", "2026-10-27", 56), "off")).toMatchObject({ mode: "none", base: null, label: "" });
  });
});

describe("verdict", () => {
  it("clear up and clear down", () => {
    const up = verdict(rateOf(60, 200), rateOf(20, 200));
    expect(up).toMatchObject({ kind: "clear", dir: "up", eyebrow: "Clear rise" });
    const dn = verdict(rateOf(20, 200), rateOf(60, 200));
    expect(dn).toMatchObject({ kind: "clear", dir: "down", eyebrow: "Clear drop" });
  });
  it("early: real but the near CI end is under 3 pts", () => {
    const v = verdict(rateOf(15, 100), rateOf(6, 100));   // +9 pts, lo ~ +1
    expect(v.kind).toBe("early");
    expect(v.dir).toBe("up");
    expect(v.eyebrow).toBe("Early sign");
  });
  it("noise when the change is not real", () => {
    expect(verdict(rateOf(20, 100), rateOf(20, 100))).toMatchObject({ kind: "noise", eyebrow: "Within noise" });
  });
  it("none with no base, or fewer than 30 sessions on either side", () => {
    expect(verdict(rateOf(10, 100), null)).toMatchObject({ kind: "none", dir: null, d: null, eyebrow: "No baseline" });
    expect(verdict(rateOf(10, 29), rateOf(10, 100)).kind).toBe("none");
    expect(verdict(rateOf(10, 100), rateOf(10, 29)).kind).toBe("none");
    expect(verdict(rateOf(10, 30), rateOf(10, 30)).kind).not.toBe("none");
  });
  it("eyebrow names why there is no verdict", () => {
    expect(verdict(rateOf(10, 29), rateOf(10, 100)).eyebrow).toBe("Too few to compare");
    expect(verdict(rateOf(0, 0), rateOf(10, 100)).eyebrow).toBe("No prompts");
    expect(verdict(rateOf(0, 0), null).eyebrow).toBe("No prompts");
  });
});

describe("oneIn", () => {
  it("rounds 1/p", () => { expect(oneIn(0.11)).toBe("1 in 9"); });
  it("handles zero", () => { expect(oneIn(0)).toBe("none"); });
  it("says N in 10 above half instead of 1 in 1", () => { expect(oneIn(0.7)).toBe("7 in 10"); expect(oneIn(0.5)).toBe("1 in 2"); expect(oneIn(0.97)).toBe("9 in 10"); expect(oneIn(1)).toBe("10 in 10"); });
});

describe("segCount", () => {
  it("counts every session the drill-down returns, prompt-less ones included", () => {
    const rs = [row("2026-10-01"), { ...row("2026-10-01"), prompts: 0 }, { ...row("2026-10-01"), project: "zz" }, { ...row("2026-10-01"), intent: "zz" as never }];
    expect(segCount(rs, { project: proto.project, intent: proto.intent })).toBe(2);
    expect(segCount(rs, { project: proto.project })).toBe(3);
  });
});

describe("summary comparison line", () => {
  it("names the brief's split basis when given", () => {
    const d = normalize(sample as never), v = views(d, {});
    const md = summarize(d, { f: {}, v, win: { from: d.range.start, to: d.range.end, days: 90 }, caps: capabilities(d, v), prior: null, cmp: "prev", basis: "Last 4 weeks vs the 9 before" });
    expect(md).toContain("- Comparison: Last 4 weeks vs the 9 before");
  });
});
