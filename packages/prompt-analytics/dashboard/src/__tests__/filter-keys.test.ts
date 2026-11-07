import { describe, expect, it } from "vitest";
import { applyFilter, chips, match, openExposure, struggled, views } from "../lib/filter";
import { fromHash, toHash } from "../lib/hash";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

const d = normalize(sample);
const base = d.sessions[0];
const row = (id: string, o: object) => ({ ...base, id, prompts: 2, loops: 0, friction: 0, ...o });
const rows = [row("a", { loops: 3 }), row("b", { friction: 0.5 }), row("c", {}), row("d", { prompts: 0, loops: 9 })];

describe("struggled / exposed filters", () => {
  it("struggled rule: prompts>0 and (loops>=3 or friction>=0.5)", () => {
    expect(rows.map(struggled)).toEqual([true, true, false, false]);
    expect(applyFilter(rows, { struggled: true }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(applyFilter(rows, { struggled: false }).map((r) => r.id)).toEqual(["c", "d"]);
  });
  it("exposed matches via the ex set; without a set nothing is exposed", () => {
    const ex = new Set(["a", "c"]);
    expect(applyFilter(rows, { exposed: true }, ex).map((r) => r.id)).toEqual(["a", "c"]);
    expect(applyFilter(rows, { exposed: false }, ex).map((r) => r.id)).toEqual(["b", "d"]);
    expect(match(rows[0], { exposed: true })).toBe(false);
    expect(match(rows[0], { exposed: false })).toBe(true);
  });
  it("views() supplies the exposure set itself", () => {
    const open = openExposure(d);
    expect(views(d, { exposed: true }).rows.length).toBe(d.sessions.filter((r) => open.has(r.id)).length);
  });
  it("chip labels", () => {
    const l = (f: object) => chips(f).map((c) => c.label);
    expect(l({ struggled: true })).toEqual(["Struggled"]);
    expect(l({ struggled: false })).toEqual(["Didn't struggle"]);
    expect(l({ exposed: true })).toEqual(["Open findings"]);
    expect(l({ exposed: false })).toEqual(["No open findings"]);
  });
  it("sg/ex hash round-trip, bad values ignored", () => {
    for (const f of [{ struggled: true, exposed: false }, { struggled: false, exposed: true }]) {
      const nav = { f, list: false, cmp: "prev" as const };
      expect(fromHash(toHash(nav)).nav.f).toEqual(f);
    }
    expect(toHash({ f: { struggled: true, exposed: false }, list: false, cmp: "prev" })).toContain("sg=1&ex=0");
    expect(fromHash("#/s-overview?sg=2&ex=yes").nav.f).toEqual({});
  });
});
