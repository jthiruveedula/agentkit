// "Do next, in order": one ranked action list from attention items, recommendations and the model-fit saving. Pure, no React.
// Tiers: (1) bad attention items by rank; (2) recommendations in analyzer order (the one matching the Brief driver first), then the
// model-tier row; (3) the remaining attention items by rank. An attention item whose drill equals a recommendation's evidence is dropped.
import type { DashboardData } from "../data/types";
import { attention, type Item } from "./attention";
import { estSaving } from "./models";
import { PREFIX, CHAPTER } from "./rank";
import { fmtUSD, fmtValue } from "./format";
import type { Filter, Views } from "./filter";

export interface Row {
  id: string; action: string; detail?: string; impact: string; tone: "good" | "bad" | "warn" | "info";
  evidence?: { sec: string; exCat?: "secret" | "pii" | "phi" }; filter?: Filter; why?: string;
}
export type Driver = { project?: string; intent?: string } | null;

const eq = (a: Filter, b: Filter) => { const k = Object.keys(a) as (keyof Filter)[]; return k.length === Object.keys(b).length && k.every((x) => a[x] === b[x]); };
const fromItem = (it: Item): Row => ({
  id: it.id, action: it.act, impact: it.impact, tone: it.sev,
  evidence: (() => { const sec = PREFIX.find(([p]) => it.id.startsWith(p))?.[1]; return sec ? { sec, ...(it.action.kind === "scroll" && it.action.exCat ? { exCat: it.action.exCat } : {}) } : undefined; })(),
  filter: it.action.kind === "drill" ? it.action.filter : undefined,
});

export function nextActions(d: DashboardData, v: Views, f: Filter, ids: Set<string> | null, driver: Driver): Row[] {
  const items = attention(d, v, f, ids), byId = new Map(d.insights.map((i) => [i.id, i]));
  let recs = d.recommendations.map((r): Row => {
    const e = byId.get(r.evidence_insight), k = e?.unit === "%" ? 100 : 1, ci = e?.evidence.ci;
    const sec = e ? CHAPTER[e.chapter] : undefined, flt = e && Object.keys(e.drill.filter).length ? (e.drill.filter as Filter) : undefined;
    return { id: r.id, action: r.title, detail: r.action, impact: r.impact, tone: "good", ...(sec ? { evidence: { sec } } : {}), ...(flt ? { filter: flt } : {}),
      ...(e ? { why: `${e.claim}. ${e.metric}: ${fmtValue(e.value, e.unit)}${ci ? ` · range ${fmtValue(ci[0] * k, e.unit)} to ${fmtValue(ci[1] * k, e.unit)}` : ""} · n=${e.evidence.n} · ${e.evidence.method}` } : {}) };
  });
  const dm = (r: Row) => !!driver && !!r.filter && r.filter.project === driver.project && (!r.filter.intent || !driver.intent || r.filter.intent === driver.intent);
  const hit = recs.findIndex(dm);
  if (hit > 0) recs = [recs[hit], ...recs.slice(0, hit), ...recs.slice(hit + 1)];
  const kept = recs.filter((r) => r.filter), dup = (it: Item) => it.action.kind === "drill" && kept.some((r) => eq(r.filter!, (it.action as { filter: Filter }).filter));
  const rest = items.filter((i) => !dup(i)), bad = rest.filter((i) => i.sev === "bad"), other = rest.filter((i) => i.sev !== "bad");
  const saving = estSaving(v.rows), priced = v.rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  const model: Row[] = saving && priced > 0 && saving / priced >= 0.05
    ? [{ id: "models", action: "Move small tasks to a cheaper model tier", impact: `about ${fmtUSD(saving)} saved (estimate)`, tone: "good", evidence: { sec: "s-models" } }] : [];
  return [...bad.map(fromItem), ...recs, ...model, ...other.map(fromItem)];
}
