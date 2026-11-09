// Signal-ranked page order: Overview first, Sessions + Mind map last, the middle sorted by how much each
// section has to say (attention items, cited recommendations, model saving, helpful habits). Pure, no React.
import type { DashboardData, SessionRow } from "../data/types";
import type { Item } from "./attention";
import { estSaving } from "./models";
import { fmtPct, fmtUSD } from "./format";

export interface Ranked { order: string[]; why: Record<string, string>; score: Record<string, number>; quiet: Set<string> }

const HEAD = ["s-overview"], TAIL = ["s-sessions", "s-map"];
const MIDDLE = ["s-tools", "s-time", "s-funnel", "s-friction", "s-works", "s-models", "s-exposure", "s-recs"];
/** Attention item id prefix -> section it points at. */
const PREFIX: [string, string][] = [["exp-", "s-exposure"], ["anom-", "s-time"], ["cell-", "s-friction"], ["loops", "s-friction"], ["src-", "s-tools"], ["aband-", "s-funnel"]];
const CHAPTER: Record<string, string> = { footprint: "s-tools", time: "s-time", funnel: "s-funnel", friction: "s-friction", works: "s-works" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function rankSections(secs: Set<string>, items: Item[], d: DashboardData, rows: SessionRow[]): Ranked {
  const score: Record<string, number> = Object.fromEntries(MIDDLE.map((id) => [id, 0]));
  const why: Record<string, string> = {};
  const hits: Record<string, Item[]> = {};
  for (const it of items) {
    const sec = PREFIX.find(([p]) => it.id.startsWith(p))?.[1];
    if (!sec) continue;
    score[sec] += 10 - it.rank;
    (hits[sec] ??= []).push(it);
  }
  for (const [sec, xs] of Object.entries(hits)) {
    const top = [...xs].sort((a, b) => a.rank - b.rank)[0];
    why[sec] = `${top.headline}${xs.length > 1 ? ` (+${xs.length - 1} more)` : ""}`;
  }
  const byId = new Map(d.insights.map((i) => [i.id, i]));
  d.recommendations.forEach((r, i) => {
    const sec = CHAPTER[byId.get(r.evidence_insight)?.chapter ?? ""];
    if (!sec) return;
    score[sec] += i === 0 ? 3 : 2;
    why[sec] ??= `Cited by: ${r.title}`;
  });
  const n = d.recommendations.length;
  if (n) { score["s-recs"] = 4; why["s-recs"] = `${plural(n, "recommendation")} to act on`; }
  const saving = estSaving(rows), priced = rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  if (saving && priced > 0 && saving / priced >= 0.05) {
    score["s-models"] = 3 + Math.min(4, (20 * saving) / priced);
    why["s-models"] = `Est. saving >= ${fmtUSD(saving)} (${fmtPct(saving / priced)} of spend) from right-sizing models`;
  }
  const helps = d.what_works.filter((w) => w.direction === "helps").length;
  if (helps > 0) { score["s-works"] += 1.5; why["s-works"] ??= `${plural(helps, "habit")} that measurably help`; }   // adds to any recommendation citing works
  const mid = MIDDLE.filter((id) => secs.has(id)).sort((a, b) => score[b] - score[a]);   // Array.sort is stable: ties keep MIDDLE order
  return {
    order: [...HEAD.filter((id) => secs.has(id)), ...mid, ...TAIL.filter((id) => secs.has(id))],
    why, score, quiet: new Set(mid.filter((id) => score[id] === 0)),
  };
}
