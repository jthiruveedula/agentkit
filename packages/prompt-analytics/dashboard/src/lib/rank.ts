// Fixed narrative page order (Brief, Do next, Cost, Habits, Exposure, Detail). A section with nothing to say (score 0: no attention item,
// cited recommendation, model saving or helpful habit) collapses to a quiet one-row stub; `why` tags a section only when a Do-next row proves it here. Pure, no React.
import type { DashboardData, SessionRow } from "../data/types";
import type { Item } from "./attention";
import type { Row } from "./next";
import { estSaving } from "./models";

export interface Ranked { order: string[]; why: Record<string, { n: number; text: string }>; score: Record<string, number>; quiet: Set<string> }

const ORDER = ["s-overview", "s-time", "s-models", "s-friction", "s-works", "s-exposure", "s-funnel", "s-tools", "s-sessions", "s-map"];
const MIDDLE = ["s-time", "s-models", "s-friction", "s-works", "s-exposure", "s-funnel", "s-tools"];
/** Attention item id prefix -> section it points at. */
export const PREFIX: [string, string][] = [["exp-", "s-exposure"], ["anom-", "s-time"], ["cell-", "s-friction"], ["loops", "s-friction"], ["src-", "s-tools"], ["aband-", "s-funnel"]];
export const CHAPTER: Record<string, string> = { footprint: "s-tools", time: "s-time", funnel: "s-funnel", friction: "s-friction", works: "s-works" };

export function rankSections(secs: Set<string>, items: Item[], d: DashboardData, rows: SessionRow[], next: Row[] = []): Ranked {
  const score: Record<string, number> = Object.fromEntries(MIDDLE.map((id) => [id, 0]));
  const why: Record<string, { n: number; text: string }> = {};
  for (const it of items) {
    const sec = PREFIX.find(([p]) => it.id.startsWith(p))?.[1];
    if (!sec) continue;
    score[sec] += 10 - it.rank;
  }
  next.forEach((r, i) => {   // a tag only where a row's evidence points: the lowest row number, its action, how many more
    const sec = r.evidence?.sec;
    if (!sec) return;
    const m = next.filter((x) => x.evidence?.sec === sec).length - 1;
    why[sec] ??= { n: i + 1, text: `${r.action}${m ? ` (+${m} more)` : ""}` };
  });
  const byId = new Map(d.insights.map((i) => [i.id, i]));
  d.recommendations.forEach((r, i) => {
    const sec = CHAPTER[byId.get(r.evidence_insight)?.chapter ?? ""];
    if (!sec) return;
    score[sec] += i === 0 ? 3 : 2;
  });
  const saving = estSaving(rows), priced = rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  if (saving && priced > 0 && saving / priced >= 0.05) {
    score["s-models"] = 3 + Math.min(4, (20 * saving) / priced);
  }
  const helps = d.what_works.filter((w) => w.direction === "helps").length;
  if (helps > 0) { score["s-works"] += 1.5; }
  const mid = MIDDLE.filter((id) => secs.has(id));
  return { order: ORDER.filter((id) => secs.has(id)), why, score, quiet: new Set(mid.filter((id) => score[id] === 0)) };
}
