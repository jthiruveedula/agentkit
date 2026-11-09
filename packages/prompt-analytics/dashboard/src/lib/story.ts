// Briefing story strip: why the struggled number matters (its cost) and what to do next. Pure.
import type { SessionRow } from "../data/types";
import { fmtPct } from "./format";
const share = (a: number, b: number) => (b > 0 ? a / b : 0);
import { struggled } from "./metrics";

export interface Story { why: string | null; next: { text: string; kind: "rec" | "attention" } | null }

const sum = (rows: SessionRow[], f: (r: SessionRow) => number) => rows.reduce((t, r) => t + f(r), 0);

/** `why` only when struggled sessions take more than their share of priced spend (tokens when nothing is priced), else null;
 *  `next` prefers a recommendation over an attention item. */
export function story(rows: SessionRow[], opt: { rec?: string; attention?: string }): Story {
  const priced = rows.filter((r) => r.cost_usd !== null), pool = priced.length ? priced : rows;
  const val = (r: SessionRow) => (priced.length ? r.cost_usd ?? 0 : r.tokens);
  const st = pool.filter(struggled), k = st.length;
  let why: string | null = null;
  if (k) {
    const ss = fmtPct(k / pool.length), vs = share(sum(st, val), sum(pool, val));
    if (vs > k / pool.length && fmtPct(vs) !== ss)
      why = `${k} struggled session${k === 1 ? " is" : "s are"} ${ss} of ${priced.length ? "priced sessions" : "sessions"} but ${fmtPct(vs)} of ${priced.length ? "priced spend" : "all tokens"}.`;
  }
  const next = opt.rec ? { text: opt.rec, kind: "rec" as const } : opt.attention ? { text: opt.attention, kind: "attention" as const } : null;
  return { why, next };
}
