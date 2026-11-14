import { useMemo, useRef } from "react";
import { useStore } from "../state";
import { median, quantile } from "../lib/compare";
import { fmtInt, fmtPct } from "../lib/format";
import { BarList, Card, DataTable, Empty, Section } from "./ui";
import { loopCurve, LOOP_MIN_N, stopRule } from "../lib/loops";
import { useSize } from "../lib/hooks";
import { pts } from "../lib/stats";
import { Repeats } from "./Repeats";
import { Dumb } from "./Time";
import type { SessionRow } from "../data/types";
import "./investigate.css";
import "./polish.css";

const SIGNALS = [
  { id: "correction", text: "Correction" }, { id: "frustration", text: "Frustration" }, { id: "rephrase", text: "Rephrase" },
  { id: "abandoned", text: "Abandoned" }, { id: "interrupted", text: "Interrupted" },
] as const;

/** Share of prompts with each friction signal, pooled over the tools in view (weighted by prompts). Bars scale to the largest. */
function Signals() {
  const { d, caps } = useStore();
  const rs = d.friction.rates.filter((r) => caps.sources.includes(r.source)), n = rs.reduce((a, r) => a + r.n, 0);
  const top = n === 0 ? null : SIGNALS.map((sg) => ({ sg, x: rs.reduce((a, r) => a + r[sg.id] * r.n, 0) / n })).reduce((a, b) => (b.x > a.x ? b : a));
  return (
    <Card so={top ? <>{top.sg.text} is your top struggle signal: <b>{fmtPct(top.x)}</b> of prompts.</> : <>Nothing flagged in this window.</>} thin={!top} src={`friction.rates \u00b7 n ${fmtInt(n)} prompts`} title="Signals behind struggle" meta="share of prompts with each signal, all sessions" span={7}>
      {n === 0 ? <Empty /> : (
        <BarList label="Friction signals" rows={SIGNALS.map((sg) => { const x = rs.reduce((a, r) => a + r[sg.id] * r.n, 0) / n;
          return { key: sg.id, label: sg.text, value: x, color: sg.id === "rephrase" ? "var(--accent)" : "var(--prior)", text: fmtPct(x, 1), aria: `${sg.text}: ${fmtPct(x, 1)} of ${fmtInt(n)} prompts` }; })} />
      )}
    </Card>
  );
}

/** Mean rephrase loops per session by intent, previous period against now. More retries = red. */
function ByIntent() {
  const { v, prior, setView, goto } = useStore();
  const fr = v.rows.filter((r) => r.prompts > 0).map((r) => r.friction);
  const mean = (rows: SessionRow[], k: string) => { const xs = rows.filter((r) => r.intent === k && r.prompts > 0); return xs.length ? xs.reduce((a, r) => a + r.loops, 0) / xs.length : null; };
  const rows = v.frictionByIntent.map((x) => ({ k: x.intent, n: x.n, b: mean(v.rows, x.intent) ?? 0, a: prior ? mean(prior.v.rows, x.intent) : null }));
  const max = Math.max(...rows.flatMap((x) => [x.a ?? 0, x.b]), 0.5) * 1.15;
  const worst = rows.length ? rows.reduce((a, b) => (b.b > a.b ? b : a)) : null;
  const so = worst ? <>{worst.k} retries most: <b className={worst.a !== null && worst.b - worst.a >= 0.15 ? "bad" : undefined}>{worst.b.toFixed(1)}</b> per session{worst.a !== null ? `, was ${worst.a.toFixed(1)}` : ""}.</> : <>Nothing flagged in this window.</>;
  return (
    <Card so={so} thin={!worst} src={`friction.by_intent \u00b7 n ${fmtInt(rows.reduce((a, x) => a + x.n, 0))}`} title="Retries by intent" meta={prior ? "before \u2192 now, mean retries per session" : "mean retries per session"} span={5}>
      {rows.length === 0 ? <Empty /> : (
        <>
          <Dumb median sort max={max} rows={rows.map((x) => ({ k: x.k, label: x.k, name: x.k, a: x.a, b: x.b, fa: x.a === null ? "" : x.a.toFixed(1), fb: x.b.toFixed(1), bad: x.a !== null && Math.abs(x.b - x.a) >= 0.15 ? x.b > x.a : null }))} />
          <p className="note">Sessions: {rows.map((x) => `${x.k} ${x.n}`).join(", ")}.</p>
          {fr.length > 0 && <>
            <p className="note">Median session friction {median(fr).toFixed(2)}, p90 {quantile(fr, 0.9).toFixed(2)}, n={fmtInt(fr.length)}.</p>
            <button type="button" className="btn" onClick={() => { setView({ so: "friction-d", pg: 1 }); requestAnimationFrame(() => goto("s-sessions")); }}>Sort sessions by friction</button>
          </>}
          <DataTable caption="Mean retries per session by intent" head={["Intent", "Now", "Before"]} rows={rows.map((x) => [x.k, x.b.toFixed(2), x.a === null ? "-" : x.a.toFixed(2)])} />
        </>
      )}
    </Card>
  );
}

const reph = (l: string) => `${l} rephrase${l === "1" ? "" : "s"}`;
function LoopBreaker() {
  const { v } = useStore();
  const curve = useMemo(() => loopCurve(v.rows), [v.rows]);
  const rule = stopRule(curve);
  const box = useRef<HTMLDivElement>(null), { w } = useSize(box);
  const H = 200, P = { l: 40, r: 12, t: 16, b: 40 }, iw = Math.max(1, w - P.l - P.r), ih = H - P.t - P.b;
  const x = (k: number) => P.l + ((k + 0.5) / curve.length) * iw, y = (r: number) => P.t + (1 - r) * ih;
  const ok = curve.filter((b) => b.enough), total = curve.reduce((a, b) => a + b.n, 0);
  const stop = rule?.stop ?? null, cut = rule?.after ?? null;
  const few = iw / curve.length < 56 ? "few" : "too few";   // narrow columns (375px): "too few too few" ran together
  const maxN = Math.max(...curve.map((b) => b.n), 0);
  const so = total === 0 ? <>Nothing flagged in this window.</>
    : !rule ? <>Not enough sessions yet: {fmtInt(maxN)} of {LOOP_MIN_N} needed.</>
    : rule.stop ? <>After <b>{rule.after}</b> rephrases, applied rate drops to {fmtPct(rule.stop.rate)}: restart instead.</>
    : <>No rephrase count clearly lowers your applied rate yet.</>;
  return (
    <Card so={so} thin={total === 0 || !rule} id="s-loopbreak" title="Loop breaker" meta="applied rate by rephrase count, 95% Wilson CI. Feature, bugfix and refactor sessions with 2+ prompts, in view" span={12}>
      {total === 0 ? <Empty>No feature, bugfix or refactor session with 2 or more prompts in this view.</Empty> : (
        <>
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
                      : <text className="ax lb-na" x={x(b.k)} y={P.t + ih - 6} textAnchor="middle">{b.n ? few : "none"}</text>}
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

export function Friction() {
  return (
    <Section id="s-friction" title="Friction" q="Where do you fight the tool?">
      <Signals /><ByIntent /><LoopBreaker /><Repeats />
    </Section>
  );
}
