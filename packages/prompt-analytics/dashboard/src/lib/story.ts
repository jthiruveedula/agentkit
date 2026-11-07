// Briefing story strip: why the struggled number matters (its cost) and what to do next. Pure.
import type { SessionRow } from "../data/types";
import type { Briefing } from "./briefing";
import { fmtCompact, fmtPct, fmtUSD } from "./format";
const share = (a: number, b: number) => (b > 0 ? a / b : 0);
import { struggled } from "./metrics";

export interface Story { why: string | null; next: { text: string; kind: "rec" | "attention" } | null }

const sum = (rows: SessionRow[], f: (r: SessionRow) => number) => rows.reduce((t, r) => t + f(r), 0);

/** `why` prices the struggled sessions (priced cost, tokens when nothing is priced); `next` prefers a recommendation over an attention item. */
export function story(b: Briefing, rows: SessionRow[], opt: { rec?: string; attention?: string }): Story {
  const st = rows.filter(struggled), k = st.length;
  let why: string | null = null;
  if (k) {
    const lead = `${k} struggled session${k === 1 ? "" : "s"}`, priced = (r: SessionRow) => r.cost_usd !== null;
    if (rows.some(priced)) { const c = sum(st.filter(priced), (r) => r.cost_usd ?? 0); why = `${lead} cost ${fmtUSD(c)}, ${fmtPct(share(c, sum(rows.filter(priced), (r) => r.cost_usd ?? 0)))} of priced spend`; }
    else { const t = sum(st, (r) => r.tokens); why = `${lead} used ${fmtCompact(t)} tokens, ${fmtPct(share(t, sum(rows, (r) => r.tokens)))} of all tokens`; }
    const h = b.drivers?.headline;
    if (b.struggled.real && h) why += `, ${Math.abs(h.total / (b.drivers?.delta || Infinity)) >= 0.5 ? "mostly" : "partly"} ${h.key}`;
    why += ".";
  }
  const next = opt.rec ? { text: opt.rec, kind: "rec" as const } : opt.attention ? { text: opt.attention, kind: "attention" as const } : null;
  return { why, next };
}
