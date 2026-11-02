import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider } from "../state";
import { ModelFit } from "../components/ModelFit";
import { capabilities, sectionsFor } from "../lib/capabilities";
import { views } from "../lib/filter";
import { SECTIONS } from "../lib/hash";
import sample from "../data/sample.dev.json";

const html = (d: ReturnType<typeof normalize>) => renderToStaticMarkup(<StoreProvider d={d}><ModelFit /></StoreProvider>);

describe("ModelFit", () => {
  it("renders KPIs, matrix table and per-tool rows when sessions carry models", () => {
    const h = html(normalize(sample as never));
    expect(h).toMatch(/id="s-models"/);
    expect(h).toMatch(/Right-sized/); expect(h).toMatch(/<table[^>]*aria-label="Task size against model tier/);
    expect(h).toMatch(/data-src="model fit/); expect(h).toMatch(/mf-recs/);
  });
  it("shows an empty state without models, and old exports get no nav item", () => {
    const d = normalize({ ...(sample as object), sessions: (sample as { sessions: object[] }).sessions.map((s) => ({ ...s, model: null })) } as never);
    expect(html(d)).toMatch(/No sessions with a known model/);
    const secs = (x: typeof d) => { const v = views(x, {}); return sectionsFor(capabilities(x, v), x, v); };
    expect(secs(d).has("s-models")).toBe(false);
    expect(secs(normalize(sample as never)).has("s-models")).toBe(true);
    expect(SECTIONS).toContain("s-models");
  });
});
