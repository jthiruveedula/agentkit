// Mind map: your AI work as a drillable tree (root > tool > intent > project > sessions), built client-side from the filtered rows.
// Wide cards draw a 3D constellation (Orbit.tsx; layout math in lib/orbit.ts): drag to rotate, zoom, click a node to fly to it.
// Narrow ones (phones) get an indented collapsible list. Both share one expand state and the same actions: click = select + expand/collapse,
// double-click / "Apply filter" = push the node's filter into the URL (drill), a session leaf opens the side panel.
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKE } from "react";
import { useStore } from "../state";
import { buildTree, hotspots, ROOT_ID, type Hotspot, visible, type MapMetric, type MapNode } from "../lib/mindmap";
import { BASIS_NOTE } from "../lib/share";
import { layoutOrbit } from "../lib/orbit";
import { fmtCompact, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { intentColor, srcColor, srcLabel } from "../lib/palette";
import { useSize } from "../lib/hooks";
import { Card, DataTable, Empty, Section, Segmented } from "./ui";
import { Orbit } from "./Orbit";

const NARROW = 560;
const FMT: Record<MapMetric, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };
const nameOf = (n: MapNode) => (n.kind === "tool" ? srcLabel(n.label) : n.label);

function colorOf(n: MapNode, tool: string | undefined) {
  return n.kind === "root" ? "var(--accent)" : n.kind === "tool" ? srcColor(n.label) : n.kind === "intent" ? intentColor(n.label) : tool ? srcColor(tool) : "var(--muted)";
}
const toolOf = (n: MapNode) => (n.kind === "tool" ? n.label : n.src);

