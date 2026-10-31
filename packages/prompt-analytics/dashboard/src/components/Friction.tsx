import { max } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import type { DashboardData } from "../data/types";
import { fmtInt, fmtPct } from "../lib/format";
import { gsap } from "../lib/motion";
import { GRID, MUTED, SEQ, TEXT, srcColor, srcLabel } from "../lib/palette";
import { Chart, DataTable, Hits } from "./Chart";
import { Exposure } from "./Exposure";

const KINDS = ["correction", "frustration", "rephrase", "abandoned", "interrupted"] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const grow = (sel: string, from: "x" | "y") => ({ root }: { root: HTMLElement }) => {
  gsap.from(root.querySelectorAll(sel), { [from === "x" ? "scaleX" : "scaleY"]: 0, transformOrigin: from === "x" ? "0% 50%" : "50% 100%", stagger: { amount: 0.7 }, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 80%", once: true } });
};

function BySource({ d }: { d: DashboardData }) {
  const rates = d.friction.rates;
  const top = max(rates, (r) => Math.max(...KINDS.map((k) => r[k]))) || 1;
  const layoutOf = (w: number, h: number) => {
    const cols = w >= 520 ? Math.min(5, rates.length) : Math.min(2, rates.length);
    const rows = Math.ceil(rates.length / Math.max(1, cols));
    return { cols, pw: w / cols, ph: h / rows, rows };
  };
  const worst = [...rates].sort((a, b) => b.rephrase - a.rephrase)[0];
  return (
    <Chart title="Friction by source" ratio={5.6} ratioSm={0.8} scrub empty={rates.length === 0} emptyText="No friction measured yet"
      label={worst ? `Friction rates per source. ${srcLabel(worst.source)} has the highest rephrase rate at ${fmtPct(worst.rephrase)}.` : "Friction by source"}
      table={<DataTable caption="Friction rates by source" head={["Source", ...KINDS, "Prompts"]} rows={rates.map((r) => [srcLabel(r.source), ...KINDS.map((k) => fmtPct(r[k], 1)), r.n])} />}
      motion={grow(".fb", "x")}
      overlay={({ w, h }, tip) => {
        const { cols, pw, ph } = layoutOf(w, h);
        return <Hits tip={tip} items={rates.map((r, i) => ({ key: r.source, x: (i % cols) * pw, y: Math.floor(i / cols) * ph, w: pw - 8, h: ph - 8, label: `${srcLabel(r.source)}: ${KINDS.map((k) => `${k} ${fmtPct(r[k])}`).join(", ")}` }))} />;
      }}>
      {({ w, h }, tip) => {
        const { cols, pw, ph } = layoutOf(w, h);
        const lw = Math.min(78, pw * 0.4), vw = 34;
        const bh = Math.min(14, (ph - 40) / 5 - 6);
        const x = scaleLinear().domain([0, top]).range([0, Math.max(10, pw - lw - vw - 16)]);
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {rates.map((r, i) => (
              <g key={r.source} transform={`translate(${(i % cols) * pw},${Math.floor(i / cols) * ph})`}>
                <text y={14} fill={TEXT} fontSize={13} fontWeight={600}>{srcLabel(r.source)}</text>
                <rect y={20} width={pw - 16} height={1} fill={GRID} />
                {KINDS.map((k, j) => (
                  <g key={k} transform={`translate(0,${32 + j * (bh + 8)})`}
                    onPointerEnter={() => tip.show((i % cols) * pw + lw + x(r[k]), Math.floor(i / cols) * ph + 32 + j * (bh + 8), `${srcLabel(r.source)} ${k}: ${fmtPct(r[k], 1)} of ${fmtInt(r.n)} prompts`)}>
                    <text y={bh - 2} fill={MUTED} fontSize={11}>{k}</text>
                    <rect className="fb" x={lw} width={Math.max(1, x(r[k]))} height={bh} rx={2} fill={srcColor(r.source)} />
                    <text x={lw + Math.max(1, x(r[k])) + 5} y={bh - 2} fill={MUTED} fontSize={10}>{fmtPct(r[k])}</text>
                  </g>
                ))}
              </g>
            ))}
          </svg>
        );
      }}
    </Chart>
  );
}

function Loops({ d }: { d: DashboardData }) {
  const hist = d.friction.loops_hist;
  const total = hist.reduce((a, b) => a + b.sessions, 0);
  return (
    <Chart title="Rephrase loops" ratio={2} ratioSm={1.3} empty={hist.length === 0 || total === 0} emptyText="No rephrase loops recorded"
      label={`Histogram of rephrase-loop length across ${fmtInt(total)} sessions. ${fmtPct(total ? (hist.find((x) => x.loops === 0)?.sessions ?? 0) / total : 0)} had none.`}
      table={<DataTable caption="Sessions by rephrase-loop length" head={["Loops", "Sessions"]} rows={hist.map((x) => [x.loops, x.sessions])} />}
      motion={grow(".vb", "y")}>
      {({ w, h }, tip) => {
        const m = { l: 34, b: 22, t: 8 };
        const xs = scaleBand<number>().domain(hist.map((x) => x.loops)).range([m.l, w]).padding(0.2);
        const ys = scaleLinear().domain([0, max(hist, (x) => x.sessions) ?? 1]).nice().range([h - m.b, m.t]);
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {ys.ticks(3).map((t) => (
              <g key={t}><line x1={m.l} x2={w} y1={ys(t)} y2={ys(t)} stroke={GRID} strokeOpacity={0.4} /><text x={m.l - 6} y={ys(t)} dy="0.35em" textAnchor="end" fill={MUTED} fontSize={10}>{fmtInt(t)}</text></g>
            ))}
            {hist.map((x) => (
              <g key={x.loops}>
                <rect className="vb" x={xs(x.loops)} y={ys(x.sessions)} width={xs.bandwidth()} height={Math.max(0, h - m.b - ys(x.sessions))} rx={2} fill={SEQ[4]}
                  onPointerEnter={() => tip.show((xs(x.loops) ?? 0) + xs.bandwidth() / 2, ys(x.sessions), `${x.loops} loops: ${fmtInt(x.sessions)} sessions`)} />
                <text x={(xs(x.loops) ?? 0) + xs.bandwidth() / 2} y={h - 6} textAnchor="middle" fill={MUTED} fontSize={10}>{x.loops}</text>
              </g>
            ))}
          </svg>
        );
      }}
    </Chart>
  );
}

