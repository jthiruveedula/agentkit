// Copy as Markdown: a deterministic text summary of the current view.
// Built ONLY from aggregates (totals, tallies, insights, recommendations). It never reads session titles,
// exposure previews, cluster exemplars or any per-row text, so nothing sensitive can reach the clipboard.
import type { DashboardData, Insight, SessionRow } from "../data/types";
import { BASIS_NOTE, frictionOutlier, NO_PROJECT, projectKey, shares, type Basis, type ShareRow } from "./share";
import { chips, type Filter, type Views } from "./filter";
import { delta, wilson, type Cmp, type Prior, type Win } from "./compare";
import { unpricedNote, type Caps } from "./capabilities";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtRange, fmtUSD, fmtValue } from "./format";
import { srcLabel } from "./palette";
import { pctChange, pts } from "./stats";
import { appliedRate } from "./baseline";
import { PRICING_SHARE_TOL } from "./thresholds";

export interface SummaryView { f: Filter; v: Views; win: Win; caps: Caps; prior: Prior | null; cmp: Cmp; /** the Brief's split label, when it compares last 4 weeks vs the rest */ basis?: string }

const CHAPTERS = ["footprint", "time", "funnel", "friction", "works", "recommend"];
export const chg = (cur: number, pr: number, pn: number) => { const x = delta(cur, pr, pn); if (!x) return ""; if (x.kind === "new") return "new vs prior"; const c = pctChange(x.pct); return c ? `${c} vs prior` : "flat vs prior"; };
const ev = (i: Insight) => `n=${fmtInt(i.evidence.n)}${i.evidence.ci ? `, CI ${fmtValue(i.evidence.ci[0], i.unit)} to ${fmtValue(i.evidence.ci[1], i.unit)}` : ""}`;

/** Share of sessions that carry a price. */
const pricedShare = (u: number, n: number) => (n ? (n - u) / n : 0);
/** A cost delta only means something when about the same share of sessions is priced in both periods (PRICING_SHARE_TOL). */
export const pricingComparable = (t: Views["totals"], p: Views["totals"] | undefined) => !p || Math.abs(pricedShare(t.unpriced, t.sessions) - pricedShare(p.unpriced, p.sessions)) <= PRICING_SHARE_TOL;

/** Cost change vs prior, and a note. A cost delta only means something when the same share of sessions is priced in both periods; otherwise print both shares. Shared with Weekly Wrapped. */
export function costParts(t: Views["totals"], p: Views["totals"] | undefined, pn: number): { dl: string; note: string } {
  const cs = pricedShare(t.unpriced, t.sessions), ps = p ? pricedShare(p.unpriced, p.sessions) : cs, comparable = pricingComparable(t, p);
  const dl = p && p.cost !== null && t.cost !== null && comparable ? chg(t.cost, p.cost, pn) : "";
  const note = p && p.cost !== null && !comparable ? ` (no change shown: ${fmtPct(cs)} of sessions priced now, ${fmtPct(ps)} before)` : t.unpriced ? ` (${fmtInt(t.unpriced)} sessions not priced)` : "";
  return { dl, note };
}
/** Tokens change vs prior ("+12% vs prior", "flat vs prior", "new vs prior" or ""). */
export const tokensChg = (t: Views["totals"], p: Views["totals"] | undefined, pn: number) => (p ? chg(t.tokens, p.tokens, pn) : "");

/** Top insights: rank first, then chapter order, then id. Cost insights are dropped when nothing in view is priced. */
export function topInsights(d: DashboardData, caps: Caps, n = 3): Insight[] {
  return d.insights.filter((i) => caps.hasCost || i.unit !== "USD")
    .sort((a, b) => a.rank - b.rank || CHAPTERS.indexOf(a.chapter) - CHAPTERS.indexOf(b.chapter) || a.id.localeCompare(b.id)).slice(0, n);
}

export interface WhereRow extends ShareRow { label: string; filterable: boolean; vsMedian: number | null }
export interface WhereDim {
  id: "projects" | "tools" | "intents"; name: string; byCost: boolean; basis: Basis; total: number; note: string;
  rows: WhereRow[]; /** the rows below the top n, folded into one "Other" line */ other: { n: number; share: number; value: number } | null;
  unpriced: { n: number; of: number } | null; median: number | null; outlier: WhereRow | null;
}
/** Projects, tools and intents ranked by share of priced cost (tokens when nothing in view is priced), top `n` each, with mean friction.
 *  Every share is value / total over ALL sessions in view (lib/share.ts), so the rows plus "Other" add to 100%.
 *  The tools dimension is absent for a single tool. Shared by the Markdown summary (top 3) and the Overview card (top 5). */
export function whereDims(v: Views, caps: Caps, n: number): WhereDim[] {
  const basis: Basis = caps.hasCost ? "cost" : "tokens", byCost = caps.hasCost;
  const dims: [WhereDim["id"], string, (r: SessionRow) => string][] = [["projects", "Projects", projectKey], ["tools", "Tools", (r) => r.source], ["intents", "Intents", (r) => r.intent]];
  return dims.flatMap(([id, name, key]) => {
    if (id === "tools" && !caps.multiTool) return [];
    const s = shares(v.rows, key, basis);
    if (!s.rows.length || s.total <= 0) return [];
    const { median, outlier } = frictionOutlier(s.rows);
    const row = (r: ShareRow): WhereRow => ({ ...r, label: id === "tools" ? srcLabel(r.key) : r.key, filterable: !(id === "projects" && r.key === NO_PROJECT), vsMedian: r.friction === null || median === null ? null : r.friction - median });
    const rest = s.rows.slice(n);
    return [{ id, name, byCost, basis, total: s.total, note: BASIS_NOTE[basis], rows: s.rows.slice(0, n).map(row), other: rest.length ? { n: rest.length, share: rest.reduce((a, r) => a + r.share, 0), value: rest.reduce((a, r) => a + r.value, 0) } : null,
      unpriced: byCost && s.unpriced > 0 ? { n: s.unpriced, of: s.sessions } : null, median, outlier: outlier ? row(outlier) : null }];
  });
}

