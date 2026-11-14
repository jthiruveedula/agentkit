// Mind map: your AI work as a drillable tree (root > tool > intent > project > sessions), built client-side from the filtered rows.
// Wide cards draw a zoomable sunburst (Sunburst.tsx; layout math in lib/sunburst.ts): arc length = share of the metric, red edge = struggled above the average,
// numbered callouts = hotspots; picking a node a level down zooms into its parent. Narrow ones (phones) get an indented collapsible list. Both share one expand state and the same actions:
// click = select + expand/collapse (in the sunburst the first click on an open node only selects it), double-click / "Apply filter" = push the node's
// filter into the URL (drill), a session leaf opens the side panel.
import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKE } from "react";
import { useStore } from "../state";
import { buildTree, hotspots, ROOT_ID, type Hotspot, visible, type MapMetric, type MapNode } from "../lib/mindmap";
import { BASIS_NOTE, projectKey } from "../lib/share";
import { EDGE_OVER, edgeOf, focusOf, partition, struggleNote } from "../lib/sunburst";
import { MIN_N, ROUTER_MIN_N } from "../lib/thresholds";
import { struggled } from "../lib/metrics";
import { fmtCompact, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { intentColor, srcColor, srcLabel } from "../lib/palette";
import { useSize } from "../lib/hooks";
import { Card, DataTable, Empty, Section, Segmented } from "./ui";
import "./govern.css";
import "./mindmap.css";
import { Sunburst } from "./Sunburst";

const NARROW = 560, WIDE = 880;   // breakpoints on the card's content width
const FMT: Record<MapMetric, (n: number) => string> = { sessions: fmtInt, prompts: fmtCompact, cost: fmtUSD };
const nameOf = (n: MapNode) => (n.kind === "tool" ? srcLabel(n.label) : n.label);
/** A share, with "<1%" for a sliver that would round to 0%. */
const pctOf = (f: number) => (f > 0 && f < 0.005 ? "<1%" : fmtPct(f, 0));
/** "1 session", "12 sessions". */
const count = (n: number, one: string) => `${fmtInt(n)} ${n === 1 ? one : `${one}s`}`;
/** Ids of a branch's ancestors below the root: root/a/b/c -> root/a, root/a/b. */
const ancestors = (id: string) => { const p = id.split("/"); return p.slice(1, -1).map((_, i) => p.slice(0, i + 2).join("/")); };

function colorOf(n: MapNode, tool: string | undefined) {
  return n.kind === "root" ? "var(--accent)" : n.kind === "tool" ? srcColor(n.label) : n.kind === "intent" ? intentColor(n.label) : tool ? srcColor(tool) : "var(--muted)";
}
const toolOf = (n: MapNode) => (n.kind === "tool" ? n.label : n.src);

export function MindMap() {
  const { v, f, apply, openSession, goto, panel } = useStore();
  const ids = useId(), keysId = `${ids}-keys`, whyId = `${ids}-why`;
  const [pickMetric, setMetric] = useState<MapMetric>("sessions");
  const hasCost = useMemo(() => v.rows.some((r) => (r.cost_usd ?? 0) > 0), [v.rows]);
  const metric: MapMetric = pickMetric === "cost" && !hasCost ? "sessions" : pickMetric;   // nothing priced: no Cost option, the map reads sessions
  const body = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(body), { w: W } = useSize(wrap);
  const narrow = W > 0 && W < NARROW, mode = narrow ? "narrow" : W >= WIDE ? "wide" : "mid";
  // px of the map under the open side panel (fixed, over the page from 700px up; a bottom sheet below that covers it all, which the
  // sunburst ignores). offsetLeft is the layout box, so the panel's open animation (a transform) never skews it. Re-read when the card or window resizes.
  const [cover, setCover] = useState(0);
  useLayoutEffect(() => {
    const read = () => {
      const el = panel === "none" ? null : document.getElementById("panel"), b = body.current;
      setCover(el && b ? Math.max(0, Math.round(b.getBoundingClientRect().right - el.offsetLeft)) : 0);
    };
    read();
    addEventListener("resize", read);
    return () => removeEventListener("resize", read);
  }, [panel, w, h]);

  // hotspots follow the data, the filter and the metric (one project in view has nothing to rank). Their branches are always lifted out of
  // "+N more", and open on the first view, so every hotspot is labelled before anything is clicked.
  const projects = useMemo(() => new Set(v.rows.map(projectKey)).size, [v.rows]);
  const hots = useMemo(() => (projects > 1 ? hotspots(v.rows, 3, metric) : []), [v.rows, metric, projects]);
  const hotAnc = useMemo(() => hots.flatMap((x) => ancestors(x.id)), [hots]);
  const [lifted, setLifted] = useState<ReadonlySet<string>>(() => new Set([ROOT_ID]));   // parents whose "+N more" was opened
  const liftedAll = useMemo(() => new Set([...lifted, ...hotAnc]), [lifted, hotAnc]);
  const root = useMemo(() => buildTree(v.rows, metric, liftedAll), [v.rows, metric, liftedAll]);
  // expand state: until the first expand / collapse it follows the data. Wide: every tool open (where the work goes, tools then intents);
  // narrow: only the root and the hotspot paths, so the list stays a short summary.
  const [opened, setOpened] = useState<ReadonlySet<string> | null>(null);
  const open = useMemo(() => opened ?? new Set([ROOT_ID, ...(narrow ? [] : root.children.map((c) => c.id)), ...hotAnc]), [opened, narrow, root, hotAnc]);
  const setOpen = (fn: (s: ReadonlySet<string>) => Set<string>) => setOpened((s) => fn(s ?? open));
  const [cur, setCur] = useState(ROOT_ID);
  const [inTree, setInTree] = useState(false);
  const [hov, setHov] = useState<string | null>(null), [hotHov, setHotHov] = useState<string | null>(null);   // inspector previews: the pointer's arc, a hotspot row under pointer or focus

  const rows = useMemo(() => visible(root, open), [root, open]);
  const parts = useMemo(() => partition(root), [root]);
  const shown = useMemo(() => new Set(rows.map((r) => r.node.id)), [rows]);
  // the chip shows the share and friction (the lede names the share's basis, the callout the count); its name keeps all of chipText
  const chipShort = (x: Hotspot) => `${fmtPct(x.share, 0)} · friction ${x.friction.toFixed(2)}`;
  const chipText = (x: Hotspot) => (metric === "cost" ? `${fmtUSD(x.value)} · ${fmtPct(x.share, 0)} of priced cost` : `${FMT[metric](x.value)} ${metric} · ${fmtPct(x.share, 0)} of ${metric}`);
  const hot = useMemo(() => new Map(hots.map((x) => {
    const n = (y: number) => (metric === "cost" ? fmtUSD(y) : fmtInt(y)), unit = metric === "cost" ? "cost" : metric;
    return [x.id, { rank: x.rank, label: x.label, note: `${n(x.here)} of ${n(x.value)} ${unit} here`, short: `${n(x.here)}/${n(x.value)} ${unit}` }];
  })), [hots, metric]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.node.id, r])), [rows]);
  const curId = byId.has(cur) ? cur : ROOT_ID;
  const sel = byId.get(curId)!;
  const focus = focusOf(parts, curId);

  // ---- actions
  const toggle = (id: string, to?: boolean) => {
    const on = to ?? !open.has(id);
    // the sunburst has room for every session of an opened project (the list keeps the cap: a project is a summary first there)
    if (on && !narrow && byId.get(id)?.node.kind === "project") setLifted((s) => new Set(s).add(id));
    setOpen((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  };
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
    const anc = ancestors(id);
    setOpen((s) => new Set([...s, ROOT_ID, ...anc])); setLifted((s) => new Set([...s, ...anc])); setCur(id);
  };
  const canApply = (n: MapNode) => n.kind !== "root" && n.kind !== "session" && n.kind !== "more" && Object.keys(n.filter).length > 0;
  const applyNode = (n: MapNode) => { if (n.kind === "session" && n.session) openSession(n.session); else if (canApply(n)) apply(n.filter); };

  const key = (e: RKE) => {   // keyboard model for the sunburst: the current node is the one the arrows move from
    const id = curId, r = byId.get(id); if (!r) return;
    const n = r.node, same = rows.filter((x) => x.depth === r.depth);
    const go = (to: string | null | undefined) => { if (to) { e.preventDefault(); setCur(to); } };
    if (e.key === "ArrowDown" || e.key === "ArrowUp") go(same[same.findIndex((x) => x.node.id === id) + (e.key === "ArrowDown" ? 1 : -1)]?.node.id);
    else if (e.key === "ArrowRight") { if (open.has(id) && n.children.length) go(n.children[0].id); else if (n.children.length) { e.preventDefault(); toggle(id, true); } }
    else if (e.key === "ArrowLeft") { if (open.has(id) && n.children.length) { e.preventDefault(); toggle(id, false); } else go(r.parent); }
    else if (e.key === "Home") go(ROOT_ID);
    else if (e.key === "End") go(rows.at(-1)?.node.id);
    else if (e.key === "Enter") { e.preventDefault(); if (canApply(n)) { setCur(n.id); applyNode(n); } else activate(n); }   // Enter drills (a session opens, "+N more" opens)
    else if (e.key === " ") { e.preventDefault(); activate(n); }
  };

  // ---- highlight: nodes on the active filter path stay bright, unrelated ones dim
  const onIds = rows.filter(({ node: n }) => canApply(n) && (Object.keys(n.filter) as (keyof typeof n.filter)[]).every((k) => f[k] === n.filter[k])).map((r) => r.node.id);
  const related = (id: string) => onIds.length === 0 || onIds.some((o) => o === id || o.startsWith(`${id}/`) || id.startsWith(`${o}/`));
  const path = (() => { const out: MapNode[] = []; for (let id: string | null = curId; id; id = byId.get(id)?.parent ?? null) out.unshift(byId.get(id)!.node); return out; })();
  const total = root.value || 1;
  /** The node's value as shown: a cost nobody priced reads "unpriced", not $0. */
  const val = (n: MapNode) => (metric === "cost" && !n.priced ? "unpriced" : FMT[metric](n.value));
  const amount = (n: MapNode) => (metric === "cost" ? (n.priced ? `${fmtUSD(n.value)} cost` : "cost unpriced") : count(n.value, metric.slice(0, -1)));
  const share = (n: MapNode) => (metric === "cost" && !n.priced ? "no priced sessions" : `${pctOf(n.value / total)} of ${metric}`);
  // the share and struggled rate are spoken here too: a small hub (cards ~713px and under) drops those lines
  const aria = (n: MapNode) => [`${nameOf(n)}: ${amount(n)}`, share(n), ...(metric === "sessions" ? [] : [count(n.sessions, "session")]),
    ...(n.kind === "more" ? [] : [`friction ${n.friction.toFixed(2)}`, `applied ${fmtPct(n.applied)}`, struggleNote(n)])].join(", ")
    + `. ${n.kind === "session" ? "Open session" : n.kind === "more" ? "Show them" : n.children.length ? "Expand or collapse" : ""}`;
  const info = (n: MapNode): [string, string][] => [...(n.kind === "more" ? [] : [[struggleNote(n), struggleNote(n, true)] as [string, string]]),
    [share(n), metric === "cost" && !n.priced ? "unpriced" : `${pctOf(n.value / total)} share`]];
  // the live region speaks only for changes made from outside the tree (breadcrumbs, buttons); inside it, the focused item already speaks
  const announce = inTree ? "" : `${nameOf(sel.node)}, ${sel.node.kind}, ${amount(sel.node)}, friction ${sel.node.friction.toFixed(2)}. ${sel.node.children.length ? (open.has(curId) ? "Expanded" : "Collapsed") : "No children"}. Level ${sel.depth + 1}.`;
  const avg = root.struggled;

  const hit = v.rows.filter(struggled), byProj = new Map<string, number>();
  for (const r of hit) byProj.set(r.project, (byProj.get(r.project) ?? 0) + 1);
  const hotP = [...byProj].sort((a, b) => b[1] - a[1])[0];
  const so = hotP ? <>{hotP[0]} is the hotspot: <b>{Math.round((hotP[1] / hit.length) * 100)}%</b> of struggled sessions.</> : <>Nothing flagged in this window.</>;
  if (v.rows.length === 0) return <Section id="s-map" title="Mind map" q="How does your AI work branch?"><Card so="Nothing flagged in this window." thin title="How your work connects" src="sessions graph · no sessions" span={12}><Empty /></Card></Section>;

  // ---- pieces shared by the bar (narrow) and the plot overlay / inspector (wide, medium)
  const crumbs = (
    <nav className="mm-path" aria-label="Expanded path">
      {path.map((n, i) => <span key={n.id} className="crumb-w">{i > 0 && <span aria-hidden="true">/</span>}<button type="button" className="crumb" aria-current={i === path.length - 1 || undefined} onClick={() => { setCur(n.id); focusId(n.id); }}>{nameOf(n)}</button></span>)}
      {(curId !== ROOT_ID || opened) && <button type="button" className="crumb mm-reset" onClick={() => { setOpened(null); setCur(ROOT_ID); }}>Reset</button>}
    </nav>
  );
  const zoomOut = !narrow && focus?.parent && <button type="button" className="btn" onClick={() => { setCur(focus.id); focusId(focus.id); }}>Zoom out to {nameOf(byId.get(focus.parent)?.node ?? root)}</button>;
  const sn = sel.node, why = !canApply(sn) && <span className="meta" id={whyId}>{sn.kind === "root" ? "Select a branch to filter" : sn.kind === "more" ? "Open the group first" : "No filter for this node"}</span>;
  /** Actions always act on the selection, never on a hover preview. */
  const actions = (
    <span className="mm-acts">
      {sn.kind === "session" && sn.session ? <button type="button" className="btn" onClick={() => applyNode(sn)}>Open session</button> : <button type="button" className="btn" disabled={!canApply(sn)} aria-describedby={canApply(sn) ? undefined : whyId} onClick={() => applyNode(sn)}>Apply filter</button>}
      {!narrow && canApply(sn) && <button type="button" className="btn" onClick={() => { apply(sn.filter); goto("s-sessions"); }}>Open {fmtInt(sn.sessions)} sessions</button>}
      {sn.children.length > 0 && <button type="button" className="btn" aria-expanded={open.has(curId)} onClick={() => toggle(curId)}>{open.has(curId) ? "Collapse" : "Expand"}</button>}
      {why}
    </span>
  );
  const hotsEl = hots.length > 0 && <div className="mm-hots"><span className="muted">Hotspots by cost × friction ({BASIS_NOTE[metric]}):</span>{hots.map((x) => <button key={x.id} type="button" className="chip" onClick={() => {
    showHot(x.id);
    if (x.project) { apply({ project: x.project }); requestAnimationFrame(() => goto("s-sessions")); }   // scroll once the filtered page has laid out
  }}
    onMouseEnter={() => setHotHov(x.id)} onMouseLeave={() => setHotHov(null)} onFocus={() => setHotHov(x.id)} onBlur={() => setHotHov(null)}
    aria-label={`Hotspot ${x.rank}: ${x.label}, ${chipText(x)}, friction ${x.friction.toFixed(2)}. Filter to this project and show its sessions`}><b className="mm-hot" aria-hidden="true">{x.rank}</b><span className="mm-hl">{x.label}</span> <span className="meta">{chipShort(x)}</span><span className="mm-note">{hot.get(x.id)?.note}</span></button>)}</div>;

  // inspector: the pointer's arc, else a hovered or focused hotspot row, else the selection
  const N = (hov && byId.get(hov)?.node) || (hotHov && byId.get(hotHov)?.node) || sn;
  const kids = N.kind === "more" ? [] : N.children.filter((c) => c.kind !== "more").sort((a, b) => b.value - a.value).slice(0, 5);
  const idle = N.id === ROOT_ID, few = N.rated < ROUTER_MIN_N, bad = N.kind !== "more" && !(metric === "cost" && !N.priced) && edgeOf(N, avg);
  const sc = Math.min(1, Math.max(N.struggled, avg, 0.1) * 1.25);
  const detail = (
    <section className="mm-detail" aria-label="Node details">
      <p className="mm-eye"><i className="sw" style={{ background: colorOf(N, toolOf(N)) }} />{N.kind}{N.id !== sn.id && <span className="mm-prev">previewing</span>}</p>
      <p className="mm-nm" title={nameOf(N)}>{nameOf(N)}</p>
      <p className="mm-big"><b>{val(N)}</b> <span className="meta">{share(N)}</span></p>
      {N.kind !== "more" && <div className="mm-str">
        <p className="meta">{few ? struggleNote(N) : <><b>{fmtPct(N.struggled)}</b> struggled vs {fmtPct(avg)} average</>}</p>
        {!few && <span className="mm-track" data-bad={bad ? "" : undefined} style={{ "--f": N.struggled / sc, "--a": avg / sc } as CSSProperties}><i /><u /></span>}
      </div>}
      {!idle && N.kind !== "more" && <p className="meta mm-stats">friction <b>{N.friction.toFixed(2)}</b> · applied <b>{fmtPct(N.applied)}</b></p>}
      {kids.length > 0 && <div className="mm-kids"><span className="muted">Top {kids[0].kind}s</span>{kids.map((c) => (
        <button key={c.id} type="button" className="mm-kid" onClick={() => { setCur(c.id); if (c.kind === "session" && c.session) openSession(c.session); else toggle(N.id, true); }}>
          <span className="mm-name">{nameOf(c)}</span><span className="mm-val">{val(c)}</span>
          <span className="mm-share" aria-hidden="true" style={{ "--w": Math.max(0.02, c.value / (N.value || 1)), "--c": colorOf(c, toolOf(c)) } as CSSProperties}><i /></span>
        </button>))}</div>}
      {sn.kind !== "root" && actions}
    </section>
  );
  const foot = (
    <div className="mm-foot">
      <ul className="legend mm-key">
        <li className="k-arc" title={`Arc length = share of ${metric}`}>Arc = share of {metric}</li>
        <li className="k-tone" title="Colour = tool, lighter each ring out: intent, project, session">Tool, lighter outward</li>
        {avg > 0 && <li className="k-heat" title={`Red outer edge = struggled ${EDGE_OVER} times the ${fmtPct(avg, 0)} average or more, darkest at 3 times it (${ROUTER_MIN_N}+ sessions with a prompt; faded under ${MIN_N})`}>Struggle ≥ {EDGE_OVER}x avg</li>}
        {hots.length > 0 && <li className="hotkey" title="Dashed outline and number = hotspot">Hotspot</li>}
        {metric === "cost" && <li className="hatch" title="Hatched = no priced sessions">Unpriced</li>}
      </ul>
      <details className="mm-keys-d"><summary>Keys</summary>
        <p className="meta mm-keys" id={keysId}>Keys: up and down move around a ring, right opens or steps out, left closes or steps in, Enter applies the filter (on the centre it zooms out), Space opens or closes, Home returns to the centre, End goes to the last node. Click the centre to zoom out.</p>
      </details>
    </div>
  );

  return (
    <Section id="s-map" title="Mind map" q="How does your AI work branch?">
      <Card so={so} thin={!hotP} title="How your work connects" src={`sessions graph · n ${fmtInt(v.rows.length)}`} meta={narrow ? "tool, intent, project, session" : "tool, intent, project, session. Click to open and zoom, double-click to filter"} span={12}
        actions={<Segmented label="Size nodes by" value={metric} onChange={setMetric} options={[{ id: "sessions" as const, text: "Sessions" }, { id: "prompts" as const, text: "Prompts" }, ...(hasCost ? [{ id: "cost" as const, text: "Cost" }] : [])]} />}>
        <div className="mm-wrap" ref={wrap} data-mode={mode}>
          {narrow && <>
            <div className="mm-bar">{crumbs}<span className="grow" />{actions}</div>
            {hotsEl}
          </>}
          <div className="mm-plot">
            {!narrow && <div className="mm-ov">{crumbs}{zoomOut}</div>}
            <div className="mm" ref={body} style={mode === "mid" && W ? { height: Math.min(W - 24, 440) } : undefined} onFocus={() => setInTree(true)} onBlur={(e) => setInTree(!!body.current?.contains(e.relatedTarget as Node | null))}>
              {narrow ? (
                <ul className="mm-list" aria-label="Mind map as an indented list">
              {rows.map(({ node: n, depth }, i) => {
                const kids = n.children.length > 0, on = open.has(n.id), c = colorOf(n, toolOf(n)), ed = n.kind === "more" || (metric === "cost" && !n.priced) ? null : edgeOf(n, avg);
                return (
                  <li key={n.id} data-dim={!related(n.id) || undefined} style={{ "--i": Math.min(i, 12), "--c": c, "--w": Math.max(0.02, n.value / total) } as CSSProperties}>
                    <button type="button" className="mm-row" data-id={n.id} data-cur={n.id === curId || undefined} aria-expanded={kids ? on : undefined} aria-label={aria(n)} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => activate(n)}>
                      <span className="mm-caret" aria-hidden="true">{kids ? (on ? "▾" : "▸") : n.kind === "more" ? "+" : "·"}</span>
                      <span className="sw" />
                      <span className="mm-name">{ed && <i className="mm-heat" data-faded={ed.faded || undefined} aria-hidden="true" />}{hot.has(n.id) && <><b className="mm-hot" aria-hidden="true">#{hot.get(n.id)?.rank}</b><span className="sr-only">Hotspot {hot.get(n.id)?.rank}, </span></>}{nameOf(n)}</span>
                      <span className="mm-val">{val(n)}</span>
                      <span className="mm-share" aria-hidden="true"><i /></span>
                    </button>
                    {/* out of the tab order (39 rows would be 77 stops): the row selects, and the bar above offers the same "Apply filter" */}
                    {canApply(n) && <button type="button" className="chip mm-go" tabIndex={-1} aria-label={`Apply filter: ${nameOf(n)}`} onClick={() => applyNode(n)}>Filter</button>}
                  </li>
                );
              })}
                </ul>
              ) : (
            <Sunburst w={w} h={h} parts={parts} shown={shown} cur={curId} open={open} hot={hot} hi={hotHov} onHover={setHov} label={`Mind map sunburst: ${fmtInt(v.rows.length)} sessions by tool, intent and project, arcs sized by ${metric}`} describedBy={keysId}
              nameOf={nameOf} ariaOf={aria} fmt={val} info={info} metric={metric} related={related} cover={cover}
              onPick={(n) => { if (n.id !== curId && open.has(n.id)) setCur(n.id); else activate(n); }}   // the first click on an open node selects it, the next one closes it
              onApply={(n) => { setCur(n.id); applyNode(n); }} onKey={key} onUp={() => focus && setCur(focus.id)} onSel={setCur} onHot={showHot} />
              )}
            </div>
          </div>
          {!narrow && <div className="mm-side">{detail}{hotsEl || <span />}{foot}</div>}
        </div>
        <p className="sr-only" aria-live="polite">{announce}</p>
        <DataTable caption="Mind map nodes" head={["Node", "Level", "Sessions", "Friction", "Struggled", "Applied"]} rows={rows.map(({ node: n }) => [n.id.replace(`${ROOT_ID}/`, "").replace(ROOT_ID, "Your AI work"), n.kind, n.sessions, n.friction.toFixed(2), fmtPct(n.struggled), fmtPct(n.applied)])} />
      </Card>
    </Section>
  );
}
