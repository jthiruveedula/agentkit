import { useId, useState } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey";
import { arc } from "d3-shape";
import { chordDirected, ribbonArrow } from "d3-chord";
import type { DashboardData, Intent, Source } from "../data/types";
import { fmtInt, fmtPct } from "../lib/format";
import { gsap } from "../lib/motion";
import { BG, HURTS, MUTED, SEQ, TEXT, srcColor, srcLabel } from "../lib/palette";
import { Chart, DataTable, Hits, Segmented } from "./Chart";
import { BestTool } from "./Narrative";

interface N { id: string; name: string; color: string; drop?: boolean }
interface L { source: string; target: string; value: number; color: string; drop?: boolean }
type SN = SankeyNode<N, L>;
type SL = SankeyLink<N, L>;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function graph(d: DashboardData, view: "all" | Intent) {
  const stages = d.funnel.stages;
  const rows = view === "all"
    ? d.funnel.by_source.map((r) => ({ id: `s:${r.source}`, name: srcLabel(r.source), color: srcColor(r.source), counts: r.counts }))
    : d.funnel.by_intent.filter((r) => r.intent === view).map((r) => ({ id: `i:${r.intent}`, name: cap(r.intent), color: SEQ[4], counts: r.counts }));
  const nodes: N[] = [...rows.map((r) => ({ id: r.id, name: r.name, color: r.color })), ...stages.map((s) => ({ id: `t:${s}`, name: cap(s), color: SEQ[3] })), { id: "drop", name: "Dropped", color: HURTS, drop: true }];
  const links: L[] = [];
  for (const r of rows) if ((r.counts[0] ?? 0) > 0) links.push({ source: r.id, target: `t:${stages[0]}`, value: r.counts[0], color: r.color });
  const tot = stages.map((_, i) => rows.reduce((a, r) => a + (r.counts[i] ?? 0), 0));
  for (let i = 0; i < stages.length - 1; i++) {
    const keep = Math.min(tot[i], tot[i + 1]);
    if (keep > 0) links.push({ source: `t:${stages[i]}`, target: `t:${stages[i + 1]}`, value: keep, color: SEQ[3] });
    if (tot[i] - keep > 0) links.push({ source: `t:${stages[i]}`, target: "drop", value: tot[i] - keep, color: HURTS, drop: true });
  }
  return { nodes, links, tot, rows };
}

function layout(d: DashboardData, view: "all" | Intent, w: number, h: number) {
  const g = graph(d, view);
  const used = new Set(g.links.flatMap((l) => [l.source, l.target]));
  const nodes = g.nodes.filter((n) => used.has(n.id)).map((n) => ({ ...n }));
  const links = g.links.map((l) => ({ ...l }));
  if (links.length === 0) return { ...g, nodes: [] as SN[], links: [] as SL[] };
  const padR = w < 520 ? 52 : 84;
  const out = sankey<N, L>().nodeId((n) => n.id).nodeWidth(12).nodePadding(w < 520 ? 8 : 14)
    .extent([[w < 520 ? 56 : 90, 8], [w - padR, h - 8]])({ nodes, links });
  return { ...g, nodes: out.nodes as SN[], links: out.links as SL[] };
}

