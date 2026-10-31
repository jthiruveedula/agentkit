import { useEffect, useRef } from "react";
import { quadtree } from "d3-quadtree";
import { max, min } from "d3-array";
import { scaleLinear } from "d3-scale";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { DashboardData } from "../data/types";
import { fmtInt, fmtPct, fmtSigned } from "../lib/format";
import { gsap } from "../lib/motion";
import { BG, CAT, GRID, HELPS, HURTS, MUTED, SEQ, TEXT, srcColor, srcLabel } from "../lib/palette";
import { Chart, DataTable, Hits, type Box, type TipApi } from "./Chart";

const PAD = 18;
const colorOf = (c: number) => (c < 0 ? GRID : CAT[c % CAT.length]);

function GalaxyCanvas({ d, w, h, tip }: { d: DashboardData; w: number; h: number; tip: TipApi }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const qt = useRef<ReturnType<typeof quadtree<number>> | null>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const last = useRef(-1);
  const { x, y, c, q } = d.galaxy.points;
  const byId = new Map(d.galaxy.clusters.map((k) => [k.id, k]));
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const px = (i: number) => PAD + x[i] * (w - 2 * PAD), py = (i: number) => PAD + y[i] * (h - 2 * PAD);
    const groups = new Map<string, number[]>();
    for (let i = 0; i < x.length; i++) {
      const key = `${c[i]}|${Math.min(3, Math.floor(q[i] / 25.01))}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(i);
    }
    for (const [key, idx] of groups) {
      const [cl, b] = key.split("|").map(Number);
      ctx.fillStyle = colorOf(cl);
      ctx.globalAlpha = [0.28, 0.5, 0.75, 1][b];
      ctx.beginPath();
      for (const i of idx) { const r = 0.7 + (q[i] / 100) * 1.5; const X = px(i), Y = py(i); ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, 6.2832); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const t = quadtree<number>().x(px).y(py);
    t.addAll(Array.from({ length: x.length }, (_, i) => i));
    qt.current = t;
  }, [d, w, h, x, y, c, q]);

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = w / r.width; // canvas may be mid-scale from the scrub
    const mx = (e.clientX - r.left) * k, my = (e.clientY - r.top) * k;
    const i = qt.current?.find(mx, my, 14) ?? -1;
    if (i === last.current) return;
    last.current = i;
    if (i < 0) { tip.hide(); if (ring.current) ring.current.style.opacity = "0"; return; }
    const X = PAD + x[i] * (w - 2 * PAD), Y = PAD + y[i] * (h - 2 * PAD);
    const cl = byId.get(c[i]);
    tip.show(X, Y, <><strong>{cl ? cl.label : "Unclustered"}</strong><br />{cl ? `${fmtPct(cl.success)} success` : "no cluster"}, quality {Math.round(q[i])}</>);
    if (ring.current) { ring.current.style.opacity = "1"; ring.current.style.transform = `translate(${X - 7}px, ${Y - 7}px)`; }
  };
  return (
    <>
      <canvas aria-hidden="true" ref={cv} className="galaxy" style={{ width: w, height: h }} onPointerMove={move} onPointerLeave={() => { last.current = -1; tip.hide(); if (ring.current) ring.current.style.opacity = "0"; }} />
      <span ref={ring} className="ring" />
    </>
  );
}

function Galaxy({ d, basic }: { d: DashboardData; basic: boolean }) {
  const n = d.galaxy.points.x.length;
  const cl = [...d.galaxy.clusters].sort((a, b) => b.size - a.size);
  const best = [...d.galaxy.clusters].sort((a, b) => b.success - a.success)[0];
  const labels = (box: Box) => (box.w < 520 ? cl.slice(0, 6) : cl);
  const bestC = d.galaxy.clusters.filter((k) => k.size >= 50).sort((a, b) => b.success - a.success)[0] ?? best;
  return (
    <Chart title="Topic galaxy" className="galaxy-chart" ratio={1.9} ratioSm={1} scrub empty={n === 0}
      emptyText={basic ? "The topic galaxy needs the embedding extra (basic mode)" : "No topic map yet"}
      label={`Scatter of ${fmtInt(n)} prompts grouped into ${cl.length} topic clusters. ${best ? `${best.label} has the highest success rate at ${fmtPct(best.success)}.` : ""}`}
      table={<DataTable caption="Topic clusters" head={["Cluster", "Intent", "Prompts", "Success"]} rows={cl.map((k) => [k.label, k.intent, k.size, fmtPct(k.success)])} />}
      motion={({ root, wide }) => {
        const cv = root.querySelector<HTMLElement>(".galaxy");
        if (!cv) return;
        const ox = bestC ? (PAD + bestC.cx * (cv.clientWidth - 2 * PAD)) / cv.clientWidth * 100 : 50;
        const oy = bestC ? (PAD + bestC.cy * (cv.clientHeight - 2 * PAD)) / cv.clientHeight * 100 : 50;
        const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: wide
          ? { trigger: root, start: "top 8%", end: "+=140%", pin: true, scrub: 0.6 }
          : { trigger: root, start: "top 85%", end: "top 25%", scrub: 0.6 } });
        // beat 1: all prompts appear. beat 2 (desktop): zoom into your best cluster.
        tl.fromTo(cv, { scale: 0.86, opacity: 0.15, transformOrigin: `${ox}% ${oy}%` }, { scale: 1, opacity: 1, duration: 1 }, 0)
          .fromTo(root.querySelector(".hits"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.6);
        if (wide) {
          const hits = root.querySelector(".hits");
          gsap.set(hits, { transformOrigin: `${ox}% ${oy}%` });
          tl.to([cv, hits], { scale: 1.9, duration: 1.2 }, ">0.2")
            .to(root.querySelectorAll(".clabel:not(.best)"), { opacity: 0, duration: 0.4 }, "<");
        }
      }}
      overlay={(box, tip) => (
        <div className="hits">
          {labels(box).map((k) => {
            const show = () => tip.show(k.cx * (box.w - 2 * PAD) + PAD, k.cy * (box.h - 2 * PAD) + PAD, <><strong>{k.label}</strong><br />{fmtPct(k.success)} success, {fmtInt(k.size)} prompts</>);
            return (
              <button key={k.id} type="button" className={`clabel ${bestC && k.id === bestC.id ? "best" : ""}`} aria-label={`${k.label}: ${fmtPct(k.success)} success, ${fmtInt(k.size)} prompts, ${k.intent}`}
                style={{ transform: `translate(${k.cx * (box.w - 2 * PAD) + PAD}px, ${k.cy * (box.h - 2 * PAD) + PAD}px) translate(-50%, -50%)` }}
                onFocus={show} onBlur={tip.hide} onPointerEnter={show} onClick={show} onKeyDown={(e) => { if (e.key === "Escape") tip.hide(); }}>{k.label}</button>
            );
          })}
        </div>
      )}>
      {({ w, h }, tip) => <GalaxyCanvas d={d} w={w} h={h} tip={tip} />}
    </Chart>
  );
}

function Radar({ d }: { d: DashboardData }) {
  const { axes, you, top, by_source } = d.quality;
  const ok = you.length === axes.length && you.length > 2;
  const gap = ok ? axes.map((_, i) => (top[i] ?? 0) - you[i]) : [];
  const worst = gap.length ? gap.indexOf(Math.max(...gap)) : 0;
  return (
    <Chart title="Prompt quality" ratio={1.3} ratioSm={1} empty={!ok} emptyText="No prompt-quality scores yet"
      label={ok ? `Radar of prompt quality on ${axes.join(", ")}. Your biggest gap to the top tercile is ${axes[worst]}: ${fmtPct(you[worst])} against ${fmtPct(top[worst] ?? 0)}.` : "Prompt quality"}
      controls={ok ? <ul className="legend"><li style={{ "--c": SEQ[4] } as React.CSSProperties}><span className="sw" />You</li><li style={{ "--c": HELPS } as React.CSSProperties}><span className="sw dash" />Top tercile</li>{by_source.map((s) => <li key={s.source} style={{ "--c": srcColor(s.source) } as React.CSSProperties}><span className="sw thin" />{srcLabel(s.source)}</li>)}</ul> : null}
      table={<DataTable caption="Prompt quality sub-scores" head={["Series", ...axes]} rows={[["You", ...you.map((v) => fmtPct(v))], ["Top tercile", ...top.map((v) => fmtPct(v))], ...by_source.map((s) => [srcLabel(s.source), ...s.values.map((v) => fmtPct(v))])]} />}
      motion={({ root }) => {
        const svg = root.querySelector("svg"); const g = root.querySelector(".polys");
        if (!svg || !g) return;
        const vb = svg.viewBox.baseVal;
        gsap.from(g, { scale: 0, opacity: 0, svgOrigin: `${vb.width / 2} ${vb.height / 2}`, duration: 1, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 80%", once: true } });
      }}
      overlay={({ w, h }, tip) => {
        const R = Math.min(w, h) / 2 - 40, cx = w / 2, cy = h / 2;
        return <Hits tip={tip} items={axes.map((a, i) => {
          const ang = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
          return { key: a, x: cx + Math.cos(ang) * (R + 20) - 30, y: cy + Math.sin(ang) * (R + 20) - 12, w: 60, h: 24, label: `${a}: you ${fmtPct(you[i] ?? 0)}, top tercile ${fmtPct(top[i] ?? 0)}` };
        })} />;
      }}>
      {({ w, h }) => {
        const R = Math.min(w, h) / 2 - 40, cx = w / 2, cy = h / 2;
        const pt = (i: number, v: number) => { const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v] as const; };
        const poly = (vals: number[]) => vals.map((v, i) => pt(i, Math.max(0, Math.min(1, v))).join(",")).join(" ");
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {[0.25, 0.5, 0.75, 1].map((r) => <polygon key={r} points={poly(axes.map(() => r))} fill="none" stroke={GRID} strokeOpacity={0.5} />)}
            {axes.map((a, i) => { const [x, y] = pt(i, 1); const [lx, ly] = pt(i, 1.16); return (
              <g key={a}><line x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeOpacity={0.5} /><text x={lx} y={ly} dy="0.35em" textAnchor={Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end"} fill={TEXT} fontSize={12}>{a}</text></g>
            ); })}
            <g className="polys">
              {by_source.filter((s) => s.values.length === axes.length).map((s) => <polygon key={s.source} points={poly(s.values)} fill="none" stroke={srcColor(s.source)} strokeWidth={1.25} strokeOpacity={0.85} />)}
              <polygon points={poly(top)} fill={HELPS} fillOpacity={0.08} stroke={HELPS} strokeWidth={2} strokeDasharray="6 4" />
              <polygon points={poly(you)} fill={SEQ[4]} fillOpacity={0.28} stroke={SEQ[4]} strokeWidth={2.5} />
            </g>
          </svg>
        );
      }}
    </Chart>
  );
}

function Effects({ d }: { d: DashboardData }) {
  const rows = [...d.what_works].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 8);
  const lab = new Map(d.galaxy.clusters.map((k) => [k.id, k.label]));
  const top = rows[0];
  const pts = (v: number) => `${fmtSigned(v * 100)} pts`;
  const rh = 38;
  return (
    <Chart title="What moves success" ratio={1100 / (rows.length * rh + 24 || 1)} ratioSm={330 / (rows.length * 52 + 24 || 1)} empty={rows.length === 0} emptyText="No prompt effects measured yet"
      label={top ? `Effect of prompt features on success. Strongest: ${top.feature}, ${top.direction} by ${pts(Math.abs(top.effect))}, confidence interval ${pts(top.ci[0])} to ${pts(top.ci[1])}.` : "Effects"}
      table={<DataTable caption="Prompt feature effects on success" head={["Feature", "Cluster", "Effect pts", "CI low", "CI high", "n", "Direction"]} rows={rows.map((r) => [r.feature, lab.get(r.cluster) ?? r.cluster, +(r.effect * 100).toFixed(1), +(r.ci[0] * 100).toFixed(1), +(r.ci[1] * 100).toFixed(1), r.n, r.direction])} />}
      motion={({ root }) => { gsap.from(root.querySelectorAll(".eb"), { scaleX: 0, transformOrigin: "0% 50%", stagger: 0.07, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}
      overlay={({ w, h }, tip) => (
        <Hits tip={tip} items={rows.map((r, i) => ({ key: `${r.feature}${r.cluster}`, x: 0, y: 12 + (i * (h - 24)) / rows.length, w, h: (h - 24) / rows.length, label: `${r.feature}, ${lab.get(r.cluster) ?? "cluster " + r.cluster}: ${r.direction} by ${pts(Math.abs(r.effect))}, 95% CI ${pts(r.ci[0])} to ${pts(r.ci[1])}, ${fmtInt(r.n)} prompts` }))} />
      )}>
      {({ w, h }) => {
        const narrow = w < 520;
        const l = narrow ? 8 : Math.min(230, w * 0.32), r = narrow ? 56 : 64;
        const lo = min(rows, (x) => Math.min(x.ci[0], x.effect, 0)) ?? 0, hi = max(rows, (x) => Math.max(x.ci[1], x.effect, 0)) ?? 1;
        const xs = scaleLinear().domain([lo, hi]).range([l, w - r]);
        const step = (h - 24) / rows.length;
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <line x1={xs(0)} x2={xs(0)} y1={6} y2={h - 6} stroke={GRID} />
            {rows.map((x, i) => {
              const y = 12 + i * step, bh = Math.min(16, step * (narrow ? 0.3 : 0.45)), by = narrow ? y + step - bh - 4 : y + (step - bh) / 2;
              const col = x.direction === "helps" ? HELPS : HURTS;
              const x0 = Math.min(xs(0), xs(x.effect));
              return (
                <g key={`${x.feature}${x.cluster}`}>
                  <text x={narrow ? 8 : 0} y={narrow ? y + 10 : by + bh / 2} dy={narrow ? 0 : "0.35em"} fill={TEXT} fontSize={12}>{x.feature}<tspan fill={MUTED} fontSize={11}>{narrow ? "" : `  ${lab.get(x.cluster) ?? ""}`}</tspan></text>
                  <rect className="eb" x={x0} y={by} width={Math.max(2, Math.abs(xs(x.effect) - xs(0)))} height={bh} rx={2} fill={col} />
                  <line x1={xs(x.ci[0])} x2={xs(x.ci[1])} y1={by + bh / 2} y2={by + bh / 2} stroke={TEXT} strokeWidth={1.5} />
                  <line x1={xs(x.ci[0])} x2={xs(x.ci[0])} y1={by + 2} y2={by + bh - 2} stroke={TEXT} strokeWidth={1.5} />
                  <line x1={xs(x.ci[1])} x2={xs(x.ci[1])} y1={by + 2} y2={by + bh - 2} stroke={TEXT} strokeWidth={1.5} />
                  <text x={w - r + 8} y={by + bh / 2} dy="0.35em" fill={TEXT} fontSize={11}>{pts(x.effect)}</text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Chart>
  );
}

/** Basic tier: no embedding points, so show intent clusters as a treemap coloured by success. */
export function Topics({ d }: { d: DashboardData }) {
  const cl = [...d.galaxy.clusters].filter((k) => k.size > 0).sort((a, b) => b.size - a.size);
  const up = d.engine.upgrade;
  return (
    <Chart title="Topics, grouped by keywords" ratio={1.9} ratioSm={1.1} empty={cl.length === 0} emptyText="No topics yet"
      controls={<p className="topic-note">Grouped by keywords. Install the ml extra to cluster by meaning.{up ? <> <code>{up.command}</code></> : null}</p>}
      label={`Treemap of ${cl.length} topic groups sized by prompts and shaded by success rate. ${cl[0] ? `Largest: ${cl[0].label}, ${fmtInt(cl[0].size)} prompts, ${fmtPct(cl[0].success)} success.` : ""}`}
      table={<DataTable caption="Topic groups" head={["Group", "Intent", "Prompts", "Success"]} rows={cl.map((k) => [k.label, k.intent, k.size, fmtPct(k.success)])} />}
      motion={({ root }) => { gsap.from(root.querySelectorAll(".tmc"), { opacity: 0, scale: 0.92, transformOrigin: "50% 50%", stagger: 0.03, duration: 0.5, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}
      overlay={(box, tip) => {
        const leaves = layout(cl, box.w, box.h);
        return (
          <div className="hits">
            {leaves.map((l) => {
              const show = () => tip.show(l.x0 + (l.x1 - l.x0) / 2, l.y0 + (l.y1 - l.y0) / 2, <><strong>{l.k.label}</strong><br />{fmtPct(l.k.success)} success, {fmtInt(l.k.size)} prompts</>);
              return <button key={l.k.id} type="button" className="tm" aria-label={`${l.k.label}: ${fmtPct(l.k.success)} success, ${fmtInt(l.k.size)} prompts`}
                style={{ left: l.x0, top: l.y0, width: l.x1 - l.x0, height: l.y1 - l.y0 }} onFocus={show} onBlur={tip.hide} onPointerEnter={show} onClick={show} onKeyDown={(e) => { if (e.key === "Escape") tip.hide(); }} />;
            })}
          </div>
        );
      }}>
      {({ w, h }) => (
        <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {layout(cl, w, h).map((l) => {
            const t = Math.max(0, Math.min(1, (l.k.success - 0.3) / 0.6));
            const fill = SEQ[2 + Math.round(t * 3)];
            const dark = Math.round(t * 3) >= 1; // SEQ[3+] needs dark text for 4.5:1
            const cw = l.x1 - l.x0, ch = l.y1 - l.y0;
            return (
              <g key={l.k.id} className="tmc">
                <rect x={l.x0} y={l.y0} width={cw} height={ch} rx={4} fill={fill} stroke={BG} strokeWidth={2} />
                {cw > 70 && ch > 36 && (
                  <>
                    <text x={l.x0 + 8} y={l.y0 + 18} fill={dark ? BG : TEXT} fontSize={12} fontWeight={600}>{l.k.label.length > cw / 7 ? `${l.k.label.slice(0, Math.max(3, Math.floor(cw / 7) - 1))}...` : l.k.label}</text>
                    <text x={l.x0 + 8} y={l.y0 + 34} fill={dark ? BG : TEXT} fontSize={11}>{fmtPct(l.k.success)} success</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </Chart>
  );
}

function layout(cl: DashboardData["galaxy"]["clusters"], w: number, h: number) {
  const root = hierarchy<{ k?: (typeof cl)[number]; c?: unknown[] }>({ c: cl.map((k) => ({ k })) } as never, (n) => n.c as never).sum((n) => n.k?.size ?? 0);
  treemap<{ k?: (typeof cl)[number] }>().tile(treemapSquarify).size([w, h]).paddingInner(2)(root as never);
  return (root.leaves() as unknown as { x0: number; x1: number; y0: number; y1: number; data: { k: (typeof cl)[number] } }[]).map((l) => ({ x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1, k: l.data.k }));
}

export function Works({ d }: { d: DashboardData }) {
  const flat = d.galaxy.points.x.length === 0 && d.galaxy.clusters.length > 0;
  return (
    <div className="stack">
      {flat ? <Topics d={d} /> : <Galaxy d={d} basic={d.engine.mode === "basic"} />}
      <div className="pair"><Radar d={d} /><Effects d={d} /></div>
    </div>
  );
}
