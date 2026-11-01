// Mind-map tree from the filtered session rows: root > tool > intent > project > sessions.
// Pure and client-side. Each node carries the Filter that drills to it, so the map can push it into the URL hash like any other mark.
import type { SessionRow } from "../data/types";
import type { Filter } from "./filter";

export type MapMetric = "sessions" | "prompts" | "cost";
export type MapKind = "root" | "tool" | "intent" | "project" | "session" | "more";
export interface MapNode {
  id: string; kind: MapKind; label: string; value: number; sessions: number; friction: number; applied: number;
  filter: Filter; src?: string; session?: string;
  /** Rows hidden behind a "+N more" node. */
  more?: number; children: MapNode[];
}
export const CAP = 6;
export const ROOT_ID = "root";
const metricOf = (m: MapMetric) => (r: SessionRow) => (m === "sessions" ? 1 : m === "prompts" ? r.prompts : r.cost_usd ?? 0);
const LEVELS: { kind: MapKind; key: (r: SessionRow) => string; field: "source" | "intent" | "project" }[] = [
  { kind: "tool", key: (r) => r.source, field: "source" },
  { kind: "intent", key: (r) => r.intent, field: "intent" },
  { kind: "project", key: (r) => r.project, field: "project" },
];

/** `open` holds parent ids whose "+N more" is lifted (all children shown). */
export function buildTree(rows: SessionRow[], metric: MapMetric = "sessions", open: ReadonlySet<string> = new Set(), cap = CAP): MapNode {
  const val = metricOf(metric);
  const agg = (rs: SessionRow[]) => ({
    value: rs.reduce((a, r) => a + val(r), 0), sessions: rs.length,
    friction: rs.length ? rs.reduce((a, r) => a + r.friction, 0) / rs.length : 0, applied: rs.length ? rs.filter((r) => r.applied).length / rs.length : 0,
  });
  const capped = (id: string, kids: MapNode[], filter: Filter): MapNode[] => {
    if (kids.length <= cap + 1 || open.has(id)) return kids;   // a lone "+1 more" would hide nothing worth a node
    const rest = kids.slice(cap), rs = rest.reduce((a, k) => a + k.sessions, 0);
    return [...kids.slice(0, cap), { id: `${id}/+`, kind: "more", label: `+${rest.length} more`, value: rest.reduce((a, k) => a + k.value, 0), sessions: rs, friction: 0, applied: 0, filter, more: rest.length, children: [] }];
  };
  const build = (rs: SessionRow[], depth: number, id: string, filter: Filter): MapNode[] => {
    let kids: MapNode[];
    if (depth < LEVELS.length) {
      const L = LEVELS[depth], by = new Map<string, SessionRow[]>();
      for (const r of rs) { const k = L.key(r); by.set(k, [...(by.get(k) ?? []), r]); }
      kids = [...by].map(([k, g]) => {
        const nid = `${id}/${k || "(none)"}`, f: Filter = k ? { ...filter, [L.field]: k } : filter;   // an empty project cannot be filtered: it keeps the parent's filter
        return { id: nid, kind: L.kind, label: k || "(no project)", ...agg(g), filter: f, src: L.kind === "tool" ? k : g[0]?.source, children: build(g, depth + 1, nid, f) };
      });
    } else {
      kids = rs.map((r) => ({ id: `${id}/${r.id}`, kind: "session" as const, label: r.title || r.id, ...agg([r]), filter, src: r.source, session: r.id, children: [] }));
    }
    kids.sort((a, b) => b.value - a.value || b.sessions - a.sessions || a.label.localeCompare(b.label));
    return capped(id, kids, filter);
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
