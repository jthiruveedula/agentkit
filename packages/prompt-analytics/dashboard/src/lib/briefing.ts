// Overview selector: everything the Briefing shows, from rows only. Pure.
import type { SessionRow } from "../data/types";
import { attribute, type Attribution, type SegKey } from "./attribute";
import { costPerApplied } from "./compare";
import { addDays, weekStart } from "./filter";
import { diffRate, isReal, rateOf, struggledRate, type Rate } from "./metrics";

export const WEEKS = 12;

export interface Week { week: string; struggled: number | null; sessions: number; prompts: number; spend: number | null }
export interface Briefing {
  struggled: { now: number | null; prev: number | null; diff: number | null; ci: [number, number] | null; n: number; real: boolean };
  sessions: { now: number; prev: number | null };
  prompts: { now: number; prev: number | null };
  costPerResolved: { now: number | null; prev: number | null };
  resolved: { now: number | null; prev: number | null; k: number; n: number };
  exposed: number | null;
  weekly: Week[];
  drivers: Attribution | null;
}

const asked = (rows: SessionRow[]) => rows.filter((r) => r.prompts > 0);
const resolvedRate = (rows: SessionRow[]): Rate => { const a = asked(rows); return rateOf(a.filter((r) => r.applied).length, a.length); };
const sum = (rows: SessionRow[], f: (r: SessionRow) => number) => rows.reduce((t, r) => t + f(r), 0);

/** Last WEEKS Monday-start weeks ending at the newest row's week. Spend counts priced sessions only and is null when none are priced. */
export function weeklySeries(rows: SessionRow[]): Week[] {
  if (!rows.length) return [];
  const last = weekStart(rows.reduce((m, r) => (r.date > m ? r.date : m), ""));
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(last, (i - WEEKS + 1) * 7));
  const by = new Map(weeks.map((w) => [w, [] as SessionRow[]]));
  for (const r of rows) by.get(weekStart(r.date))?.push(r);
  return weeks.map((week) => {
    const g = by.get(week)!, priced = g.filter((r) => r.cost_usd !== null);
    return { week, struggled: struggledRate(g).p, sessions: g.length, prompts: sum(g, (r) => r.prompts), spend: priced.length ? sum(priced, (r) => r.cost_usd ?? 0) : null };
  });
}

/** `rows` = current window, `prior` = the window before (null = no comparison). `all` feeds the weekly series (default rows + prior);
 *  `exposed` = sessions with findings, supplied by the caller since rows do not carry it. */
export function briefing(rows: SessionRow[], prior: SessionRow[] | null, opt: { all?: SessionRow[]; exposed?: number; by?: SegKey } = {}): Briefing {
  const now = struggledRate(rows), prev = prior ? struggledRate(prior) : null;
  const d = prev ? diffRate(now, prev) : null;
  const cpr = (rs: SessionRow[]) => costPerApplied(rs).value;
  const rv = resolvedRate(rows);
  return {
    struggled: { now: now.p, prev: prev?.p ?? null, diff: d?.diff ?? null, ci: d ? [d.lo, d.hi] : null, n: now.n, real: prev ? isReal(now, prev) : false },
    sessions: { now: rows.length, prev: prior ? prior.length : null },
    prompts: { now: sum(rows, (r) => r.prompts), prev: prior ? sum(prior, (r) => r.prompts) : null },
    costPerResolved: { now: cpr(rows), prev: prior ? cpr(prior) : null },
    resolved: { now: rv.p, prev: prior ? resolvedRate(prior).p : null, k: rv.k, n: rv.n },
    exposed: opt.exposed ?? null,
    weekly: weeklySeries(opt.all ?? (prior ? [...prior, ...rows] : rows)),
    drivers: prior ? attribute(rows, prior, opt.by ?? "project+intent") : null,
  };
}
