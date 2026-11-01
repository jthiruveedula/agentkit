// Mind map: your AI work as a drillable tree (root > tool > intent > project > sessions), built client-side from the filtered rows.
// Wide cards draw a pannable/zoomable SVG tree; narrow ones (phones) get an indented collapsible list. Both share one expand state and the
// same actions: click = expand/collapse, double-click / "Apply filter" = push the node's filter into the URL (drill), a session leaf opens the side panel.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKE, type PointerEvent as RPE } from "react";
import { useStore } from "../state";
import { buildTree, ROOT_ID, visible, type MapMetric, type MapNode } from "../lib/mindmap";
import { fmtCompact, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { intentColor, srcColor, srcLabel } from "../lib/palette";
import { fxOn, reducedNow, useSize } from "../lib/hooks";
import { Card, DataTable, Empty, Section, Segmented } from "./ui";

const COLW = 196, ROW = 36, PAD = 24, LABEL = 150, NARROW = 560;
const FMT: Record<MapMetric, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };
const clip = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const nameOf = (n: MapNode) => (n.kind === "tool" ? srcLabel(n.label) : n.label);
interface P { x: number; y: number; r: number; o: number }
const ease = (p: number) => 1 - (1 - p) ** 3;

function colorOf(n: MapNode, tool: string | undefined) {
  return n.kind === "root" ? "var(--accent)" : n.kind === "tool" ? srcColor(n.label) : n.kind === "intent" ? intentColor(n.label) : tool ? srcColor(tool) : "var(--muted)";
}

