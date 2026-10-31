import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { Works } from "../components/Works";
import { StoreProvider } from "../state";
import { EnginePill, pillText } from "../components/Engine";

const clusters = [
  { id: 0, label: "Fix tests", size: 400, intent: "debug", success: 0.7, cx: 0.2, cy: 0.2 },
  { id: 1, label: "Add feature", size: 300, intent: "build", success: 0.5, cx: 0.6, cy: 0.5 },
];
const basic = normalize({ schema: "1.0", galaxy: { clusters, points: { x: [], y: [], c: [], q: [] } },
  engine: { mode: "basic", requested: "auto", available: ["basic"], libs: {}, accel: "cpu", reason: "", upgrade: { mode: "ml", command: "pip install 'prompt-analytics[ml]'" }, methods: {} } });
const ml = normalize({ schema: "1.0", engine: { mode: "ml", available: ["basic", "ml"], libs: { scikit_learn: "1.9.1" } } });

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
describe("engine tiers", () => {
  it("normalize defaults engine to basic", () => { expect(normalize({ schema: "1.0" }).engine.mode).toBe("basic"); });
  it("pill text per tier", () => {
    expect(pillText(basic.engine)).toMatch(/Heuristics/);
    expect(pillText(ml.engine)).toMatch(/ML .* scikit-learn 1\.9\.1/);
    expect(pillText({ ...ml.engine, mode: "deep", accel: "mps" })).toMatch(/Semantic .* mps/);
  });
  it("basic renders the topic treemap, not the galaxy", () => {
    const html = renderToStaticMarkup(<StoreProvider d={basic}><Works /></StoreProvider>);
    expect(html).toMatch(/Topics, grouped by keywords/);
    expect(html).not.toMatch(/Topic galaxy/);
  });
  const mount = (d: typeof ml) => {
    const el = document.createElement("div"); document.body.append(el);
    const r = createRoot(el);
    act(() => r.render(<EnginePill d={d} onData={() => {}} />));
    act(() => { el.querySelector<HTMLButtonElement>(".pill")!.click(); });
    return [...el.querySelectorAll<HTMLButtonElement>(".seg button")].map((b) => [b.textContent, b.disabled] as const);
  };
  it("switch is disabled without a token (file://)", () => {
    vi.stubEnv("DEV", false);
    expect(mount(ml).every(([, dis]) => dis)).toBe(true);
    vi.unstubAllEnvs();
  });
  it("with a token, unavailable tiers are disabled and others enabled", () => {
    document.head.innerHTML = '<meta name="pa-token" content="t">';
    const m = Object.fromEntries(mount(ml));
    expect(m).toEqual({ Auto: false, Basic: false, ML: false, Deep: true });
    document.head.innerHTML = "";
  });
});
