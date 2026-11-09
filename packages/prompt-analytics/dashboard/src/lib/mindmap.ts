// Mind-map tree from the filtered session rows: root > tool > intent > project > sessions.
// Pure and client-side. Each node carries the Filter that drills to it, so the map can push it into the URL hash like any other mark.
import type { SessionRow } from "../data/types";
import { struggled, type Filter } from "./filter";
import { NO_PROJECT, projectKey, shares, type Basis } from "./share";

export type MapMetric = "sessions" | "prompts" | "cost";
export type MapKind = "root" | "tool" | "intent" | "project" | "session" | "more";
export interface MapNode {
  id: string; kind: MapKind; label: string; value: number; sessions: number; friction: number; applied: number;
  /** Struggled share of the sessions with a prompt (lib/filter `struggled`); 0 when none had a prompt. */
  struggled: number;
  /** Sessions with a prompt: the denominator of `struggled` (the struggle edge needs enough of them, lib/sunburst `edgeOf`). */
  rated: number;
  /** Sessions with a known cost; 0 = the node's cost is unknown, not $0. */
  priced: number;
  filter: Filter; src?: string; session?: string;
  /** Rows hidden behind a "+N more" node. */
  more?: number; children: MapNode[];
}
export const CAP = 6;
/** Sessions shown under a project before "+N more": a project is a summary first, a list second. */
export const SESSION_CAP = 4;
export const ROOT_ID = "root";
const metricOf = (m: MapMetric) => (r: SessionRow) => (m === "sessions" ? 1 : m === "prompts" ? r.prompts : r.cost_usd ?? 0);
/** Id segment for a grouping key: an empty key gets "(none)" (hotspot ids use the same rule, so they match the tree). */
const seg = (k: string) => k || "(none)";
const LEVELS: { kind: MapKind; key: (r: SessionRow) => string; field: "source" | "intent" | "project" }[] = [
  { kind: "tool", key: (r) => r.source, field: "source" },
  { kind: "intent", key: (r) => r.intent, field: "intent" },
  { kind: "project", key: (r) => r.project, field: "project" },
];

/** `open` holds parent ids whose "+N more" is lifted (all children shown). */
export function buildTree(rows: SessionRow[], metric: MapMetric = "sessions", open: ReadonlySet<string> = new Set(), cap = CAP): MapNode {
  const val = metricOf(metric);
  const agg = (rs: SessionRow[]) => {
    const asked = rs.filter((r) => r.prompts > 0);
    return {
      value: rs.reduce((a, r) => a + val(r), 0), sessions: rs.length,
      friction: rs.length ? rs.reduce((a, r) => a + r.friction, 0) / rs.length : 0, applied: rs.length ? rs.filter((r) => r.applied).length / rs.length : 0,
      struggled: asked.length ? asked.filter(struggled).length / asked.length : 0, rated: asked.length, priced: rs.filter((r) => r.cost_usd !== null).length,
    };
  };
  const capped = (id: string, kids: MapNode[], filter: Filter, cap: number): MapNode[] => {
    if (kids.length <= cap + 1 || open.has(id)) return kids;   // a lone "+1 more" would hide nothing worth a node
    const rest = kids.slice(cap), rs = rest.reduce((a, k) => a + k.sessions, 0);
    return [...kids.slice(0, cap), { id: `${id}/+`, kind: "more", label: `+${rest.length} more`, value: rest.reduce((a, k) => a + k.value, 0), sessions: rs, friction: 0, applied: 0, struggled: 0, rated: 0, priced: rest.reduce((a, k) => a + k.priced, 0), filter, more: rest.length, children: [] }];
  };
  const build = (rs: SessionRow[], depth: number, id: string, filter: Filter): MapNode[] => {
    let kids: MapNode[];
    if (depth < LEVELS.length) {
      const L = LEVELS[depth], by = new Map<string, SessionRow[]>();
      for (const r of rs) { const k = L.key(r); by.set(k, [...(by.get(k) ?? []), r]); }
      kids = [...by].map(([k, g]) => {
        const nid = `${id}/${seg(k)}`, f: Filter = k ? { ...filter, [L.field]: k } : filter;   // an empty project cannot be filtered: it keeps the parent's filter
        return { id: nid, kind: L.kind, label: k || (L.kind === "project" ? "(no project)" : "(none)"), ...agg(g), filter: f, src: L.kind === "tool" ? k : g[0]?.source, children: build(g, depth + 1, nid, f) };
      });
    } else {
      kids = rs.map((r) => ({ id: `${id}/${r.id}`, kind: "session" as const, label: r.title || r.id, ...agg([r]), filter, src: r.source, session: r.id, children: [] }));
    }
    kids.sort((a, b) => b.value - a.value || b.sessions - a.sessions || a.label.localeCompare(b.label));
    return capped(id, kids, filter, depth >= LEVELS.length ? Math.min(cap, SESSION_CAP) : cap);
  };
  return { id: ROOT_ID, kind: "root", label: "Your AI work", ...agg(rows), filter: {}, children: build(rows, 0, ROOT_ID, {}) };
}

