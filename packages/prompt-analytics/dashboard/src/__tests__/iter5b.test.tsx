// Iteration 5b: secret scan, repeats -> slash command draft, habit checklist, Weekly Wrapped (numbers match summarize()).
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import { SHAPES, noPrices, onlySources } from "../data/shapes";
import sample from "../data/sample.dev.json";
import { findSecrets } from "../lib/secrets";
import { draftCommand, shownRepeats, slugOf } from "../lib/repeats";
import { hasHabitData, missingHabits } from "../lib/habits";
import { playbook } from "../lib/playbook";
import { autoShow, hasCritical, isoWeek, markSeen, seen, wrapped } from "../lib/wrapped";
import { summarize } from "../lib/summary";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
type Raw = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const raw = sample as unknown as Raw;
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; try { localStorage.clear(); } catch { /* ignore */ } });
const mount = (r: Raw, hash = "") => { location.hash = hash; el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(r)} />)); };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
const noCritical = (r: Raw): Raw => ({ ...structuredClone(r), exposure: { ...r.exposure, items: r.exposure.items.filter((i: Raw) => i.category !== "secret") } });

describe("secret scan", () => {
  it("flags keys, emails, assignments", () => {
    for (const t of ["deploy with AKIAIOSFODNN7EXAMPLE now", "token ghp_abcdefghijklmnopqrstuvwxyz0123456789", "mail me at jane.doe@example.com", "password = hunter2hunter2", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345"])
      expect(findSecrets(t).length, t).toBeGreaterThan(0);
  });
  it("passes plain prose and placeholders", () => {
    for (const t of ["run the linter and fix every warning", "email [REDACTED:email] about it", "open [USER]/project", "commit 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b"])
      expect(findSecrets(t), t).toEqual([]);
  });
});

describe("repeats", () => {
  it("slug and draft", () => {
    expect(slugOf("Run the linter and fix every warning please")).toBe("run-the-linter-and-fix");
    expect(slugOf("!!!")).toBe("repeated-prompt");
    const long = slugOf("internationalization-configuration extraordinarily-comprehensive documentation-generation");
    expect(long.length).toBeLessThanOrEqual(40); expect(long).toBe("internationalization-configuration");
    const d = draftCommand({ exemplar: "run the tests", count: 4 });
    expect(d.path).toBe(".claude/commands/run-the-tests.md");
    expect(d.text).toMatch(/^---\ndescription: "run the tests"\n---\n\nrun the tests\n\n\$ARGUMENTS\n$/);
  });
  it("shownRepeats drops unknown sessions and sorts by count", () => {
    const r = [{ cluster: 0, count: 3, exemplar: "a", sessions: ["x"] }, { cluster: 1, count: 9, exemplar: "b", sessions: ["x", "y"] }, { cluster: 2, count: 20, exemplar: "c", sessions: ["z"] }];
    expect(shownRepeats(r, new Set(["x", "y"])).map((x) => [x.exemplar, x.sessions.length])).toEqual([["b", 2], ["a", 1]]);
    expect(shownRepeats(undefined, new Set())).toEqual([]);
  });
  it("loader tells absent from empty", () => {
    expect(normalize({ ...structuredClone(raw), repeats: [] }).repeats).toEqual([]);
    const old = normalize(SHAPES.missing(raw));
    expect(old.repeats).toBeUndefined(); expect(old.sessions.every((s) => s.features === undefined)).toBe(true);
  });
  it("card is hidden on older exports and blocks Copy for a draft with a secret", () => {
    mount(SHAPES.missing(raw), "#/s-friction");
    expect(el.textContent).not.toContain("Repeated prompts");
    act(() => root?.unmount()); el.remove();
    const r = structuredClone(raw); r.repeats = [{ cluster: 0, count: 5, exemplar: "deploy using AKIAIOSFODNN7EXAMPLE to prod", sessions: [r.sessions[0].id] }];
    mount(r, "#/s-friction");
    expect(el.textContent).toContain("times typed");
    act(() => { [...el.querySelectorAll("button")].find((b) => b.textContent === "Turn into a slash command")!.click(); });
    const copy = [...el.querySelectorAll("button")].find((b) => b.textContent === "Copy draft")!;
    expect(copy.disabled).toBe(true);
    expect(el.querySelector(".rep-d [role=status]")?.textContent).toBeTruthy();
  });
});

describe("habit checklist", () => {
  const d = normalize(raw), book = playbook(d.what_works, d.galaxy.clusters, d.what_works_tested, d.sessions, 50);
  it("only offers passing playbook features the session lacks", () => {
    expect(hasHabitData(d)).toBe(true);
    const passing = new Set(book.more.map((p) => p.feature.toLowerCase()));
    let seenAny = false;
    for (const r of d.sessions.filter((x) => !x.applied && x.features).slice(0, 60)) {
      const hs = missingHabits(d, r, book);
      for (const h of hs) { seenAny = true; expect(passing.has(h.feature.toLowerCase())).toBe(true); expect(r.features!.map((f) => f.toLowerCase())).not.toContain(h.feature.toLowerCase()); expect(h.play.lo).toBeGreaterThan(0); }
      expect(hs.length).toBeLessThanOrEqual(4);
    }
    expect(seenAny).toBe(true);
  });
  it("hidden for applied sessions and when features are missing", () => {
    const a = d.sessions.find((x) => x.applied && x.features)!;
    expect(missingHabits(d, a, book)).toEqual([]);
    expect(missingHabits(d, { ...d.sessions.find((x) => !x.applied)!, features: undefined }, book)).toEqual([]);
    expect(hasHabitData(normalize(SHAPES.missing(raw)))).toBe(false);
  });
});

describe("weekly wrapped", () => {
  const d = normalize(noCritical(raw));
  it("numbers match summarize() for the same view", () => {
    const w = wrapped(d)!, md = summarize(d, w.view), t = w.view.v.totals;
    expect(w).not.toBeNull(); expect(w.cards.length).toBeLessThanOrEqual(6);
    expect(md).toContain(`- Sessions: ${t.sessions.toLocaleString("en-US")}`);
    const spend = w.cards.find((c) => c.id === "spend")!;
    const costLine = md.split("\n").find((l) => l.startsWith("- Cost:"))!;
    expect(costLine).toContain(spend.big);
    expect(costLine).toContain(spend.line.replace(/ vs prior$/, ""));
  });
  it("leads with the week headline, streak last", () => {
    const ids = wrapped(d)!.cards.map((c) => c.id);
    expect(ids[0]).toBe("week"); expect(ids[ids.length - 1]).toBe("streak");
  });
  it("best prompt is short, redacted and secret-free", () => {
    const p = wrapped(d)!.cards.find((c) => c.id === "prompt");
    if (p) { expect(p.big.length).toBeLessThanOrEqual(162); expect(findSecrets(p.big)).toEqual([]); }
  });
  it("unpriced data shows tokens; single tool says so", () => {
    const u = wrapped(normalize(noPrices(noCritical(raw))))!;
    expect(u.cards.find((c) => c.id === "spend")!.kicker).toBe("Tokens");
    const one = wrapped(normalize(onlySources(noCritical(raw), ["claude_code"])));
    if (one) expect(one.cards.find((c) => c.id === "intent")?.note).toMatch(/only$/);
  });
  it("not offered for a thin view or an empty export", () => {
    expect(wrapped(normalize(SHAPES.small(raw)))).toBeNull();
    expect(wrapped(normalize(SHAPES.empty(raw)))).toBeNull();
  });
  it("ISO week ids", () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe("2026-W01");
    expect(isoWeek(new Date(2024, 11, 30))).toBe("2025-W01");
    expect(isoWeek(new Date(2021, 0, 3))).toBe("2020-W53");
  });
  it("auto-shows once per week, never with blocked storage or an open secret", () => {
    const now = new Date(2026, 9, 28), st = mem();
    expect(autoShow(d, now, st)).toBe(true);
    markSeen(now, st);
    expect(autoShow(d, now, st)).toBe(false);
    expect(autoShow(d, new Date(2026, 10, 5), st)).toBe(true);
    expect(seen(now, blocked)).toBeNull(); expect(autoShow(d, now, blocked)).toBe(false); expect(markSeen(now, blocked)).toBe(false);
    const crit = normalize(raw);
    expect(hasCritical(crit)).toBe(true); expect(autoShow(crit, now, mem())).toBe(true);   // chip only, never a dialog
  });
  it("dialog is modal, closes on Escape and the Overview button opens it", () => {
    mount(noCritical(raw), "#/s-overview");
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Weekly Wrapped");
    expect(btn).toBeTruthy();
    act(() => { localStorage.setItem("pa.wrapped.week", isoWeek(new Date())); btn!.click(); });
    const dlg = document.querySelector("[role=dialog][aria-modal=true].wrap");
    expect(dlg).not.toBeNull();
    expect(document.activeElement).toBe(dlg);   // focus lands inside, so Esc and Tab reach the dialog
    act(() => { dlg!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector(".wrap")).toBeNull();
  });
});
