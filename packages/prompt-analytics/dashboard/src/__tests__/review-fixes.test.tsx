import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider } from "../state";
import { Funnel } from "../components/Funnel";
import { ModelFit } from "../components/ModelFit";
import { Works } from "../components/Works";
import { Overview } from "../components/Overview";
import { chips } from "../lib/filter";
import { fromHash, toHash } from "../lib/hash";
import sample from "../data/sample.dev.json";

type S = Record<string, unknown>;
const base = sample as unknown as { sessions: S[]; range: object };
let n = 0;
const sess = (o: S): S => ({ ...base.sessions[0], id: `x${n++}`, title: `T${n}`, prompts: 3, cost_usd: 1, reached_stage: 6, applied: true, loops: 0, friction: 0.1, source: "cursor", date: "2026-10-20", project: "p", intent: "bugfix", model: "gpt-5", ...o });
const data = (sessions: S[], range?: object) => normalize({ ...sample, sessions, ...(range ? { range } : {}) } as never);
const html = (d: ReturnType<typeof normalize>, C: () => React.ReactElement, initial?: object) => renderToStaticMarkup(<StoreProvider d={d} initial={initial}><C /></StoreProvider>);

describe("review fixes", () => {
  it("Funnel step rates show n/a when the previous stage is empty", () => {
    const h = html(data([sess({ reached_stage: 1 }), sess({ reached_stage: 1 })]), Funnel);
    expect(h).toMatch(/aria-label="Response: n\/a"/);
  });

  it("ModelFit says too few sessions under 15 per tool", () => {
    const few = Array.from({ length: 14 }, () => sess({}));
    expect(html(data(few), ModelFit)).toMatch(/too few sessions/);
    const enough = Array.from({ length: 15 }, () => sess({}));
    expect(html(data(enough), ModelFit)).not.toMatch(/too few sessions/);
  });

  it("Works best sessions skip no-prompt and unpriced rows, cheapest first", () => {
    const d = data([sess({ title: "ZERO", prompts: 0, cost_usd: 0.01 }), sess({ title: "UNPRICED", cost_usd: null }),
      sess({ title: "PRICEY", cost_usd: 9 }), sess({ title: "CHEAP", cost_usd: 2 })]);
    const h = html(d, Works), i = h.indexOf("Best sessions to copy");
    expect(i).toBeGreaterThan(-1);
    const t = [...h.slice(i).matchAll(/Open session: (\w+)/g)].map((m) => m[1]);
    expect(t).toEqual(["CHEAP", "PRICEY"]);
  });

  // two 14-day windows of 40 sessions per project; k = struggled count per window
  const win = (ks: [number, number][]) => {
    const rows: S[] = [];
    ks.forEach(([k0, k1], p) => [["2026-10-05", k0], ["2026-10-20", k1]].forEach(([date, k]) => {
      for (let i = 0; i < 40; i++) rows.push(sess({ project: `p${p}`, date, friction: i < (k as number) ? 0.9 : 0.1 }));
    }));
    return html(data(rows, { start: "2026-10-01", end: "2026-10-28" }), Overview, { from: "2026-10-15", to: "2026-10-28" });
  };
  it("Brief says struggling held, with could-be wording, when the struggled diff is ~0", () => {
    const h = win([[4, 4], [4, 4], [4, 4]]);
    expect(h).toMatch(/Within noise/);
    expect(h).toMatch(/Struggling held at about 10\.0%/);
    expect(h.replace(/<[^>]+>/g, "")).toMatch(/of sessions struggled: 10\.0%, about the same as 10\.0%/);
    expect(h).toMatch(/±0 pts · could be -?\d+\.\d to \+\d+\.\d · n 120 vs 120/);
    expect(h).toMatch(/>Show evidence</);   // no driver, so the top recommendation is Do next
    expect(h).not.toMatch(/data-kpi="struggled"/);
  });
  it("Brief names the driver once, with its counts and sessions button", () => {
    const h = win([[4, 24], [4, 4], [4, 4]]);
    expect(h).toMatch(/<b>p0 \/ bugfix<\/b>: 24 of its 40 sessions struggled, up from 4 of 40\./);
    expect(h).toMatch(/>Open 40 sessions</);
    expect(h).not.toMatch(/mostly|partly/);
    const spread = win([[4, 16], [4, 16], [4, 16]]);
    expect(spread.match(/sessions struggled, up from/g)).toHaveLength(1);
    expect(spread).not.toMatch(/mostly|partly/);
  });

  it("empty project is labelled and survives the URL hash", () => {
    expect(chips({ project: "" })[0].label).toBe("(no project)");
    expect(fromHash(toHash({ f: { project: "" }, list: false, cmp: "prev" })).nav.f.project).toBe("");
  });
});
