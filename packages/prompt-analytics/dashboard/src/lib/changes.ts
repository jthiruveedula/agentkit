// Top changes for the Overview ribbon, read from insights the analyzer already exports: curve standouts (works.prompt_length, time.daypart,
// friction.retry_cliff), the weekly applied-rate level shift (time.shift.applied) and the latest cost-per-change spike (time.anomaly.cost_per_change.*). Pure.
import type { Insight } from "../data/types";

export interface Change { id: string; label: string; delta: string; tone: "good" | "bad"; sec: string; chapter: string; kind: "curve" | "shift" | "cost"; mag: number }

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** One insight as a ribbon change, or null when it is none of the three kinds (or its numbers are missing). `mag` is the relative move, comparable across kinds. */
export function toChange(i: Insight): Change | null {
  const e = i.evidence, base = { id: i.id, label: i.claim, chapter: i.chapter, sec: `s-${i.chapter}` };
  if (e.curve?.length && e.baseline != null && e.baseline > 0) {
    const r = i.value / 100, d = Math.round((r - e.baseline) * 100);
    return { ...base, kind: "curve", delta: `${d >= 0 ? "+" : "-"}${Math.abs(d)} pts`, tone: r >= e.baseline ? "good" : "bad", mag: Math.abs(r / e.baseline - 1) };
  }
  if (i.id === "time.shift.applied" && i.delta !== null) {
    const after = i.value / 100, before = after - i.delta;
    return before > 0 ? { ...base, kind: "shift", delta: `${pct(before)} → ${pct(after)}`, tone: i.delta >= 0 ? "good" : "bad", mag: Math.abs(after / before - 1) } : null;
  }
  if (i.id.startsWith("time.anomaly.cost_per_change.") && i.delta !== null)
    return { ...base, kind: "cost", delta: `${i.delta >= 0 ? "+" : "-"}${Math.round(Math.abs(i.delta) * 100)}%`, tone: i.delta > 0 ? "bad" : "good", mag: Math.abs(i.delta) };
  return null;
}

/** The `n` biggest movers, largest first. The biggest of each kind goes in before any second of a kind, so one noisy kind cannot fill the ribbon. */
export function topChanges(ins: Insight[], n = 3): Change[] {
  const all = ins.map(toChange).filter((c): c is Change => c !== null).sort((a, b) => b.mag - a.mag);
  const lead = all.filter((c, i) => all.findIndex((x) => x.kind === c.kind) === i);
  return [...lead, ...all.filter((c) => !lead.includes(c))].slice(0, n).sort((a, b) => b.mag - a.mag);
}
