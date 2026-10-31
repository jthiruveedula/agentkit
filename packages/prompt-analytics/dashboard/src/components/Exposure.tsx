import { max } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import type { DashboardData } from "../data/types";
import { fmtDate, fmtInt, fmtPct } from "../lib/format";
import { gsap } from "../lib/motion";
import { GRID, MUTED, SOURCES, srcLabel } from "../lib/palette";
import { Chart, DataTable } from "./Chart";
import { ReviewQueue } from "./ReviewQueue";

type Cat = "secret" | "pii" | "phi";
const CATS: { id: Cat; name: string; color: string }[] = [
  { id: "secret", name: "Secrets", color: "var(--warn-secret)" },
  { id: "pii", name: "PII", color: "var(--warn-pii)" },
  { id: "phi", name: "PHI", color: "var(--warn-phi)" },
];
const STACK: Cat[] = ["pii", "secret", "phi"];
const name = (s: string) => s.replace(/_/g, " ");

export function Exposure({ d }: { d: DashboardData }) {
  const ex = d.exposure;
  const by = new Map(ex.by_category.map((c) => [c.category, c]));
  const clean = ex.sessions === 0;
  const weekly = ex.weekly;
  const srcs = SOURCES.filter((s) => ex.by_kind.some((k) => (k.by_source[s] ?? 0) > 0));
  return (
    <section className="exposure" aria-labelledby="exposure-h" data-reveal>
      {clean ? (
        <div className="clean">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8.5 14.5l3.8 3.8 7.2-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h3 id="exposure-h">No sensitive data detected</h3>
        </div>
      ) : (
        <>
          <h3 id="exposure-h" className="exposure-title">You pasted sensitive data in {fmtInt(ex.sessions)} {ex.sessions === 1 ? "session" : "sessions"}</h3>
          <p className="exposure-sub">{fmtPct(ex.share, 1)} of your sessions</p>
          <ul className="tiles" data-stagger>
            {CATS.map((c) => {
              const row = by.get(c.id);
              return (
                <li key={c.id} className="tile" style={{ "--accent": c.color } as React.CSSProperties}>
                  <span className="tile-n">{fmtInt(row?.sessions ?? 0)}</span>
                  <span className="tile-l">{c.name}</span>
                  {row?.advice ? <span className="tile-a">{row.advice}</span> : null}
                </li>
              );
            })}
          </ul>
          <Chart title="Sessions with findings per week" ratio={3.4} ratioSm={1.5} empty={weekly.length === 0} emptyText="No weekly breakdown"
            label={`Stacked weekly bars of sessions with secrets, PII and PHI findings. ${fmtInt(ex.sessions)} sessions in total.`}
            controls={<ul className="legend">{CATS.map((c) => <li key={c.id} style={{ "--c": c.color } as React.CSSProperties}><span className="sw" />{c.name}</li>)}</ul>}
            table={<DataTable caption="Sessions with findings per week" head={["Week", "Secrets", "PII", "PHI"]} rows={weekly.map((x) => [x.date, x.secret, x.pii, x.phi])} />}
            motion={({ root }) => { gsap.from(root.querySelectorAll(".vb"), { scaleY: 0, transformOrigin: "50% 100%", stagger: { amount: 0.6 }, duration: 0.6, ease: "power3.out", scrollTrigger: { trigger: root, start: "top 80%", once: true } }); }}>
            {({ w, h }, tip) => {
              const m = { l: 26, b: 20, t: 6 };
              const tot = (x: (typeof weekly)[number]) => x.secret + x.pii + x.phi;
              const xs = scaleBand<string>().domain(weekly.map((x) => x.date)).range([m.l, w]).padding(0.25);
              const ys = scaleLinear().domain([0, max(weekly, tot) || 1]).nice().range([h - m.b, m.t]);
              return (
                <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                  {ys.ticks(3).map((t) => <g key={t}><line x1={m.l} x2={w} y1={ys(t)} y2={ys(t)} stroke={GRID} strokeOpacity={0.4} /><text x={m.l - 5} y={ys(t)} dy="0.35em" textAnchor="end" fill={MUTED} fontSize={10}>{t}</text></g>)}
                  {weekly.map((x, i) => {
                    let acc = 0;
                    return (
                      <g key={x.date} onPointerEnter={() => tip.show((xs(x.date) ?? 0) + xs.bandwidth() / 2, ys(tot(x)), `${fmtDate(x.date)}: ${x.secret} secrets, ${x.pii} PII, ${x.phi} PHI`)}>
                        {STACK.map((c) => {
                          const v = x[c]; const y0 = ys(acc); acc += v;
                          return v > 0 ? <rect key={c} className="vb" x={xs(x.date)} y={ys(acc)} width={xs.bandwidth()} height={Math.max(0, y0 - ys(acc))} style={{ fill: CATS.find((k) => k.id === c)!.color }} /> : null;
                        })}
                        {i % Math.ceil(weekly.length / 5) === 0 && <text x={(xs(x.date) ?? 0)} y={h - 5} fill={MUTED} fontSize={10}>{fmtDate(x.date)}</text>}
                      </g>
                    );
                  })}
                </svg>
              );
            }}
          </Chart>
          {ex.by_kind.length > 0 && (
            <div className="tbl-wrap" role="region" aria-label="Findings by kind and source" tabIndex={0}>
              <table className="kinds">
                <thead><tr><th scope="col">Kind</th>{srcs.map((s) => <th key={s} scope="col">{srcLabel(s)}</th>)}<th scope="col">Sessions</th></tr></thead>
                <tbody>
                  {ex.by_kind.map((k) => (
                    <tr key={k.kind}>
                      <th scope="row"><span className="cat-tag" style={{ "--accent": CATS.find((c) => c.id === k.category)?.color } as React.CSSProperties}>{name(k.kind)}</span></th>
                      {srcs.map((s) => <td key={s}>{k.by_source[s] ? fmtInt(k.by_source[s] as number) : "-"}</td>)}
                      <td>{fmtInt(k.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ex.items.length > 0 && <ReviewQueue items={ex.items} />}
        </>
      )}
    </section>
  );
}
