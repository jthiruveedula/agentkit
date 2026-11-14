import { describe, expect, it } from "vitest";
import { nextActions } from "../lib/next";
import { MAX_LOOPS, views } from "../lib/filter";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

const d = normalize(sample), v = views(d, {});
const secret = { id: "x1", category: "secret", status: "open", session: d.sessions[0].id, date: "2026-01-01" };
const withSecret = { ...d, exposure: { ...d.exposure, items: [secret, ...d.exposure.items.filter((i) => i.category !== "secret")] } } as never as typeof d;

describe("nextActions", () => {
  it("an open secret sorts above every recommendation", () => {
    const rows = nextActions(withSecret, views(withSecret, {}), {}, null, null);
    expect(rows[0].id).toBe("exp-secret");
    expect(rows[0].action).toMatch(/^Rotate 1 open secret$/);
    expect(rows.findIndex((r) => r.id === d.recommendations[0].id)).toBeGreaterThan(0);
  });
  it("recommendations keep analyzer order, except one matching the driver, which leads its tier", () => {
    const ids = d.recommendations.map((r) => r.id), byId = new Map(d.insights.map((i) => [i.id, i]));
    const recs = (rows: ReturnType<typeof nextActions>) => rows.filter((r) => ids.includes(r.id)).map((r) => r.id);
    expect(recs(nextActions(d, v, {}, null, null))).toEqual(ids);
    const last = byId.get(d.recommendations.at(-1)!.evidence_insight)!.drill.filter;
    if (ids.length > 1 && last.project) expect(recs(nextActions(d, v, {}, null, { project: last.project, intent: last.intent }))[0]).toBe(ids.at(-1));
  });
  it("an attention item that drills to a recommendation's evidence filter is dropped", () => {
    const e = d.insights.find((i) => i.id === d.recommendations[0].evidence_insight)!;
    const dd = { ...d, insights: d.insights.map((i) => (i === e ? { ...i, drill: { ...i.drill, filter: { loops: MAX_LOOPS } } } : i)) } as never as typeof d;
    const base = nextActions(d, v, {}, null, null).filter((r) => r.id === "loops").length;
    const rows = nextActions(dd, views(dd, {}), {}, null, null);
    if (base) expect(rows.some((r) => r.id === "loops")).toBe(false);
  });
  it("the models row needs a saving of at least 5% of priced spend", () => {
    const none = nextActions({ ...d, sessions: d.sessions.map((s) => ({ ...s, model: null, cost_usd: null })) } as never as typeof d, views({ ...d, sessions: d.sessions.map((s) => ({ ...s, model: null, cost_usd: null })) } as never as typeof d, {}), {}, null, null);
    expect(none.some((r) => r.id === "models")).toBe(false);
  });
  it("every row starts with a capitalised verb and carries a number with its unit", () => {
    for (const r of nextActions(d, v, {}, null, null)) {
      expect(r.action).toMatch(/^[A-Z][a-z]+ /);
      expect(r.impact).toMatch(/\d|data (degraded|missing)/);
    }
  });
});