/** "## Where it went": top 3 projects, tools and intents by cost (tokens when nothing is priced), with share and mean friction. Aggregates only. */
export function whereItWent(v: Views, caps: Caps): string[] {
  const dims = whereDims(v, caps, 3);
  if (!dims.length) return [];
  const out: string[] = [`## Where it went (${dims[0].note})`, ""];
  for (const dm of dims) {
    out.push(`**${dm.name}**`, "");
    dm.rows.forEach((r) => out.push(`- ${r.label}: ${dm.byCost ? fmtUSD(r.value) : `${fmtCompact(r.value)} tokens`}, ${fmtPct(r.share)}, mean friction ${r.friction === null ? "n/a" : r.friction.toFixed(2)}`));
    out.push("");
  }
  return out;
}

export function summarize(d: DashboardData, view: SummaryView): string {
  const { f, v, win, caps, prior, cmp } = view, t = v.totals, p = prior?.v.totals, pn = p?.sessions ?? 0;
  const labels = new Map(d.galaxy.clusters.map((c) => [c.id, c.label]));
  const filters = chips(f, (id) => labels.get(id) ?? `#${id}`).map((c) => c.label);
  const L: string[] = ["# Prompt Analytics summary", ""];
  L.push(`- Period: ${fmtRange(win.from, win.to) || "all data"} (${win.days} days)`);
  L.push(`- Filters: ${filters.length ? filters.join("; ") : "none"}`);
  L.push(`- Comparison: ${view.basis ? view.basis : prior ? `${cmp === "yoy" ? "year ago" : "previous period"}, ${fmtDate(prior.win.from)} – ${fmtDate(prior.win.to)} (n=${fmtInt(pn)})` : cmp === "off" ? "off" : "none (needs a date range and enough history)"}`);
  L.push(`- Data as of ${d.generated_at.slice(0, 10)}`, "");
  if (caps.empty || t.sessions === 0) return [...L, "No sessions in this view.", ""].join("\n");

  L.push("## Totals", "");
  L.push(`- Tools: ${caps.multiTool ? caps.sources.map(srcLabel).join(", ") : `${caps.names} only`}`);
  L.push(`- Sessions: ${fmtInt(t.sessions)} ${chg(t.sessions, pn, pn)}`.trim());
  L.push(`- Prompts: ${fmtInt(t.prompts)} ${p ? chg(t.prompts, p.prompts, pn) : ""}`.trim());
  L.push(`- Tokens: ${fmtCompact(t.tokens)} ${p ? chg(t.tokens, p.tokens, pn) : ""}`.trim());
  if (caps.hasCost && t.cost !== null) {
    const { dl, note } = costParts(t, p, pn);
    L.push(`- Cost: ${fmtUSD(t.cost)} ${dl}${note}`.trim());
  }
  else if (caps.allUnpriced) L.push(`- ${unpricedNote(caps) || "No prices recorded."}`);
  const ar = appliedRate(v.rows), pr = prior ? appliedRate(prior.v.rows) : null;   // change work only, matching the KPI tile
  if (ar.p !== null) {
    const [lo, hi] = wilson(ar.k, ar.n), dp = pr?.p != null && pr.n >= 30 && ar.n >= 30 ? pts(ar.p - pr.p) : null;
    L.push(`- Applied: ${fmtPct(ar.p)} of ${fmtInt(ar.n)} change sessions, explain excluded (95% CI ${fmtPct(lo)} to ${fmtPct(hi)})${dp ? `, ${dp === "±0 pts" ? "flat" : dp} vs prior` : ""}`);
  }
  if (t.asked) {
    L.push(`- Friction: ${t.friction.toFixed(2)} mean, 0 to 1 (n=${fmtInt(t.asked)})`);
  }
  L.push(`- Active days: ${fmtInt(t.activeDays)}; projects: ${fmtInt(t.projects)}`, "");

  L.push(...whereItWent(v, caps));
  // Insights and recommendations are computed on the whole export. With filters on they would describe other sessions, so they are dropped.
  const whole = filters.length === 0;
  const ins = whole ? topInsights(d, caps) : [];
  if (ins.length) {
    L.push("## Top insights (whole export)", "", "_Whole export, ignoring filters._", "");
    ins.forEach((i, k) => L.push(`${k + 1}. ${i.claim}. ${i.metric}: ${fmtValue(i.value, i.unit)} (${ev(i)})`));
    L.push("");
  }
  if (!whole) L.push("_Insights and recommendations are omitted: they cover the whole export, not this filtered view._", "");
  if (whole && d.recommendations.length) {
    const byId = new Map(d.insights.map((i) => [i.id, i]));
    L.push("## Recommendations (whole export)", "");
    d.recommendations.forEach((r, k) => { const e = byId.get(r.evidence_insight); L.push(`${k + 1}. **${r.title}**: ${r.action} Impact: ${r.impact}${e ? ` (${ev(e)})` : ""}`); });
    L.push("");
  }
  L.push("_Aggregates only: no prompts, session titles or sensitive previews are included._", "");
  return L.join("\n");
}
