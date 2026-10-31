import { useMemo, useState } from "react";
import { useStore } from "../state";
import { MAX_LOOPS } from "../lib/filter";
import { histogram, median, quantile, topBy } from "../lib/compare";
import { fmtDate, fmtInt, fmtPct } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import { useRoving } from "../lib/hooks";
import { BarList, Card, Cols, DataTable, Empty, Section, Segmented } from "./ui";

const SIGNALS = [
  { id: "correction", text: "Correction" }, { id: "frustration", text: "Frustration" }, { id: "rephrase", text: "Rephrase" },
  { id: "abandoned", text: "Abandoned" }, { id: "interrupted", text: "Interrupted" },
] as const;

function Signals() {
  const { d, f, drill } = useStore();
  const rates = d.friction.rates;
  const srcs = SOURCES.filter((s) => rates.some((r) => r.source === s));
  const peak = Math.max(...rates.flatMap((r) => SIGNALS.map((s) => r[s.id])), 0.01);
  const { group, mark } = useRoving(SIGNALS.length * srcs.length, 1, Math.max(1, srcs.length));
  return (
    <Card title="Signals by tool" meta="share of prompts with each signal, all sessions" span={7}>
      {rates.length === 0 ? <Empty /> : (
        <>
          <div className="strips" role="group" aria-label="Friction signals by tool. Each dot filters that tool" {...group} data-sel={f.source ? "1" : undefined}>
            {SIGNALS.map((sg, r) => (
              <div key={sg.id} className="strip">
                <span className="strip-l">{sg.text}</span>
                <span className="strip-t">
                  {srcs.map((s, c) => {
                    const x = rates.find((q) => q.source === s)!, val = x[sg.id];
                    return (
                      <button key={s} type="button" className="dot" data-on={f.source === s || undefined} aria-pressed={f.source === s} style={{ left: `${(val / peak) * 100}%`, "--c": srcColor(s) } as React.CSSProperties}
                        aria-label={`${srcLabel(s)}, ${sg.text.toLowerCase()}: ${fmtPct(val, 1)} of ${fmtInt(x.n)} prompts. Filter to this tool`} title={`${srcLabel(s)}: ${fmtPct(val, 1)}`}
                        onClick={() => drill({ source: s })} {...mark(r * srcs.length + c)} />
                    );
                  })}
                </span>
              </div>
            ))}
            <div className="strip"><span className="strip-l" /><span className="strip-x"><b>0%</b><b>{fmtPct(peak)}</b></span></div>
          </div>
          <ul className="legend">{srcs.map((s) => <li key={s} style={{ "--c": srcColor(s) } as React.CSSProperties}>{srcLabel(s)}</li>)}</ul>
          <DataTable caption="Friction signals by tool" head={["Tool", ...SIGNALS.map((s) => s.text), "Prompts"]} rows={rates.map((r) => [srcLabel(r.source), ...SIGNALS.map((s) => fmtPct(r[s.id], 1)), r.n])} />
        </>
      )}
    </Card>
  );
}

function ByIntent() {
  const { d, v, f, drill } = useStore();
  const rows = v.frictionByIntent, tot = rows.reduce((a, r) => a + r.n, 0);
  const mean = tot ? rows.reduce((a, r) => a + r.friction * r.n, 0) / tot : 0;
  return (
    <Card title="Friction by intent" meta={d.engine.methods.friction ?? "mean friction, 0 to 1"} span={5}>
      {rows.length === 0 ? <Empty /> : (
        <BarList label="Friction by intent" max={1} rows={rows.map((x) => ({
          key: x.intent, label: x.intent, value: x.friction, color: "var(--bad)", active: f.intent === x.intent, text: x.friction.toFixed(2), sub: `n=${fmtInt(x.n)}`, mark: mean,
          aria: `${x.intent}: friction ${x.friction.toFixed(2)}, n=${x.n}. Filter to this intent`, onClick: () => drill({ intent: x.intent as never }),
        }))} />
      )}
      {rows.length > 0 && <p className="note">Tick = overall mean {mean.toFixed(2)}.</p>}
    </Card>
  );
}

