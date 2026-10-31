// "Needs attention now": a ranked list computed client-side from the data already loaded.
// Severity rank (lower = more urgent): open secret 1, anomaly |z|>=6 2, friction cell 3, loop outliers 4,
// open pii/phi 5, degraded source 6, abandoned-heavy tool 7. Ties go to the newest item. Max 6 rows.
import type { DashboardData, Source } from "../data/types";
import { MAX_LOOPS, capZ, type Filter, type Views } from "./filter";
import { crossTally } from "./compare";
import { fmtDate, fmtUSD, fmtInt } from "./format";
import { srcLabel } from "./palette";

export const TH = { z: 3, zHigh: 6, cell: 30, loops: 1, abandoned: 0.2 };
export const THRESHOLDS = `|z| >= ${TH.z}, tool x intent cell with n >= ${TH.cell}, ${MAX_LOOPS}+ rephrase loops, abandoned >= ${TH.abandoned * 100}%`;

export type Action =
  | { kind: "drill"; filter: Filter; list?: boolean }
  | { kind: "scroll"; id: string; exCat?: "secret" | "pii" | "phi" };
export interface Item { id: string; rank: number; sev: "bad" | "warn" | "info"; headline: string; num: string; date: string; action: Action }

export function attention(d: DashboardData, v: Views, f: Filter, ids: Set<string> | null): Item[] {
  const out: Item[] = [];
  // 1/5 open exposure, grouped by category (counts narrow with the filter via session ids)
  const open = d.exposure.items.filter((i) => i.status === "open" && (!ids || (i.session !== undefined && ids.has(i.session))));
  for (const cat of ["secret", "pii", "phi"] as const) {
    const xs = open.filter((i) => i.category === cat);
    if (!xs.length) continue;
    const sess = new Set(xs.map((i) => i.session ?? i.id)).size;
    out.push({ id: `exp-${cat}`, rank: cat === "secret" ? 1 : 5, sev: cat === "secret" ? "bad" : "warn", date: xs.map((i) => i.date).sort().at(-1) ?? "",
      headline: `${xs.length} open ${cat === "secret" ? "secrets" : cat.toUpperCase()} in ${sess} sessions`, num: String(xs.length), action: { kind: "scroll", id: "s-exposure", exCat: cat } });
  }
  // 2 anomalies inside the window, highest |z| then newest
  const an = d.anomalies.filter((a) => Math.abs(a.z) >= TH.z && (!f.from || a.date >= f.from) && (!f.to || a.date <= f.to))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || b.date.localeCompare(a.date))[0];
  if (an) out.push({ id: `anom-${an.date}`, rank: Math.abs(an.z) >= TH.zHigh ? 2 : 4.5, sev: Math.abs(an.z) >= TH.zHigh ? "bad" : "warn", date: an.date,
    headline: `${an.metric === "cost" ? "Cost" : "Prompt"} spike ${fmtDate(an.date)}, ${an.metric === "cost" ? fmtUSD(an.value) : `${fmtInt(an.value)} prompts`} (z ${capZ(an.z)})`,
    num: capZ(an.z), action: { kind: "drill", filter: { from: an.date, to: an.date }, list: true } });
  // 3 highest-friction tool x intent cell
  const cell = [...crossTally(v.rows).values()].filter((c) => c.asked >= TH.cell).sort((a, b) => b.friction - a.friction || `${a.source}${a.intent}`.localeCompare(`${b.source}${b.intent}`))[0];
  if (cell) out.push({ id: `cell-${cell.source}-${cell.intent}`, rank: 3, sev: "warn", date: "",
    headline: `${srcLabel(cell.source)} on ${cell.intent}: friction ${cell.friction.toFixed(2)} (n=${cell.asked})`, num: cell.friction.toFixed(2),
    action: { kind: "drill", filter: { source: cell.source, intent: cell.intent }, list: true } });
  // 4 rephrase-loop outliers
  const lp = v.loops[MAX_LOOPS]?.sessions ?? 0;
  if (lp >= TH.loops) out.push({ id: "loops", rank: 4, sev: "warn", date: v.rows.filter((r) => r.loops >= MAX_LOOPS).map((r) => r.date).sort().at(-1) ?? "",
    headline: `${lp} sessions with ${MAX_LOOPS}+ rephrase loops`, num: String(lp), action: { kind: "drill", filter: { loops: MAX_LOOPS }, list: true } });
  // 5 degraded or missing sources
  for (const s of d.sources.filter((x) => x.status === "degraded" || x.status === "missing"))
    out.push({ id: `src-${s.source}`, rank: 6, sev: "info", date: "", headline: `${srcLabel(s.source)} data is ${s.status}`, num: s.status, action: { kind: "scroll", id: "s-tools" } });
  // 6 abandoned-heavy tool
  const ab = d.friction.rates.filter((r) => (!f.source || r.source === f.source) && r.abandoned >= TH.abandoned && r.n >= TH.cell).sort((a, b) => b.abandoned - a.abandoned)[0];
  if (ab) out.push({ id: `aband-${ab.source}`, rank: 7, sev: "info", date: "", headline: `${srcLabel(ab.source as Source)}: ${Math.round(ab.abandoned * 100)}% of prompts abandoned`, num: `${Math.round(ab.abandoned * 100)}%`,
    action: { kind: "drill", filter: { source: ab.source }, list: true } });
  return out.sort((a, b) => a.rank - b.rank || b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, 6);
}
