import { useMemo, useRef, useState } from "react";
import { useStore } from "../state";
import { MAX_LOOPS } from "../lib/filter";
import { histogram, median, quantile, topBy } from "../lib/compare";
import { fmtDate, fmtInt, fmtPct } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import { useRoving } from "../lib/hooks";
import { BarList, Card, Cols, DataTable, Empty, Section, Segmented } from "./ui";
import { loopCurve, loopHeadline, LOOP_MIN_N, rephraseEffect, stopRule } from "../lib/loops";
import { useSize } from "../lib/hooks";
import { pts } from "../lib/stats";
import { Repeats } from "./Repeats";

const SIGNALS = [
  { id: "correction", text: "Correction" }, { id: "frustration", text: "Frustration" }, { id: "rephrase", text: "Rephrase" },
  { id: "abandoned", text: "Abandoned" }, { id: "interrupted", text: "Interrupted" },
] as const;

/** One tool in view: its own signal rates as bars, no tool comparison. */
function SignalsOne() {
  const { d, caps } = useStore();
  const x = d.friction.rates.find((r) => r.source === caps.sources[0]);
  if (!x) return null;
  return (
    <Card title="Friction signals" meta={`share of your ${caps.names} prompts with each signal, all sessions`} span={7}>
      <BarList label="Friction signals" rows={SIGNALS.map((sg) => ({ key: sg.id, label: sg.text, value: x[sg.id], color: "var(--accent)", text: fmtPct(x[sg.id], 1), aria: `${sg.text}: ${fmtPct(x[sg.id], 1)} of ${fmtInt(x.n)} prompts` }))} />
      <p className="note">n={fmtInt(x.n)} prompts. Ignores filters.</p>
    </Card>
  );
}

function Signals() {
  const { caps } = useStore();
  return caps.multiTool ? <SignalsMany /> : <SignalsOne />;
}