function Loops() {
  const { v, f, drill } = useStore();
  const [cum, setCum] = useState(false);
  const total = v.loops.reduce((a, l) => a + l.sessions, 0);
  const vals = v.loops.map((l, i) => (cum ? v.loops.slice(i).reduce((a, x) => a + x.sessions, 0) : l.sessions));
  return (
    <Card title="Rephrase loops" meta="sessions by loop count" span={4}
      actions={<Segmented label="Loop view" value={cum ? "cum" : "count"} onChange={(x) => setCum(x === "cum")} options={[{ id: "count", text: "Count" }, { id: "cum", text: "Cumulative" }]} />}>
      {total === 0 ? <Empty /> : (
        <>
          <Cols label="Sessions by rephrase loop count. Each column filters those sessions" height={120} cols={v.loops.map((l, i) => ({
            key: String(l.loops), label: String(l.loops), segs: [{ v: vals[i], color: "var(--accent)" }], active: f.loops === l.loops,
            aria: `${cum ? "at least " : ""}${l.loops >= MAX_LOOPS ? `${MAX_LOOPS}+` : l.loops} loops: ${vals[i]} sessions. Filter`, onClick: l.sessions ? () => drill({ loops: l.loops }) : undefined,
          }))} />
          <div className="axis"><span>0 loops</span><span>{MAX_LOOPS}+ loops</span></div>
          <DataTable caption="Rephrase loops" head={["Loops", "Sessions"]} rows={v.loops.map((l, i) => [l.loops, vals[i]])} />
        </>
      )}
    </Card>
  );
}

const BINS = 10;
function Distribution() {
  const { v, f, drill } = useStore();
  const xs = useMemo(() => v.rows.filter((r) => r.prompts > 0).map((r) => r.friction), [v.rows]);
  const h = useMemo(() => histogram(xs, BINS, 0, 1), [xs]);
  return (
    <Card title="Friction distribution" meta="sessions with a prompt" span={4}>
      {xs.length === 0 ? <Empty /> : (
        <>
          <Cols label="Sessions by friction band. Each column filters that band" height={120} cols={h.counts.map((n, i) => {
            const lo = h.edges[i], hi = i === BINS - 1 ? 1 : h.edges[i + 1], on = f.frictionMin !== undefined && Math.abs(f.frictionMin - lo) < 1e-9;
            return { key: String(i), label: String(i), segs: [{ v: n, color: `var(--${lo >= 0.6 ? "bad" : lo >= 0.3 ? "warn" : "accent"})` }], active: on,
              aria: `Friction ${lo.toFixed(1)} to ${hi.toFixed(1)}: ${n} sessions. Filter`, onClick: n ? () => drill({ frictionMin: +lo.toFixed(2), frictionMax: +hi.toFixed(2) }) : undefined };
          })} />
          <div className="axis"><span>0</span><span>1</span></div>
          <p className="note">Median {median(xs).toFixed(2)}, p90 {quantile(xs, 0.9).toFixed(2)}, n={fmtInt(xs.length)}.</p>
          <DataTable caption="Friction distribution" head={["Band", "Sessions"]} rows={h.counts.map((n, i) => [`${h.edges[i].toFixed(1)} to ${h.edges[i + 1].toFixed(1)}`, n])} />
        </>
      )}
    </Card>
  );
}

function Outliers() {
  const { v, openSession } = useStore();
  const rows = useMemo(() => topBy(v.rows, "friction", 10, 3), [v.rows]);
  return (
    <Card title="Highest friction sessions" meta="3+ prompts, top 10" span={4}>
      {rows.length === 0 ? <Empty>No session with 3 or more prompts.</Empty> : (
        <ol className="outl">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => openSession(r.id)} aria-label={`Open session: ${r.title || r.id}, friction ${r.friction.toFixed(2)}`}>
                <span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />
                <span className="ol-t">{r.title || "Untitled session"}</span>
                <span className="meta">{fmtDate(r.date)} · {r.prompts}p</span>
                <b className="num">{r.friction.toFixed(2)}</b>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function Friction() {
  return (
    <Section id="s-friction" title="Friction" q="Where do you fight the tool?">
      <Signals /><ByIntent /><Loops /><Distribution /><Outliers />
    </Section>
  );
}