function Sankey({ d }: { d: DashboardData }) {
  const uid = useId().replace(/:/g, "");
  const [view, setView] = useState<"all" | Intent>("all");
  const intents = d.funnel.by_intent.map((r) => r.intent);
  const first = layout(d, "all", 800, 400);
  const empty = first.links.length === 0;
  const total = first.tot[0] ?? 0, end = first.tot[first.tot.length - 1] ?? 0;
  const pick = (v: "all" | Intent) => {
    setView(v);
    const el = document.querySelector("#sankey .links");
    if (el && !matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(el, { opacity: 0.15 }, { opacity: 1, duration: 0.7, ease: "power2.out" });
  };
  const tableRows = view === "all"
    ? d.funnel.by_source.map((r) => [srcLabel(r.source), ...r.counts])
    : d.funnel.by_intent.filter((r) => r.intent === view).map((r) => [cap(r.intent), ...r.counts]);
  return (
    <Chart id="sankey" title="Funnel flows" ratio={2.1} ratioSm={0.9} scrub empty={empty} emptyText="No funnel data yet"
      label={`Sankey of sessions flowing through ${d.funnel.stages.join(", ")}. ${fmtInt(total)} sessions start, ${fmtInt(end)} reach an outcome (${fmtPct(total ? end / total : 0)}).`}
      controls={<Segmented label="Funnel view" value={view} onChange={pick} options={[{ id: "all", text: "All sources" }, ...intents.map((i) => ({ id: i, text: cap(i) }))]} />}
      table={<DataTable caption="Funnel counts" head={["Row", ...d.funnel.stages]} rows={tableRows} />}
      motion={({ root, wide }) => {
        const clip = root.querySelector(".reveal-clip");
        if (!clip) return;
        const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: wide
          ? { trigger: root, start: "top 6%", end: "+=90%", pin: true, scrub: 0.6 }
          : { trigger: root, start: "top 80%", end: "top 30%", scrub: 0.6 } });
        tl.fromTo(clip, { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", duration: 1 });
        // beat 2: the dropped flows sink and fade, handing the story to friction
        tl.to(root.querySelectorAll("[data-drop]"), { y: 28, opacity: 0.18, duration: 0.5 }, ">0.1");
        tl.from(root.querySelector(".callout"), { opacity: 0, duration: 0.2 }, "<");
      }}
      overlay={({ w, h }, tip) => {
        const g = layout(d, view, w, h);
        return <Hits tip={tip} items={g.nodes.map((n) => {
          const v = n.value ?? 0;
          return { key: n.id, x: (n.x0 ?? 0) - 6, y: n.y0 ?? 0, w: (n.x1 ?? 0) - (n.x0 ?? 0) + 12, h: (n.y1 ?? 0) - (n.y0 ?? 0), label: `${n.name}: ${fmtInt(v)} sessions` };
        })} />;
      }}>
      {({ w, h }, tip) => {
        const g = layout(d, view, w, h);
        const path = sankeyLinkHorizontal<N, L>();
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <defs><clipPath id={`sk${uid}`}><rect className="reveal-clip" x={0} y={0} width={w} height={h} /></clipPath></defs>
            <g className="links" clipPath={`url(#sk${uid})`} fill="none">
              {g.links.map((l, i) => {
                const s = l.source as SN, t = l.target as SN;
                return (
                  <path key={i} data-drop={l.drop ? "" : undefined} d={path(l) ?? ""} stroke={l.color} strokeOpacity={l.drop ? 0.55 : 0.42} strokeWidth={Math.max(1, l.width ?? 1)}
                    onPointerEnter={(e) => { const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); tip.show(e.clientX - r.left, e.clientY - r.top, `${s.name} to ${t.name}: ${fmtInt(l.value)}`); }} />
                );
              })}
            </g>
            {(() => {
              const drops = g.links.filter((l) => l.drop);
              const big = [...drops].sort((a, b) => b.value - a.value)[0];
              if (!big) return null;
              const s = big.source as SN, t = big.target as SN;
              const si = d.funnel.stages.findIndex((x) => `t:${x}` === s.id);
              const pct = g.tot[si] ? big.value / g.tot[si] : 0;
              const nextName = d.funnel.stages[si + 1];
              return (
                <text className="callout" x={Math.min(w - 8, ((s.x1 ?? 0) + (t.x0 ?? 0)) / 2)} y={Math.max(14, (big.y1 ?? 0) - (big.width ?? 0) / 2 - 8)} textAnchor="middle" fill={TEXT} stroke={BG} strokeWidth={4} paintOrder="stroke" fontSize={w < 520 ? 10 : 12} fontWeight={600}>
                  Biggest drop: {fmtPct(pct)} lost before {nextName}
                </text>
              );
            })()}
            {g.nodes.map((n) => {
              const left = (n.x0 ?? 0) < w / 2 && !n.id.startsWith("t:");
              return (
                <g key={n.id}>
                  <rect x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={Math.max(2, (n.y1 ?? 0) - (n.y0 ?? 0))} fill={n.color} rx={2} stroke={BG} />
                  <text x={left ? (n.x0 ?? 0) - 6 : (n.x1 ?? 0) + 6} y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2} dy="0.35em" textAnchor={left ? "end" : "start"} fill={n.drop ? TEXT : MUTED} fontSize={w < 520 ? 10 : 12}>{n.name}</text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Chart>
  );
}

function Switch({ d }: { d: DashboardData }) {
  const ts = d.tool_switch.filter((t) => t.count > 0 && t.from !== t.to);
  const names = [...new Set(ts.flatMap((t) => [t.from, t.to]))] as Source[];
  const idx = new Map(names.map((n, i) => [n, i]));
  const m = names.map(() => names.map(() => 0));
  for (const t of ts) m[idx.get(t.from)!][idx.get(t.to)!] += t.count;
  const total = ts.reduce((a, t) => a + t.count, 0);
  const top = [...ts].sort((a, b) => b.count - a.count)[0];
  return (
    <Chart title="Tool switches" className="narrow" ratio={1.5} ratioSm={0.95} empty={names.length < 2} emptyText="No tool switches detected"
      label={top ? `Chord diagram of ${fmtInt(total)} tool switches within 24 hours. Most common: ${srcLabel(top.from)} to ${srcLabel(top.to)}, ${fmtInt(top.count)} times.` : "No tool switches"}
      table={<DataTable caption="Tool switches" head={["From", "To", "Count"]} rows={ts.map((t) => [srcLabel(t.from), srcLabel(t.to), t.count])} />}
      motion={({ root }) => { gsap.from(root.querySelectorAll(".rib"), { opacity: 0, stagger: 0.04, duration: 0.7, scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}
      overlay={({ w, h }, tip) => {
        const r = Math.min(w, h) / 2 - (w < 520 ? 44 : 64);
        const ch = chordDirected().padAngle(0.06)(m);
        const ar = arc<{ startAngle: number; endAngle: number }>().innerRadius(r).outerRadius(r + 12);
        return <Hits tip={tip} items={ch.groups.map((g) => {
          const [x, y] = ar.centroid(g);
          const out = m[g.index].reduce((a, b) => a + b, 0), inn = m.reduce((a, row) => a + row[g.index], 0);
          return { key: names[g.index], x: x + w / 2 - 14, y: y + h / 2 - 14, w: 28, h: 28, label: `${srcLabel(names[g.index])}: ${fmtInt(out)} switches away, ${fmtInt(inn)} switches to` };
        })} />;
      }}>
      {({ w, h }, tip) => {
        const r = Math.min(w, h) / 2 - (w < 520 ? 44 : 64);
        const ch = chordDirected().padAngle(0.06).sortSubgroups((a, b) => b - a)(m);
        const ar = arc<{ startAngle: number; endAngle: number }>().innerRadius(r).outerRadius(r + 12);
        const rb = ribbonArrow().radius(r - 2).headRadius(10);
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <g transform={`translate(${w / 2},${h / 2})`}>
              {ch.map((c, i) => (
                <path key={i} className="rib" d={(rb(c as never) as unknown as string) ?? ""} fill={srcColor(names[c.source.index])} fillOpacity={0.55} stroke={BG} strokeWidth={0.5}
                  onPointerEnter={(e) => { const b = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); tip.show(e.clientX - b.left, e.clientY - b.top, `${srcLabel(names[c.source.index])} to ${srcLabel(names[c.target.index])}: ${fmtInt(c.source.value)}`); }} />
              ))}
              {ch.groups.map((g) => {
                const a = (g.startAngle + g.endAngle) / 2 - Math.PI / 2;
                const lx = Math.cos(a) * (r + 22), ly = Math.sin(a) * (r + 22);
                return (
                  <g key={g.index}>
                    <path d={ar(g) ?? ""} fill={srcColor(names[g.index])} />
                    <text x={lx} y={ly} dy="0.35em" textAnchor={Math.cos(a) > 0.2 ? "start" : Math.cos(a) < -0.2 ? "end" : "middle"} fill={MUTED} fontSize={w < 520 ? 10 : 12}>{srcLabel(names[g.index])}</text>
                  </g>
                );
              })}
            </g>
          </svg>
        );
      }}
    </Chart>
  );
}

export function Funnel({ d }: { d: DashboardData }) {
  return (
    <div className="stack">
      <Sankey d={d} />
      <Switch d={d} />
      <BestTool d={d} />
    </div>
  );
}
