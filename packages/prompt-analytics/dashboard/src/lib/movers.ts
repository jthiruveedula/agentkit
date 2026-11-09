// "Also moved": the biggest significant changes vs the prior window beyond the struggled rate. Pure.
import type { SessionRow } from "../data/types";
import { costPerApplied, MIN_PRIOR_N, tokensPerApplied } from "./compare";
import type { Filter } from "./filter";
import { fmtPct } from "./format";
import { diffRate, isReal } from "./metrics";
import { appliedRate } from "./baseline";

export interface Mover { id: "applied" | "cpa" | "tpa" | "prompts" | "sessions"; label: string; text: string; good: boolean | null; strength: number; filter?: Filter }

const asked = (rows: SessionRow[]) => rows.filter((r) => r.prompts > 0);
/** Relative change; null when the base is not positive. */
const rel = (cur: number, prev: number) => (prev > 0 ? cur / prev - 1 : null);
const sgn = (x: number) => (x > 0 ? "+" : "-");

export function movers(cur: SessionRow[], prior: SessionRow[] | null, k = 2): Mover[] {
  if (!prior?.length) return [];
  const out: Mover[] = [];
  const pctMover = (id: Mover["id"], label: string, pct: number | null, min: number, lowerBetter: boolean) => {   // lowerBetter false = neutral (good null)
    if (pct !== null && Math.abs(pct) >= min) out.push({ id, label, text: `${sgn(pct)}${fmtPct(Math.abs(pct))}`, good: lowerBetter ? pct < 0 : null, strength: Math.abs(pct) / min });
  };
  const ac = asked(cur), ap = asked(prior);
  const a = appliedRate(cur), b = appliedRate(prior), d = diffRate(a, b);   // change work only, matching the KPI tile
  if (d && isReal(a, b)) out.push({ id: "applied", label: "Applied", text: `${sgn(d.diff)}${Math.abs(d.diff * 100).toFixed(1)} pts`, good: d.diff > 0, strength: Math.abs(d.diff) / ((d.hi - d.lo) / 3.92), filter: { applied: true } });
  const c0 = costPerApplied(prior), c1 = costPerApplied(cur);
  if (c1.value !== null && c0.value !== null && c1.pricedApplied >= MIN_PRIOR_N && c0.pricedApplied >= MIN_PRIOR_N) pctMover("cpa", "Cost per applied change", rel(c1.value, c0.value), 0.15, true);
  else if (c1.value === null || c0.value === null) {   // tokens only when cost is not computable, matching the KPI tile
    const t1 = tokensPerApplied(cur), t0 = tokensPerApplied(prior);
    if (t1 !== null && t0 !== null && cur.filter((r) => r.applied).length >= MIN_PRIOR_N && prior.filter((r) => r.applied).length >= MIN_PRIOR_N) pctMover("tpa", "Tokens per applied change", rel(t1, t0), 0.15, true);
  }
  const per = (rs: SessionRow[]) => rs.reduce((t, r) => t + r.prompts, 0) / rs.length;
  if (ac.length >= MIN_PRIOR_N && ap.length >= MIN_PRIOR_N) pctMover("prompts", "Prompts per session", rel(per(ac), per(ap)), 0.2, false);
  if (prior.length >= MIN_PRIOR_N) pctMover("sessions", "Sessions", rel(cur.length, prior.length), 0.25, false);
  return out.sort((x, y) => y.strength - x.strength || x.id.localeCompare(y.id)).slice(0, k);
}
