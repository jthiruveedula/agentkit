import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { CurveChart } from "../components/Curve";
import { normalize } from "../data/load";
import type { Insight } from "../data/types";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const render = (node: React.ReactNode) => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(node)); };
const data = normalize(sample);
const byId = (id: string) => data.insights.find((i) => i.id === id)!;
// no retry cliff in the mock rows (it would contradict Loop breaker), so build the 4-bin cumulative shape from another curve
const cliffOf = (): Insight => { const i = structuredClone(byId("works.prompt_length")) as Insight; i.id = "friction.retry_cliff"; i.evidence.curve = i.evidence.curve!.slice(0, 4); i.evidence.pick = 2; return i; };
const marked = () => [...el.querySelectorAll(".cv-x > span")].map((s) => s.hasAttribute("data-on"));

describe("curve insight chart", () => {
  it.each(["friction.retry_cliff", "works.prompt_length", "time.daypart"])("%s draws a band, a label and a tooltip with n per bin, and names the claim", (id) => {
    const ins = id === "friction.retry_cliff" ? cliffOf() : byId(id), c = ins.evidence.curve!;
    render(<CurveChart ins={ins} />);
    expect(el.querySelectorAll("rect.cv-band")).toHaveLength(c.filter((b) => b.n > 0).length);
    expect(el.querySelectorAll(".cv-x > span")).toHaveLength(c.length);
    expect([...el.querySelectorAll("svg title")].map((t) => t.textContent)).toEqual(c.map((b) => expect.stringContaining(`n=${b.n}`)));
    expect(el.querySelector('[role="img"]')!.getAttribute("aria-label")).toContain(ins.claim);
    expect(+el.querySelector("line.cv-base")!.getAttribute("y1")!).toBeCloseTo((1 - ins.evidence.baseline!) * 120, 1);
    expect(el.querySelectorAll("tbody tr")).toHaveLength(c.length);   // sr-only table mirrors the plot
  });

  it("cumulative marks the picked bin and every later one; a single pick marks only its bin", () => {
    const cliff = cliffOf();
    render(<CurveChart ins={cliff} />);
    expect(marked()).toEqual([false, false, true, true]);
    expect(el.querySelector("rect.cv-on")!.getAttribute("width")).toBe("2");
    act(() => root!.render(<CurveChart ins={byId("time.daypart")} />));
    expect(marked()).toEqual([false, false, true, false, false, false]);
    expect(el.querySelector("rect.cv-on")!.getAttribute("width")).toBe("1");
  });

  it("an empty bin gets no band or rate, and the line breaks there", () => {
    const ins = structuredClone(byId("time.daypart")) as Insight;
    ins.evidence.curve![0] = { label: "12am-4am", rate: 0, lo: 0, hi: 1, n: 0 };
    render(<CurveChart ins={ins} />);
    expect(el.querySelectorAll("rect.cv-band")).toHaveLength(5);
    expect(el.querySelector(".cv-x > span")!.textContent).toBe("12am-4amnone");
    expect(el.querySelector("path.cv-l")!.getAttribute("d")).toMatch(/^M1\.5,/);
  });

  it("renders nothing without a curve (older exports)", () => {
    const { curve: _c, ...evidence } = byId("works.prompt_length").evidence;
    render(<CurveChart ins={{ ...byId("works.prompt_length"), evidence }} />);
    expect(el.innerHTML).toBe("");
  });

  it("each chapter section shows its card, and none when the export has no curve insights", () => {
    render(<Dashboard d={data} />);
    const titles = () => [...el.querySelectorAll(".card")].map((c) => c.getAttribute("aria-label"));
    expect(titles()).toEqual(expect.arrayContaining(["Applied rate by opening prompt length", "Applied rate by start time"]));
    expect(el.querySelector("#s-works .cv")).not.toBeNull();
    act(() => root!.render(<Dashboard d={{ ...data, insights: data.insights.filter((i) => !i.evidence.curve) }} />));
    expect(el.querySelector(".cv")).toBeNull();
  });
});
