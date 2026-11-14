import { describe, it, expect } from "vitest";
import { upliftLine, holdoutLine, struggleLine } from "../lib/ml";
import { playbook, habitLabel } from "../lib/playbook";
import { struggled } from "../lib/filter";
import type { SessionRow } from "../data/types";

describe("ml lines", () => {
  const u = { pts: 12.4, n_with: 40, n_without: 60, strata: 5 };
  it("uplift", () => {
    expect(upliftLine("name the files", u)).toBe("Sessions that name the files land a change 12 points more often than similar ones that don't (100 sessions, same task and tool).");
    expect(upliftLine("x", { ...u, pts: -8 })).toContain("8 points less often");
    expect(upliftLine("x", undefined)).toBeNull();
  });
  it("holdout", () => {
    expect(holdoutLine({ held: true, weeks: 3 })).toBe("Held up in your last 3 weeks.");
    expect(holdoutLine({ held: false, weeks: 3 })).toBe("Did not hold up in recent weeks, treat it as a hunch.");
    expect(holdoutLine(null)).toBeNull();
    expect(holdoutLine(undefined)).toBeNull();
  });
  it("struggle", () => {
    expect(struggleLine(0.734)).toBe("About 73% of sessions like this one ended with nothing applied.");
    expect(struggleLine(undefined)).toBeNull();
  });
});

describe("wiring", () => {
  const row = (feature: string, holdout?: { held: boolean; weeks: number } | null) => ({ cluster: -1, feature, effect: 0.2, ci: [0.1, 0.3] as [number, number], n: 500, direction: "helps" as const, ...(holdout !== undefined ? { holdout } : {}) });
  it("playbook sorts held=false after others", () => {
    const b = playbook([row("file references", { held: false, weeks: 3 }), { ...row("error message pasted", null), effect: 0.1, ci: [0.05, 0.15] }], []);
    expect(b.all.map((p) => p.feature)).toEqual(["error message pasted", "file references"]);
    expect(b.all[1].hunch).toBe(true);
  });
  it("habit label", () => { expect(habitLabel("file references")).toBe("name the files"); expect(habitLabel("zzz")).toBe("use zzz"); });
  const s = (o: Partial<SessionRow>) => ({ prompts: 3, loops: 5, friction: 0.9, ...o }) as SessionRow;
  it("struggled uses struggle_p when present", () => {
    expect(struggled(s({}))).toBe(true);
    expect(struggled(s({ struggle_p: 0.2 }))).toBe(false);
    expect(struggled(s({ loops: 0, friction: 0, struggle_p: 0.5 }))).toBe(true);
  });
});

describe("review fixes", () => {
  it("maps analyzer axes to plain habits", () => {
    expect(habitLabel("specificity")).toBe("name files, symbols or the error");
    expect(habitLabel("file references")).toBe("name the files");
  });
  it("says 'about as often' when uplift rounds to zero", () => {
    expect(upliftLine("name the files", { pts: 0.3, n_with: 10, n_without: 12, strata: 2 })).toContain("about as often");
  });
});