function ByIntent({ d }: { d: DashboardData }) {
  const rows = [...d.friction.by_intent].sort((a, b) => b.friction - a.friction);
  return (
    <Chart title="Friction by intent" ratio={2} ratioSm={1.1} empty={rows.length === 0} emptyText="No intent friction yet"
      label={rows[0] ? `Friction by intent. ${cap(rows[0].intent)} is highest at ${fmtPct(rows[0].friction)}.` : "Friction by intent"}
      table={<DataTable caption="Friction by intent" head={["Intent", "Friction", "Sessions"]} rows={rows.map((r) => [r.intent, fmtPct(r.friction, 1), r.n])} />}
      motion={grow(".fb", "x")}>
      {({ w, h }, tip) => {
        const lw = 62, vw = 36;
        const ys = scaleBand<string>().domain(rows.map((r) => r.intent)).range([0, h]).padding(0.28);
        const xs = scaleLinear().domain([0, max(rows, (r) => r.friction) || 1]).range([0, Math.max(10, w - lw - vw)]);
        return (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {rows.map((r) => {
              const y = ys(r.intent) ?? 0, bh = ys.bandwidth();
              return (
                <g key={r.intent} onPointerEnter={() => tip.show(lw + xs(r.friction), y + bh / 2, `${cap(r.intent)}: ${fmtPct(r.friction, 1)} friction, ${fmtInt(r.n)} sessions`)}>
                  <text x={0} y={y + bh / 2} dy="0.35em" fill={MUTED} fontSize={11}>{r.intent}</text>
                  <rect className="fb" x={lw} y={y} width={Math.max(1, xs(r.friction))} height={bh} rx={2} fill={SEQ[4]} />
                  <text x={lw + xs(r.friction) + 5} y={y + bh / 2} dy="0.35em" fill={MUTED} fontSize={10}>{fmtPct(r.friction)}</text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Chart>
  );
}

export function Friction({ d }: { d: DashboardData }) {
  return (
    <div className="stack">
      <BySource d={d} />
      <div className="pair"><Loops d={d} /><ByIntent d={d} /></div>
      <Exposure d={d} />
    </div>
  );
}