export function MindMap() {
  const { v, f, apply, openSession } = useStore();
  const [metric, setMetric] = useState<MapMetric>("sessions");
  const [lifted, setLifted] = useState<ReadonlySet<string>>(new Set());   // parents whose "+N more" was opened
  const root = useMemo(() => buildTree(v.rows, metric, lifted), [v.rows, metric, lifted]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => { const t = root.children[0], i = t?.children[0]; return new Set([ROOT_ID, t?.id, i?.id].filter(Boolean) as string[]); });
  const [cur, setCur] = useState(ROOT_ID);
  const body = useRef<HTMLDivElement>(null), vp = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(body);
  const narrow = w > 0 && w < NARROW;

  const rows = useMemo(() => visible(root, open), [root, open]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.node.id, r])), [rows]);
  const curId = byId.has(cur) ? cur : ROOT_ID;
  const sel = byId.get(curId)!;

  // ---- layout: tidy tree, leaves on consecutive rows, parents centred on their children
  const layout = useMemo(() => {
    const max: number[] = [];
    for (const { node, depth } of rows) if (node.kind !== "more") max[depth] = Math.max(max[depth] ?? 0, node.value);
    const pos = new Map<string, P>(); let leaf = 0, deep = 0;
    const walk = (n: MapNode, depth: number): number => {
      const kids = open.has(n.id) ? n.children : [];
      const y = kids.length ? (() => { const ys = kids.map((k) => walk(k, depth + 1)); return (ys[0] + ys[ys.length - 1]) / 2; })() : leaf++ * ROW;
      deep = Math.max(deep, depth);
      pos.set(n.id, { x: depth * COLW, y, r: n.kind === "root" ? 20 : n.kind === "more" ? 7 : 5 + 14 * Math.sqrt(n.value / (max[depth] || 1)), o: 1 });
      return y;
    };
    walk(root, 0);
    return { pos, bw: deep * COLW + LABEL + 30, bh: Math.max(0, leaf - 1) * ROW };
  }, [rows, root, open]);

  // ---- smooth re-layout: positions ease toward the target; new nodes grow out of their parent
  const [pos, setPos] = useState(layout.pos);
  const shown = useRef(layout.pos);
  useEffect(() => {
    const to = layout.pos, from = shown.current;
    if (!fxOn() || reducedNow()) { shown.current = to; setPos(to); return; }
    const start = new Map<string, P>();
    for (const [id, p] of to) {
      const prev = from.get(id), par = byId.get(id)?.parent, pp = par ? from.get(par) ?? to.get(par) : undefined;
      start.set(id, prev ?? { ...(pp ?? p), r: 0, o: 0 });
    }
    const t0 = performance.now(); let raf = 0;
    const tick = (now: number) => {
      const e = ease(Math.min(1, (now - t0) / 420)), m = new Map<string, P>();
      for (const [id, p] of to) { const s = start.get(id)!; m.set(id, { x: s.x + (p.x - s.x) * e, y: s.y + (p.y - s.y) * e, r: s.r + (p.r - s.r) * e, o: s.o + (p.o - s.o) * e }); }
      shown.current = m; setPos(m);
      if (e < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layout]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ---- pan / zoom
  const [view, setView] = useState({ x: PAD, y: PAD, k: 1 });
  const touched = useRef(false), dragged = useRef(false), drag = useRef<{ x: number; y: number; vx: number; vy: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fit = () => {
    const k = Math.min(1.15, Math.max(0.55, Math.min((w - 2 * PAD) / layout.bw, (h - 2 * PAD) / (layout.bh + 40))));
    setView({ k, x: PAD, y: layout.bh * k + 2 * PAD < h ? (h - layout.bh * k) / 2 : PAD + 10 });
  };
  useEffect(() => { if (!touched.current && w > 0 && h > 0 && !narrow) fit(); }, [layout.bw, layout.bh, w, h, narrow]);  // eslint-disable-line react-hooks/exhaustive-deps
  const zoom = (f2: number, cx = w / 2, cy = h / 2) => { touched.current = true; setView((s) => { const k = Math.min(2.5, Math.max(0.35, s.k * f2)); return { k, x: cx - (cx - s.x) * (k / s.k), y: cy - (cy - s.y) * (k / s.k) }; }); };
  useEffect(() => {   // ctrl/cmd + wheel (and trackpad pinch) zooms about the pointer; a plain wheel still scrolls the page
    const el = vp.current; if (!el || narrow) return;
    const on = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const r = el.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  });  // eslint-disable-line react-hooks/exhaustive-deps
  const down = (e: RPE) => { if (e.button !== 0) return; dragged.current = false; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId }; };
  const move = (e: RPE) => {
    const d = drag.current; if (!d) return;
    if (!dragged.current && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    if (!dragged.current) { dragged.current = true; touched.current = true; setDragging(true); vp.current?.setPointerCapture(d.id); }
    setView((s) => ({ ...s, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const up = () => { drag.current = null; setDragging(false); };

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
  const canApply = (n: MapNode) => n.kind !== "root" && n.kind !== "session" && n.kind !== "more" && Object.keys(n.filter).length > 0;
  const applyNode = (n: MapNode) => { if (n.kind === "session" && n.session) openSession(n.session); else if (canApply(n)) apply(n.filter); };

  const key = (e: RKE) => {
    const id = (e.target as Element).closest?.<HTMLElement>("[data-id]")?.dataset.id; const r = id ? byId.get(id) : undefined;
    if (!r || !id) return;
    const n = r.node, same = rows.filter((x) => x.depth === r.depth);
    const go = (to: string | null | undefined) => { if (to) { e.preventDefault(); setCur(to); focusId(to); } };
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
  const toolOf = (n: MapNode) => (n.kind === "tool" ? n.label : n.src);
  const path = (() => { const out: MapNode[] = []; for (let id: string | null = curId; id; id = byId.get(id)?.parent ?? null) out.unshift(byId.get(id)!.node); return out; })();
  const total = root.value || 1;
  const sub = (n: MapNode) => `${metric === "sessions" ? "" : `${fmtInt(n.sessions)} sessions`}${n.kind === "more" ? "" : `${metric === "sessions" ? "" : ", "}friction ${n.friction.toFixed(2)}, applied ${fmtPct(n.applied)}`}`;
  const aria = (n: MapNode) => `${nameOf(n)}: ${FMT[metric](n.value)} ${metric}, ${sub(n)}. ${n.kind === "session" ? "Open session" : n.kind === "more" ? "Show them" : n.children.length ? "Expand or collapse" : ""}`;

  if (v.rows.length === 0) return <Section id="s-map" title="Map" q="How does your AI work branch?"><Card title="Mind map" span={12}><Empty /></Card></Section>;

  return (
    <Section id="s-map" title="Map" q="How does your AI work branch?">
      <Card title="Mind map" meta="tool, intent, project, session. Size follows the metric, ring is friction" span={12}
        actions={<Segmented label="Size nodes by" value={metric} onChange={setMetric} options={[{ id: "sessions", text: "Sessions" }, { id: "prompts", text: "Prompts" }, { id: "cost", text: "Cost" }]} />}>
        <div className="mm-bar">
          <nav className="mm-path" aria-label="Expanded path">
            {path.map((n, i) => <span key={n.id} className="crumb-w">{i > 0 && <span aria-hidden="true">/</span>}<button type="button" className="crumb" aria-current={i === path.length - 1 || undefined} onClick={() => { setCur(n.id); focusId(n.id); }}>{nameOf(n)}</button></span>)}
          </nav>
          <span className="grow" />
          <span className="mm-acts">
            {sel.node.children.length > 0 && <button type="button" className="btn" aria-expanded={open.has(curId)} onClick={() => toggle(curId)}>{open.has(curId) ? "Collapse" : "Expand"}</button>}
            {sel.node.kind === "session" && sel.node.session ? <button type="button" className="btn" onClick={() => applyNode(sel.node)}>Open session</button> : <button type="button" className="btn" disabled={!canApply(sel.node)} onClick={() => applyNode(sel.node)}>Apply filter</button>}
            {!narrow && <span className="seg" role="group" aria-label="Zoom"><button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>−</button><button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button><button type="button" onClick={() => { touched.current = false; fit(); }}>Reset</button></span>}
          </span>
        </div>
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
                      <span className="mm-name">{nameOf(n)}</span>
                      <span className="mm-val">{FMT[metric](n.value)}</span>
                      <span className="mm-share" aria-hidden="true"><i /></span>
                    </button>
                    {canApply(n) && <button type="button" className="chip mm-go" aria-label={`Apply filter: ${nameOf(n)}`} onClick={() => applyNode(n)}>Filter</button>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mm-vp" ref={vp} data-drag={dragging || undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; } }}>
              <svg width={w} height={h} role="group" aria-label="Mind map. Arrow keys move, Enter expands, Space applies the filter" onKeyDown={key}>
                <g className="mm-v" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
                  {rows.map(({ node: n, parent }) => {
                    const a = parent ? pos.get(parent) : null, b = pos.get(n.id);
                    if (!a || !b) return null;
                    const mx = (a.x + b.x) / 2, share = n.value / Math.max(1e-9, byId.get(parent!)!.node.value);
                    return <path key={`l${n.id}`} className="mm-link" d={`M${a.x},${a.y}C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`} stroke={colorOf(n, toolOf(n))} strokeWidth={Math.max(1.5, 14 * share)} opacity={b.o * (related(n.id) ? 1 : 0.25)} />;
                  })}
                  {rows.map(({ node: n, depth }, i) => {
                    const p = pos.get(n.id); if (!p) return null;
                    const c = colorOf(n, toolOf(n)), on = open.has(n.id), isCur = n.id === curId;
                    return (
                      <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={p.o * (related(n.id) ? 1 : 0.3)}>
                        <g className="mm-n" data-id={n.id} data-kind={n.kind} data-cur={isCur || undefined} data-on={onIds.includes(n.id) || undefined} role="button" tabIndex={isCur ? 0 : -1} aria-label={aria(n)}
                          aria-expanded={n.children.length ? on : undefined} style={{ "--i": Math.min(i, 14) } as CSSProperties}
                          onClick={() => activate(n)} onDoubleClick={() => applyNode(n)} onFocus={() => setCur(n.id)}>
                          <title>{`${nameOf(n)}: ${FMT[metric](n.value)}. ${sub(n)}`}</title>
                          <circle className="mm-hit" r={Math.max(p.r, 7) + 8} />
                          {n.kind !== "more" && n.kind !== "root" && n.sessions > 0 && <>
                            <circle className="mm-track" r={p.r + 3.5} /><circle className="mm-ring" r={p.r + 3.5} pathLength={1} strokeDasharray={`${Math.min(1, n.friction)} 1`} />
                          </>}
                          <circle className="mm-dot" r={Math.max(p.r, 0.1)} fill={n.kind === "session" ? "var(--surface)" : n.kind === "more" ? "none" : c} fillOpacity={n.kind === "project" ? 0.6 : 1} stroke={n.kind === "session" || n.kind === "more" ? c : "var(--surface)"} />
                          {n.children.length > 0 && <text className="mm-pm" textAnchor="middle" y={4} fill={n.kind === "root" ? "var(--accent-ink)" : "var(--surface)"}>{on ? "−" : "+"}</text>}
                          <text className="mm-t" x={p.r + 9} y={-1}>{clip(nameOf(n))}</text>
                          <text className="mm-s" x={p.r + 9} y={11}>{n.kind === "more" ? "show all" : `${FMT[metric](n.value)} · ${fmtPct(n.value / total, 0)}`}</text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              </svg>
              <p className="mm-hint" aria-hidden="true">Drag to pan, ctrl/cmd + wheel to zoom. Double-click a node to filter.</p>
            </div>
          )}
        </div>
        <DataTable caption="Mind map nodes" head={["Node", "Level", "Sessions", "Friction", "Applied"]} rows={rows.map(({ node: n }) => [n.id.replace(`${ROOT_ID}/`, "").replace(ROOT_ID, "Your AI work"), n.kind, n.sessions, n.friction.toFixed(2), fmtPct(n.applied)])} />
      </Card>
    </Section>
  );
}