function SignalsMany() {
  const { d, f, drill, caps } = useStore();
  const rates = d.friction.rates.filter((r) => caps.sources.includes(r.source));
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
          key: x.intent, label: x.intent, value: x.friction, color: "var(--accent)", active: f.intent === x.intent, text: x.friction.toFixed(2), sub: `n=${fmtInt(x.n)}`, mark: mean,
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
          <Cols peak label="Sessions by rephrase loop count. Each column filters those sessions" height={120} cols={v.loops.map((l, i) => ({
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

const reph = (l: string) => `${l} rephrase${l === "1" ? "" : "s"}`;
function LoopBreaker() {
  const { v } = useStore();
  const curve = useMemo(() => loopCurve(v.rows), [v.rows]);
  const rule = stopRule(curve), eff = rephraseEffect(curve), head = loopHeadline(eff);
  const box = useRef<HTMLDivElement>(null), { w } = useSize(box);
  const H = 200, P = { l: 40, r: 12, t: 16, b: 40 }, iw = Math.max(1, w - P.l - P.r), ih = H - P.t - P.b;
  const x = (k: number) => P.l + ((k + 0.5) / curve.length) * iw, y = (r: number) => P.t + (1 - r) * ih;
  const ok = curve.filter((b) => b.enough), total = curve.reduce((a, b) => a + b.n, 0);
  const stop = rule?.stop ?? null, cut = rule?.after ?? null;
  return (
    <Card id="s-loopbreak" title="Loop breaker" meta="applied rate by rephrase count, 95% Wilson CI. Feature, bugfix and refactor sessions with 2+ prompts, in view" span={8}>
      {total === 0 ? <Empty>No feature, bugfix or refactor session with 2 or more prompts in this view.</Empty> : (
        <>
          {head ? <p className="lb-call"><b>{head.text}.</b> Of {fmtInt(head.n)} sessions compared, {fmtInt(eff?.n1 ?? 0)} rephrased (1+ loops) and {fmtInt(eff?.n0 ?? 0)} did not. Harder tasks need more follow-ups, so this is association, not cause.</p>
            : <p className="lb-call">{rule ? <b>Too few sessions with and without a rephrase to compare them.</b> : <>Every loop count has fewer than {LOOP_MIN_N} sessions here, so there is no curve to read.</>}</p>}
          {rule && <p className="lb-eff"><b>Stop rule.</b> {rule.stop && rule.effect ? `${rule.text}: ${fmtPct(rule.stop.rate)} at ${reph(rule.stop.label)} against ${fmtPct(rule.peak.rate)} at ${reph(rule.peak.label)} (${pts(rule.effect.diff)}, 95% CI ${pts(rule.effect.lo).replace(" pts", "")} to ${pts(rule.effect.hi)}).` : "No later bucket is clearly below the best one once both intervals are compared."}</p>}
          <div className="lb" ref={box} style={{ height: H }}>
            {w > 0 && (
              <svg width={w} height={H} aria-hidden="true" focusable="false">
                {[0, 0.5, 1].map((t) => <g key={t}><line className="grid-l" x1={P.l} x2={w - P.r} y1={y(t)} y2={y(t)} /><text className="ax" x={P.l - 6} y={y(t) + 4} textAnchor="end">{fmtPct(t)}</text></g>)}
                {stop && cut !== null && <g><line className="lb-be" x1={(x(cut) + x(cut + 1)) / 2} x2={(x(cut) + x(cut + 1)) / 2} y1={P.t} y2={P.t + ih} /><text className="tr-end lb-bet" x={(x(cut) + x(cut + 1)) / 2 + 6} y={P.t + 10}>lower from here</text></g>}
                {ok.length > 1 && <polyline className="lb-line" fill="none" points={ok.map((b) => `${x(b.k)},${y(b.rate)}`).join(" ")} />}
                {curve.map((b) => (
                  <g key={b.k}>
                    <rect x={x(b.k) - iw / curve.length / 2} y={P.t} width={iw / curve.length} height={ih + 34} fill="transparent"><title>{b.enough ? `${b.label}: ${fmtPct(b.rate)} applied, 95% Wilson CI ${fmtPct(b.lo)} to ${fmtPct(b.hi)}, ${b.ok} of ${fmtInt(b.n)} sessions` : `${b.label}: ${fmtInt(b.n)} sessions, fewer than ${LOOP_MIN_N}, so no rate`}</title></rect>
                    {b.enough ? <><line className="lb-ci" x1={x(b.k)} x2={x(b.k)} y1={y(b.hi)} y2={y(b.lo)} /><circle className="lb-dot" data-be={stop?.k === b.k || undefined} cx={x(b.k)} cy={y(b.rate)} r={5} />
                      {rule?.significant && rule.peak.k === b.k && <text className="tr-end" x={x(b.k)} y={y(b.hi) - 6} textAnchor="middle">peak {fmtPct(b.rate)}</text>}</>
                      : <text className="ax lb-na" x={x(b.k)} y={P.t + ih - 6} textAnchor="middle">{b.n ? "too few" : "none"}</text>}
                    <text className="ax lb-x" x={x(b.k)} y={H - 22} textAnchor="middle">{b.label}</text>
                    <text className="ax" x={x(b.k)} y={H - 6} textAnchor="middle">n={fmtInt(b.n)}</text>
                  </g>
                ))}
              </svg>
            )}
          </div>
          <p className="note">x: rephrase loops in the session; 0 = two or more prompts and none of them a rephrase (follow-ups only). Buckets with n &lt; {LOOP_MIN_N} show no rate. More loops usually means a longer session, so this is association, not cause.</p>
          <DataTable caption="Applied rate by rephrase loops" head={["Loops", "Sessions", "Applied", "Rate", "95% CI"]}
            rows={curve.map((b) => [b.label, b.n, b.ok, b.enough ? fmtPct(b.rate) : "not enough data", b.enough ? `${fmtPct(b.lo)} to ${fmtPct(b.hi)}` : "-"])} />
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
    <Card title="Friction distribution" meta="sessions with a prompt" span={6}>
      {xs.length === 0 ? <Empty /> : (
        <>
          <Cols peak label="Sessions by friction band. Each column filters that band" height={120} cols={h.counts.map((n, i) => {
            const lo = h.edges[i], hi = i === BINS - 1 ? 1 : h.edges[i + 1], on = f.frictionMin !== undefined && Math.abs(f.frictionMin - lo) < 1e-9;
            return { key: String(i), label: String(i), segs: [{ v: n, color: "var(--accent)" }], active: on,
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
  const { v, openSession, caps } = useStore();
  const multi = caps.multiTool;
  const rows = useMemo(() => topBy(v.rows, "friction", 10, 3), [v.rows]);
  return (
    <Card title="Highest friction sessions" meta="3+ prompts, top 10" span={6}>
      {rows.length === 0 ? <Empty>No session with 3 or more prompts.</Empty> : (
        <ol className="outl">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => openSession(r.id)} aria-label={`Open session: ${r.title || r.id}, friction ${r.friction.toFixed(2)}`}>
                {multi && <span className="sw" style={{ "--c": srcColor(r.source) } as React.CSSProperties} />}
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
      <Signals /><ByIntent /><LoopBreaker /><Loops /><Repeats /><Distribution /><Outliers />
    </Section>
  );
}