/** Nodes shown for an expansion set, depth first. A node's children show only when its id is in `open`. */
export function visible(root: MapNode, open: ReadonlySet<string>): { node: MapNode; depth: number; parent: string | null }[] {
  const out: { node: MapNode; depth: number; parent: string | null }[] = [];
  const walk = (n: MapNode, depth: number, parent: string | null) => { out.push({ node: n, depth, parent }); if (open.has(n.id)) n.children.forEach((c) => walk(c, depth + 1, n.id)); };
  walk(root, 0, null);
  return out;
}

export interface Hotspot {
  id: string; rank: number; label: string; project: string; src: string; intent: string; cost: number; friction: number; score: number;
  /** value and share on `basis`, from the shared selector (lib/share.ts) */ value: number; share: number; basis: Basis;
  /** the part of `value` inside the branch `id` (the map outlines that one branch, so it says "here of value") */ here: number;
}
/** The `k` projects with the highest priced cost x mean friction (unpriced sessions add no cost). Cost, friction and share come from the same
 *  selector as the Overview "Where it went" card, so a project reads the same everywhere; `value` and `share` follow the map's size metric.
 *  `id` is the project's biggest tool > intent branch ON `basis` (ids match buildTree's), so the map can reveal and fly to it behind a "+N more". */
export function hotspots(rows: SessionRow[], k = 3, basis: Basis = "cost"): Hotspot[] {
  const cost = shares(rows, projectKey, "cost"), on = new Map(shares(rows, projectKey, basis).rows.map((r) => [r.key, r]));
  const val = (r: SessionRow) => (basis === "cost" ? r.cost_usd ?? 0 : basis === "tokens" ? r.tokens : basis === "prompts" ? r.prompts : 1);
  type Branch = { id: string; src: string; intent: string; v: number; n: number };
  const branch = new Map<string, Branch>();
  for (const r of rows) {
    const p = projectKey(r), id = `${ROOT_ID}/${seg(r.source)}/${seg(r.intent)}/${seg(r.project)}`, key = `${p}\u0000${id}`;
    const g = branch.get(key) ?? { id, src: r.source, intent: r.intent, v: 0, n: 0 };
    g.v += val(r); g.n++; branch.set(key, g);
  }
  const best = new Map<string, Branch>();
  for (const [key, g] of [...branch].sort((a, b) => a[0].localeCompare(b[0]))) {
    const p = key.split("\u0000")[0], c = best.get(p);
    if (!c || g.v > c.v || (g.v === c.v && g.n > c.n)) best.set(p, g);
  }
  return cost.rows.flatMap((c) => {
    const b = best.get(c.key), o = on.get(c.key), fr = c.friction ?? 0;
    return b && o && c.value * fr > 0 ? [{ id: b.id, label: c.key, project: c.key === NO_PROJECT ? "" : c.key, src: b.src, intent: b.intent, cost: c.value, friction: fr, score: c.value * fr, rank: 0, value: o.value, share: o.share, basis, here: b.v }] : [];
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k).map((h, i) => ({ ...h, rank: i + 1 }));
}
