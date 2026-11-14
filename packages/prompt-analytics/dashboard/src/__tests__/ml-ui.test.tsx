import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider } from "../state";
import { Detail } from "../components/Detail";
import { nextActions } from "../lib/next";
import { views } from "../lib/filter";
import sample from "../data/sample.dev.json";

const base = sample as unknown as { sessions: Record<string, unknown>[]; what_works: Record<string, unknown>[]; insights: { id: string; chapter: string; drill: { filter: { cluster?: number } } }[]; recommendations: { evidence_insight: string }[] };
const html = (s: Record<string, unknown>) => renderToStaticMarkup(<StoreProvider d={normalize({ ...sample, sessions: [s] } as never)}><Detail id={String(s.id)} /></StoreProvider>);
const JARGON = /range|n=|bootstrap|rules|CI\b/;

describe("Detail struggle line", () => {
  const s = { ...base.sessions[0], id: "ml-1" };
  it("shown when struggle_p present", () => expect(html({ ...s, struggle_p: 0.62 })).toContain("About 62% of sessions like this one ended with nothing applied."));
  it("absent otherwise", () => { const { struggle_p: _p, ...rest } = s as Record<string, unknown>; expect(html(rest)).not.toContain("ended with nothing applied"); });
});

describe("nextActions uplift lines", () => {
  const rec = base.recommendations.find((r) => base.insights.find((i) => i.id === r.evidence_insight)?.chapter === "works")!;
  const ins = base.insights.find((i) => i.id === rec.evidence_insight)!;
  const cl = ins.drill.filter.cluster!;
  const mk = (ww: Record<string, unknown>[]) => { const dd = normalize({ ...sample, what_works: ww } as never); return nextActions(dd, views(dd, {}), {}, null, null).find((r) => r.id === (rec as unknown as { id: string }).id)!; };
  const w = { cluster: cl, feature: "file references", effect: 0.16, ci: [0.1, 0.22], n: 500, direction: "helps" };
  it("uplift and holdout replace effect text", () => {
    const r = mk([{ ...w, uplift: { pts: 11, n_with: 200, n_without: 300, strata: 4 }, holdout: { held: true, weeks: 3 } }]);
    expect(r.impact).toContain("Sessions that name the files land a change 11 points more often");
    expect(r.why).toContain("Held up in your last 3 weeks.");
    expect(r.why).not.toMatch(JARGON);
  });
  it("row without uplift keeps the old impact and a jargon-free fallback", () => {
    const r = mk([w]);
    expect(r.impact).toBe(((rec as unknown as { impact: string }).impact));
    expect(r.why).toBeTruthy();
    expect(r.why).not.toMatch(JARGON);
  });
});
