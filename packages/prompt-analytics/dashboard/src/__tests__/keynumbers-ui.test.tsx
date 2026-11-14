import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
let root: Root | null = null;
let el: HTMLDivElement;
const mount = (hash = "#/s-overview") => {
  location.hash = hash;
  el = document.createElement("div"); document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(<Dashboard d={d} />));
};
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const params = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const tile = (id: string) => el.querySelector(`.kt[data-kpi="${id}"]`)!;

describe("Key numbers and usage mix", () => {
  it("six tiles in one card, each with a visual; spend shows its priced coverage", () => {
    mount();
    expect(el.querySelectorAll(".kcard .kpis.k6 > li")).toHaveLength(6);
    expect(tile("sessions").querySelectorAll("rect.wc-b").length).toBeGreaterThan(1);
    expect(tile("spend").querySelector(".km-l")!.textContent).toMatch(/^\d+% priced/);
    expect(tile("applied").querySelector("svg.gauge")).not.toBeNull();
    expect(tile("exposed").querySelectorAll(".kx > li")).toHaveLength(3);
  });

  it("All period: cost per applied change is grey 'mixed' (mean fell, median rose), sessions stay neutral ink", () => {
    mount();
    const cpa = tile("cpa").querySelector(".kd")!;
    expect(cpa.getAttribute("data-tone")).toBe("grey");
    expect(cpa.querySelector(".kd-g")!.textContent).toBe("mixed");
    expect(tile("cpa").querySelector(".sub")!.textContent).toMatch(/^median rose \$0\.49 to \$0\.7\d$/);
    expect(tile("sessions").querySelector(".kd")!.getAttribute("data-tone")).toBe("ink");
    expect(el.querySelector(".kc-key")!.textContent).toMatch(/Last 4 weeks vs the 22 weeks before/);
  });

  it("a model legend row filters by model (mdl), Other is not a control, Unknown filters on mdl=''", () => {
    mount();
    const card = el.querySelector("#s-mix-models")!;
    expect(card.querySelector('tr[data-kind="other"] button')).toBeNull();
    const first = card.querySelector<HTMLButtonElement>('tr[data-kind="model"] .mlg-b')!;
    const name = first.textContent!;
    act(() => first.click());
    expect(params().get("mdl")).toBe(name);
    const again = el.querySelector<HTMLButtonElement>('#s-mix-models tr[data-kind="model"] .mlg-b[aria-pressed="true"]')!;
    expect(again.textContent).toBe(name);
    act(() => again.click());
    expect(params().has("mdl")).toBe(false);
    const unk = el.querySelector<HTMLButtonElement>('#s-mix-models tr[data-kind="unknown"] .mlg-b');
    if (unk) { act(() => unk.click()); expect(params().get("mdl")).toBe(""); }
  });

  it("tool butterfly rows filter by tool; unpriced reads 'not priced', never $0", () => {
    mount();
    const rows = el.querySelectorAll<HTMLButtonElement>("#s-mix-tools .fly-r");
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(r.textContent).not.toMatch(/\$0\.00/);
    act(() => rows[0].click());
    expect(params().get("src")).toBeTruthy();
  });

  it("a model filter keeps the Model mix card, its pressed row and focus; Unknown shows missing tokens as missing, not 0", () => {
    mount();
    const unk = el.querySelector<HTMLButtonElement>('#s-mix-models tr[data-kind="unknown"] .mlg-b')!;
    expect(unk).not.toBeNull();
    unk.focus();
    act(() => unk.click());
    expect(params().get("mdl")).toBe("");
    const card = el.querySelector("#s-mix-models")!;
    expect(card).not.toBeNull();
    const pressed = card.querySelector<HTMLButtonElement>('tr[data-kind="unknown"] .mlg-b[aria-pressed="true"]')!;
    expect(pressed).toBe(unk);   // same node: focus never fell to <body>
    expect(document.activeElement).toBe(unk);
    expect(card.querySelector(".lede")!.textContent).toMatch(/^Filtered to sessions with no model id: \d+ sessions?\./);
    expect(tile("tokens").querySelector(".val")!.textContent).toBe("–");
    expect(tile("tokens").querySelector(".sub")!.textContent).toBe("no token data");
    // no tokens and no prices: the efficiency tile says what is missing, not why tokens stand in for cost
    expect(tile("tpa").querySelector(".val")!.textContent).toBe("–");
    expect(tile("tpa").querySelector(".sub")!.textContent).toBe("no token data");
    expect(el.querySelector("#s-mix-tools .lede")!.textContent).not.toMatch(/busiest/);
    act(() => [...card.querySelectorAll<HTMLButtonElement>(".card-acts button")].find((b) => b.textContent === "Tokens")!.click());
    expect(card.querySelector('tr[data-kind="unknown"] .mlg-v')!.textContent).toBe("no token data");
    expect(card.querySelector(".dn-of")!.textContent).toBe("No token data");
    act(() => pressed.click());
    expect(params().has("mdl")).toBe(false);
  });

  it("a named model filter keeps the card with one pressed row and says what is filtered, not 'runs 100%'", () => {
    mount("#/s-overview?mdl=gpt-5");
    const card = el.querySelector("#s-mix-models")!;
    expect(card.querySelectorAll(".mlg-b[aria-pressed='true']")).toHaveLength(1);
    expect(card.querySelector(".lede")!.textContent).toMatch(/^Filtered to gpt-5: \d+ sessions\./);
    expect(card.textContent).not.toMatch(/runs 100%/);
    expect(tile("sessions").querySelector(".sub")!.textContent).not.toMatch(/Top model/);
  });

  it("Key numbers names the top model and keeps spend's floor note at All; plurals read right", () => {
    mount();
    expect(tile("sessions").querySelector(".sub")!.textContent).toMatch(/\nTop model \S+ · \d+% of sessions$/);
    // the model id breaks only after "claude-", never inside "sonnet-4-5"
    expect([...tile("sessions").querySelectorAll(".sub .mn")].map((m) => m.textContent)).toEqual(["claude-", "sonnet-4-5"]);
    // split mode (All on the sample): totals cover all time but Applied and Exposed headline the last 4 weeks, and the title says so
    expect(el.querySelector("#kn-h")!.textContent).toBe("Key numbers: totals all time, rates last 4 weeks");
    expect(tile("spend").querySelector(".sub")!.textContent).toMatch(/A floor, not a total/);
    expect(el.querySelector("#s-overview")!.textContent).not.toMatch(/\b1 sessions\b/);
  });

  it("cost per applied change from under MIN_N priced applied sessions carries the low-sample note", () => {
    mount("#/s-overview?mdl=gpt-5&prj=billing-api");
    const sub = tile("cpa").querySelector(".sub")!;
    expect(sub.hasAttribute("data-low")).toBe(true);
    expect(sub.textContent).toMatch(/^Few sessions: \d+ priced of \d+ applied$/);
  });

  it("applied gauge: one plain range, 0/100 ends; tier bucket is 'Unrecognised' and defined", () => {
    mount();
    const a = tile("applied");
    expect(a.querySelector(".kg-l")!.textContent).toMatch(/^likely \d+% to \d+%/);
    expect(a.textContent).not.toMatch(/n=|CI|tick:/);
    expect([...a.querySelectorAll(".g-end")].map((t) => t.textContent)).toEqual(["0", "100"]);
    for (const g of el.querySelectorAll(".kd-g")) expect(g.textContent).not.toBe("within range");
    const tiers = el.querySelector("#s-mix-tiers")!;
    expect(tiers.querySelector(".tkey")!.textContent).toMatch(/Unrecognised/);
    if (/Unrecognised:/.test(tiers.querySelector(".note")!.textContent!)) expect(tiers.querySelector(".note")!.textContent).toMatch(/no model id or an id the tier table does not know/);
  });

  it("Exposed in split mode: headline on the last 4 weeks (the change's basis), whole window named in the sub", () => {
    mount();   // All on the sample is split mode: last 4 weeks vs the 22 before
    const x = tile("exposed"), sub = x.querySelector(".sub")!.firstChild!.textContent!;
    const m = /^Last 4 weeks: (\d+) of (\d+) sessions with open findings\nAll time: ([\d.]+%)$/.exec(sub)!;
    expect(m).not.toBeNull();
    expect(x.querySelector(".val")!.textContent).toBe(`${(Math.round((+m[1] / +m[2]) * 1000) / 10).toFixed(1)}%`);
    expect(x.querySelector(".val")!.textContent).not.toBe(m[3]);
  });

  it("Retries by intent: friction summary line, and its button sorts Sessions by friction, descending", () => {
    mount("#/s-friction");
    const card = [...el.querySelectorAll(".card")].find((c) => c.querySelector("h3")?.textContent === "Retries by intent")!;
    expect(card.textContent).toMatch(/Median session friction \d\.\d\d, p90 \d\.\d\d, n=\d+\./);
    const btn = [...card.querySelectorAll("button")].find((b) => b.textContent === "Sort sessions by friction")!;
    act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(params().get("so")).toBe("friction-d");
    const fr = [...el.querySelectorAll("#s-sessions tbody tr td.cx.num")].map((td) => td.textContent ?? "").filter((t) => /^\d\.\d\d$/.test(t)).map(Number);
    expect(fr.length).toBeGreaterThan(1);
    expect(fr).toEqual([...fr].sort((a, b) => b - a));
  });
});
