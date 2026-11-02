// What this data can honestly show. Pure: recomputed from the rows in view, so filtering to one
// tool behaves exactly like a user who only has that tool. Every section reads these flags.
import type { DashboardData, Source } from "../data/types";
import type { Views } from "./filter";
import { SOURCES, srcLabel } from "./palette";

import { MIN_DAYS, MIN_SESSIONS } from "./thresholds";
export { MIN_DAYS, MIN_SESSIONS };

export interface Caps {
  sources: Source[];          // tools with sessions in view, by session count
  sourceCount: number;
  multiTool: boolean;
  /** "Claude Code", "Claude Code and Cursor", "3 tools". */
  names: string;
  hasCost: boolean;           // any priced session in view
  allUnpriced: boolean;       // sessions in view, none priced
  unpriced: Source[];         // tools in view that record no price
  hasModel: boolean;          // an ML tier ran (not keyword-only basic)
  hasGalaxy: boolean;         // topic clusters + points exported
  hasWhatWorks: boolean;      // effect tests ran
  hasHourApplied: boolean;    // hour_week carries sessions/applied (schema 1.1)
  hasExposure: boolean;       // at least one finding
  hasTtr: boolean;
  hasTtrRows: boolean;        // per-session ttr_min present (1.3+)
  hasModels: boolean;         // per-session model present (1.3+)
  hasFunnel: boolean;
  days: number;               // calendar span of the rows in view, inclusive
  enoughForTrend: boolean;    // >= MIN_DAYS of span
  tooSmall: boolean;          // < MIN_DAYS or < MIN_SESSIONS
  moreDays: number;           // to unlock: days still needed (0 = enough)
  moreSessions: number;
  empty: boolean;             // no sessions at all in the export
}

const span = (dates: string[]) => {
  if (!dates.length) return 0;
  let lo = dates[0], hi = dates[0];
  for (const x of dates) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return Math.round((Date.parse(`${hi}T00:00:00Z`) - Date.parse(`${lo}T00:00:00Z`)) / 864e5) + 1;
};

export function listNames(xs: string[]): string {
  return xs.length <= 2 ? xs.join(" and ") : `${xs.length} tools`;
}

export function capabilities(d: DashboardData, v: Views): Caps {
  const legacy = v.legacy;
  const known = (s: string): s is Source => (SOURCES as string[]).includes(s);
  const sources = v.sources.filter((t) => t.sessions > 0).map((t) => t.key).filter(known);
  const n = v.totals.sessions;
  const days = legacy ? v.totals.activeDays : span(v.rows.map((r) => r.date));
  const priced = legacy ? (v.totals.cost ?? 0) > 0 : v.rows.some((r) => r.cost_usd !== null);
  const unpriced = legacy ? [] : sources.filter((s) => !v.rows.some((r) => r.source === s && r.cost_usd !== null));
  const g = d.galaxy;
  const hasModel = d.engine.mode !== "basic";
  return {
    sources, sourceCount: sources.length, multiTool: sources.length >= 2,
    names: listNames(sources.map(srcLabel)),
    hasCost: priced, allUnpriced: n > 0 && !priced, unpriced,
    hasModel,
    hasGalaxy: hasModel && g.clusters.length > 0 && g.points.x.length > 0,
    hasWhatWorks: hasModel && d.what_works_tested > 0,
    hasHourApplied: d.hour_week.some((h) => h.sessions !== undefined && h.applied !== undefined),
    hasExposure: d.exposure.sessions > 0,
    hasTtr: d.ttr.some((t) => sources.includes(t.source)),
    hasTtrRows: v.rows.some((r) => r.ttr_min != null),
    hasModels: v.rows.some((r) => !!r.model),
    hasFunnel: v.funnel[0] > 0,
    days, enoughForTrend: days >= MIN_DAYS,
    tooSmall: n > 0 && (days < MIN_DAYS || n < MIN_SESSIONS),
    moreDays: Math.max(0, MIN_DAYS - days), moreSessions: Math.max(0, MIN_SESSIONS - n),
    empty: d.sessions.length === 0 && d.totals.sessions === 0,
  };
}

/** Sections that have something to show; the nav and scroll-spy list only these. */
export function sectionsFor(c: Caps, d: DashboardData, v: Views): Set<string> {
  if (c.empty) return new Set();
  const s = new Set(["s-overview", "s-attention", "s-sessions"]);
  if (c.hasExposure) s.add("s-exposure");   // a zero-finding export gets no dead nav item
  if (d.recommendations.length) s.add("s-recs");
  if (c.tooSmall) return s;
  s.add("s-time"); s.add("s-friction"); s.add("s-works");
  if (c.hasModels) s.add("s-models");
  s.add("s-tools");           // single tool: pivots to intent x project instead of comparing tools
  if (c.hasFunnel) s.add("s-funnel");
  if (v.rows.length) s.add("s-map");
  return s;
}

/** "Not enough data yet" copy, naming what unlocks the full view. */
export function unlockText(c: Caps, filtered: boolean): string {
  const need = [c.moreDays && `${c.moreDays} more day${c.moreDays === 1 ? "" : "s"}`, c.moreSessions && `${c.moreSessions} more session${c.moreSessions === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
  return filtered ? `Not enough data in this view yet. Widen the filters (needs ${need}) to see trends and patterns.`
    : `Not enough data yet. ${need[0].toUpperCase()}${need.slice(1)} of use unlock trends, golden hours and patterns.`;
}

/** "Copilot doesn't record prices" / "Copilot and OpenCode don't record prices". */
export const unpricedNote = (c: Caps) => c.unpriced.length ? `${listNames(c.unpriced.map(srcLabel))} ${c.unpriced.length === 1 ? "doesn't" : "don't"} record prices.` : "";
