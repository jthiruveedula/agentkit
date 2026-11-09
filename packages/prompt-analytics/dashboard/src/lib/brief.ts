// Overview brief: what to compare against, and how sure the struggled change is. Pure.
import type { SessionRow } from "../data/types";
import type { Cmp, Prior, Win } from "./compare";
import { addDays } from "./filter";
import { fmtDate } from "./format";
import { diffRate, isReal, type Rate } from "./metrics";
import { MIN_N } from "./thresholds";

export interface Basis { mode: "prior" | "split" | "none"; cur: SessionRow[]; base: SessionRow[] | null; label: string; cut?: string }

/** The prior window when there is one; else, for 8+ weeks with the comparison on, the last 4 weeks vs the rest; else nothing. `cut` is the split's first day. */
export function basis(rows: SessionRow[], prior: Prior | null, win: Win, cmp: Cmp): Basis {
  if (prior) return { mode: "prior", cur: rows, base: prior.v.rows, label: `vs ${fmtDate(prior.win.from)} – ${fmtDate(prior.win.to)}` };
  if (cmp !== "off" && win.days >= 56) {
    const cut = addDays(win.to, -27);
    return { mode: "split", cur: rows.filter((r) => r.date >= cut), base: rows.filter((r) => r.date < cut), label: `Last 4 weeks vs the ${Math.round((win.days - 28) / 7)} weeks before`, cut };
  }
  return { mode: "none", cur: rows, base: null, label: "" };
}

export type Kind = "none" | "clear" | "early" | "noise";
export interface Verdict { kind: Kind; dir: "up" | "down" | null; d: { diff: number; lo: number; hi: number } | null; eyebrow: string }

const EYEBROW: Record<Kind, string> = { none: "No baseline", clear: "", early: "Early sign", noise: "Within noise" };

/** Clear = real and the near end of the CI is >= 3 pts; early = real otherwise; none = no prompts now, no base, or a side under MIN_N. */
export function verdict(now: Rate, prev: Rate | null): Verdict {
  const d = prev && now.n >= MIN_N && prev.n >= MIN_N ? diffRate(now, prev) : null;
  if (!prev || !d) return { kind: "none", dir: null, d: null, eyebrow: now.p === null ? "No prompts" : prev ? "Too few to compare" : EYEBROW.none };
  const dir = d.diff > 0 ? "up" : d.diff < 0 ? "down" : null;
  const kind: Kind = !isReal(now, prev) ? "noise" : Math.min(Math.abs(d.lo), Math.abs(d.hi)) >= 0.03 ? "clear" : "early";
  return { kind, dir, d, eyebrow: kind === "clear" ? (dir === "up" ? "Clear rise" : "Clear drop") : EYEBROW[kind] };
}

/** "1 in N"; above half, "N in 10" so high rates do not all collapse to "1 in 1". */
export const oneIn = (p: number) => (p > 0.5 ? `${p < 1 ? Math.min(9, Math.round(p * 10)) : 10} in 10` : p > 0 ? `1 in ${Math.round(1 / p)}` : "none");

/** Sessions a segment drill-down returns: same project, and same intent when set. Counts prompt-less sessions too, unlike Driver.n1. */
export const segCount = (rows: SessionRow[], s: { project?: string; intent?: string }) =>
  rows.filter((r) => (s.project === undefined || r.project === s.project) && (!s.intent || r.intent === s.intent)).length;