export function MindMap() {
  const { v, f, apply, openSession, goto } = useStore();
  const [metric, setMetric] = useState<MapMetric>("sessions");
  // first view: the top-3 hotspot branches start open (and lifted out of "+N more") so every hotspot is labelled on load
  const hotAnc = () => hotspots(v.rows).flatMap((x) => { const p = x.id.split("/"); return p.slice(1, -1).map((_, i) => p.slice(0, i + 2).join("/")); });
  const [lifted, setLifted] = useState<ReadonlySet<string>>(() => new Set([ROOT_ID, ...hotAnc()]));   // parents whose "+N more" was opened
  const root = useMemo(() => buildTree(v.rows, metric, lifted), [v.rows, metric, lifted]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([ROOT_ID, ...hotAnc()]));
  const [cur, setCur] = useState(ROOT_ID);
  const body = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(body);
  const narrow = w > 0 && w < NARROW;

  const rows = useMemo(() => visible(root, open), [root, open]);
  const layout = useMemo(() => layoutOrbit(root), [root]);
  const basis = metric === "cost" ? "cost" : metric;   // chips read the same basis as the node sizes
  const hots = useMemo(() => hotspots(v.rows, 3, basis), [v.rows, basis]);
  const chipText = (x: Hotspot) => (basis === "cost" ? `${fmtUSD(x.value)} · ${fmtPct(x.share, 0)} of priced cost` : `${FMT[metric](x.value)} ${metric} · ${fmtPct(x.share, 0)} of ${metric}`);
  const hot = useMemo(() => new Map(hots.map((x) => [x.id, { rank: x.rank, text: `${chipText(x)} · friction ${x.friction.toFixed(2)}` }])), [hots]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.node.id, r])), [rows]);
  const curId = byId.has(cur) ? cur : ROOT_ID;
  const sel = byId.get(curId)!;

  // ---- actions
  const toggle = (id: string, to?: boolean) => setOpen((s) => { const n = new Set(s), on = to ?? !n.has(id); if (on) n.add(id); else n.delete(id); return n; });
  const parentOf = (id: string) => byId.get(id)?.parent ?? null;
  const focusId = (id: string) => requestAnimationFrame(() => [...(body.current?.querySelectorAll<HTMLElement>("[data-id]") ?? [])].find((e) => e.dataset.id === id)?.focus());
  const lift = (n: MapNode) => { const p = parentOf(n.id); if (p) setLifted((s) => new Set(s).add(p)); };
  const activate = (n: MapNode) => {
    setCur(n.id);
    if (n.kind === "session" && n.session) openSession(n.session);
    else if (n.kind === "more") lift(n);
    else if (n.children.length) toggle(n.id);
  };
  /** Reveal a hotspot branch: open its ancestors, lift every level in case the branch sits behind "+N more", then fly to it. */
  const showHot = (id: string) => {
    const parts = id.split("/"), anc = parts.slice(1, -1).map((_, i) => parts.slice(0, i + 2).join("/"));
    setOpen((s) => new Set([...s, ROOT_ID, ...anc])); setLifted((s) => new Set([...s, ROOT_ID, ...anc])); setCur(id);
  };
  const canApply = (n: MapNode) => n.kind !== "root" && n.kind !== "session" && n.kind !== "more" && Object.keys(n.filter).length > 0;
  const applyNode = (n: MapNode) => { if (n.kind === "session" && n.session) openSession(n.session); else if (canApply(n)) apply(n.filter); };

  const key = (e: RKE) => {   // keyboard model for the 3D canvas: the current node is the one the arrows move from
    const id = curId, r = byId.get(id); if (!r) return;
    const n = r.node, same = rows.filter((x) => x.depth === r.depth);
    const go = (to: string | null | undefined) => { if (to) { e.preventDefault(); setCur(to); } };
    if (e.key === "ArrowDown" || e.key === "ArrowUp") go(same[same.findIndex((x) => x.node.id === id) + (e.key === "ArrowDown" ? 1 : -1)]?.node.id);
    else if (e.key === "ArrowRight") { if (open.has(id) && n.children.length) go(n.children[0].id); else if (n.children.length) { e.preventDefault(); toggle(id, true); } }
    else if (e.key === "ArrowLeft") { if (open.has(id) && n.children.length) { e.preventDefault(); toggle(id, false); } else go(r.parent); }
    else if (e.key === "Home") go(ROOT_ID);
    else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); activate(n); }
    else if (e.key === " " || (e.key === "Enter" && e.shiftKey)) { e.preventDefault(); applyNode(n); }
  };

  // ---- highlight: nodes on the active filter path stay bright, unrelated ones dim
  const onIds = rows.filter(({ node: n }) => canApply(n) && (Object.keys(n.filter) as (keyof typeof n.filter)[]).every((k) => f[k] === n.filter[k])).map((r) => r.node.id);
  const related = (id: string) => onIds.length === 0 || onIds.some((o) => o === id || o.startsWith(`${id}/`) || id.startsWith(`${o}/`));
  const path = (() => { const out: MapNode[] = []; for (let id: string | null = curId; id; id = byId.get(id)?.parent ?? null) out.unshift(byId.get(id)!.node); return out; })();
  const total = root.value || 1;
  const sub = (n: MapNode) => `${metric === "sessions" ? "" : `${fmtInt(n.sessions)} sessions`}${n.kind === "more" ? "" : `${metric === "sessions" ? "" : ", "}friction ${n.friction.toFixed(2)}, applied ${fmtPct(n.applied)}`}`;
  const aria = (n: MapNode) => `${nameOf(n)}: ${FMT[metric](n.value)} ${metric}, ${sub(n)}. ${n.kind === "session" ? "Open session" : n.kind === "more" ? "Show them" : n.children.length ? "Expand or collapse" : ""}`;
  const short = (n: MapNode) => (n.kind === "more" ? "show all" : `${FMT[metric](n.value)} · ${fmtPct(n.value / total, 0)}`);
  const sameDepth = rows.filter((x) => x.depth === sel.depth);
  const announce = `${nameOf(sel.node)}, ${sel.node.kind}, ${FMT[metric](sel.node.value)} ${metric}, friction ${sel.node.friction.toFixed(2)}. ${sel.node.children.length ? (open.has(curId) ? "Expanded" : "Collapsed") : "No children"}. Level ${sel.depth + 1}, ${sameDepth.findIndex((x) => x.node.id === curId) + 1} of ${sameDepth.length}.`;

  if (v.rows.length === 0) return <Section id="s-map" title="Mind map" q="How does your AI work branch?"><Card title="Mind map" span={12}><Empty /></Card></Section>;

  return (
    <Section id="s-map" title="Mind map" q="How does your AI work branch?">
      <Card title="Constellation" meta="tool, intent, project, session" span={12}
        actions={<Segmented label="Size nodes by" value={metric} onChange={setMetric} options={[{ id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts" }, { id: "cost", text: "Cost" }]} />}>
        <div className="mm-bar">
          <nav className="mm-path" aria-label="Expanded path">
            {path.map((n, i) => <span key={n.id} className="crumb-w">{i > 0 && <span aria-hidden="true">/</span>}<button type="button" className="crumb" aria-current={i === path.length - 1 || undefined} onClick={() => { setCur(n.id); focusId(n.id); }}>{nameOf(n)}</button></span>)}
          </nav>
          <span className="grow" />
          <span className="mm-acts">
            {sel.node.children.length > 0 && <button type="button" className="btn" aria-expanded={open.has(curId)} onClick={() => toggle(curId)}>{open.has(curId) ? "Collapse" : "Expand"}</button>}
            {sel.node.kind === "session" && sel.node.session ? <button type="button" className="btn" onClick={() => applyNode(sel.node)}>Open session</button> : <><button type="button" className="btn" disabled={!canApply(sel.node)} aria-describedby={canApply(sel.node) ? undefined : "mm-why"} onClick={() => applyNode(sel.node)}>Apply filter</button>{!canApply(sel.node) && <span className="meta" id="mm-why">{sel.node.kind === "root" ? "Select a branch to filter" : sel.node.kind === "more" ? "Open the group first" : "No filter for this node"}</span>}</>}
          </span>
        </div>
        {hots.length > 0 && <p className="mm-hots"><span className="muted">Hotspots (ranked by cost × friction; {BASIS_NOTE[basis]}):</span>{hots.map((x) => <button key={x.id} type="button" className="chip" onClick={() => { showHot(x.id); if (x.project) { apply({ project: x.project }); goto("s-sessions"); } }}
          aria-label={`Hotspot ${x.rank}: ${x.label}, ${chipText(x)}, friction ${x.friction.toFixed(2)}. Filter to this project and show its sessions`}>{x.rank}. {x.label} <span className="meta">{chipText(x)} · friction {x.friction.toFixed(2)}</span></button>)}</p>}
        <div className="mm" ref={body}>
          {narrow ? (
            <ul className="mm-list" aria-label="Mind map as an indented list">
              {rows.map(({ node: n, depth }, i) => {
                const kids = n.children.length > 0, on = open.has(n.id), c = colorOf(n, toolOf(n));
                return (
                  <li key={n.id} data-dim={!related(n.id) || undefined} style={{ "--i": Math.min(i, 12), "--c": c, "--w": Math.max(0.02, n.value / total) } as CSSProperties}>
                    <button type="button" className="mm-row" data-id={n.id} data-cur={n.id === curId || undefined} aria-expanded={kids ? on : undefined} aria-label={aria(n)} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => activate(n)}>
                      <span className="mm-caret" aria-hidden="true">{kids ? (on ? "▾" : "▸") : n.kind === "more" ? "+" : "·"}</span>
                      <span className="sw" />
                      <span className="mm-name">{hot.has(n.id) && <><b className="mm-hot" aria-hidden="true">#{hot.get(n.id)?.rank}</b><span className="sr-only">Hotspot {hot.get(n.id)?.rank}, </span></>}{nameOf(n)}</span>
                      <span className="mm-val">{FMT[metric](n.value)}</span>
                      <span className="mm-share" aria-hidden="true"><i /></span>
                    </button>
                    {canApply(n) && <button type="button" className="chip mm-go" aria-label={`Apply filter: ${nameOf(n)}`} onClick={() => applyNode(n)}>Filter</button>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Orbit w={w} h={h} layout={layout} rows={rows} cur={curId} open={open} hot={hot} label="Mind map, 3D view. Arrow keys move between nodes, Enter expands, Space applies the filter, plus and minus zoom, 0 resets"
              colorOf={(n) => colorOf(n, toolOf(n))} nameOf={nameOf} sub={short} on={(id) => onIds.includes(id)} related={related}
              onPick={(n) => activate(n)} onApply={(n) => { setCur(n.id); applyNode(n); }} onKey={key} />
          )}
        </div>
        {!narrow && <ul className="legend mm-key"><li className="sizekey">Size = {metric}, relative within each level</li><li className="frkey">Ring arc = friction share (full ring = all sessions)</li><li className="hotkey">Dashed ring = hotspot</li></ul>}
        <p className="sr-only" aria-live="polite">{announce}</p>
        <DataTable caption="Mind map nodes" head={["Node", "Level", "Sessions", "Friction", "Applied"]} rows={rows.map(({ node: n }) => [n.id.replace(`${ROOT_ID}/`, "").replace(ROOT_ID, "Your AI work"), n.kind, n.sessions, n.friction.toFixed(2), fmtPct(n.applied)])} />
      </Card>
    </Section>
  );
}
