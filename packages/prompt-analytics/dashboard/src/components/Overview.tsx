import { useMemo, useState } from "react";
import { useStore } from "../state";
import { delta } from "../lib/compare";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtSigned, fmtUSD } from "../lib/format";
import { Empty, Segmented } from "./ui";
import { Recommend, useNext, useRowOps } from "./Recommend";
import { CopySummary } from "./CopySummary";
import { WrappedButton } from "./Wrapped";
import { TrendToggles, WeekChart, type Metric, type Ref, type View } from "./Trend";
import { briefing, type Briefing } from "../lib/briefing";
import { topDrivers } from "../lib/attribute";
import { struggledRate, type Rate } from "../lib/metrics";
import { sumTotal } from "../lib/baseline";
import { addDays, applyFilter, isEmpty, openExposure } from "../lib/filter";
import { basis, oneIn, segCount, verdict, type Basis, type Verdict } from "../lib/brief";
import { MIN_N, pts } from "../lib/stats";
import { story } from "../lib/story";
import { movers, type Mover } from "../lib/movers";
import { kpiDeltas } from "../lib/mix";
import { whereDims } from "../lib/summary";
import type { SessionRow, Source } from "../data/types";
import { KeyNumbers, UsageMix } from "./KeyNumbers";
import "./story.css";

/** Top 5 projects, tools or intents by share of priced cost (tokens when unpriced). One denominator for every row (lib/share.ts), a fixed 0-100% track,
 *  an "Other" row so the list adds to 100%, and per-row mean friction (vs the median of the group) and cost per session. A row filters the page to it. */
function WhereWent() {
  const { v, caps, drill, goto } = useStore();
  const dims = useMemo(() => whereDims(v, caps, 5), [v, caps]);
  const [pick, setPick] = useState<string>("projects");
  if (!dims.length) return null;
  const dm = dims.find((x) => x.id === pick) ?? dims[0];
  const text = (x: number) => (dm.byCost ? fmtUSD(x) : `${fmtCompact(x)} tok`);
  const filterOf = (id: string, key: string) => (id === "tools" ? { source: key as Source } : id === "intents" ? { intent: key as never } : { project: key });
  const fr = (x: number | null) => (x === null ? "–" : x.toFixed(2)), vs = (x: number | null) => (x === null ? "" : fmtSigned(x, 2));
  const o = dm.outlier;
  return (
    <Panel id="s-where" src="priced cost share · one denominator" title="Where it went" meta={`top ${dm.rows.length} by ${dm.note}${dm.byCost ? "" : " (nothing priced, so tokens stand in)"}; one click filters`} span={12}
      actions={dims.length > 1 ? <Segmented quiet label="Break down by" value={dm.id} onChange={setPick} options={dims.map((x) => ({ id: x.id, text: x.name }))} /> : undefined}>
      <div className="wh" role="group" aria-label={`${dm.name} by ${dm.note}`}>
        <div className="wh-r wh-h" aria-hidden="true"><span>{dm.name.slice(0, -1)}</span><span className="wh-t">0 to 100%</span><span className="wh-v">{dm.byCost ? "Cost · share" : "Tokens · share"}</span><span className="wh-f">Friction (vs median)</span><span className="wh-p">{dm.byCost ? "$ / session" : "tok / session"}</span></div>
        {dm.rows.map((r) => (
          <button key={r.key} type="button" className="wh-r wh-b" aria-pressed={undefined} disabled={!r.filterable} style={{ "--w": r.share } as React.CSSProperties}
            onClick={() => drill(filterOf(dm.id, r.key))}
            aria-label={`${r.label}: ${text(r.value)}, ${fmtPct(r.share)} of ${dm.note.replace("share of ", "")}, friction ${fr(r.friction)}${r.vsMedian === null ? "" : `, ${vs(r.vsMedian)} against the median`}, ${fmtInt(r.sessions)} sessions.${r.filterable ? " Filter" : " Cannot be filtered"}`}>
            <span className="wh-l" title={r.label}>{r.label}</span>
            <span className="bar-t wh-t" aria-hidden="true"><i /></span>
            <span className="wh-v"><b>{text(r.value)}</b> · {fmtPct(r.share)}</span>
            <span className="wh-f">{fr(r.friction)}{r.vsMedian !== null && <small data-up={r.vsMedian > 0.05 || undefined}> {vs(r.vsMedian)}</small>}</span>
            <span className="wh-p">{r.perSession === null ? "–" : dm.byCost ? fmtUSD(r.perSession) : fmtCompact(r.perSession)}</span>
          </button>
        ))}
        {dm.other && (
          <div className="wh-r wh-o" style={{ "--w": dm.other.share } as React.CSSProperties} aria-label={`${dm.other.n} more: ${fmtPct(dm.other.share)}`}>
            <span className="wh-l">Other ({dm.other.n})</span><span className="bar-t wh-t" aria-hidden="true"><i /></span><span className="wh-v"><b>{text(dm.other.value)}</b> · {fmtPct(dm.other.share)}</span><span className="wh-f" /><span className="wh-p" />
          </div>
        )}
      </div>
      {o && <p className="wh-out"><b>{o.label}</b> is the friction outlier ({fr(o.friction)}, {vs(o.vsMedian)} vs the median {fr(dm.median)}). <button type="button" className="link" onClick={() => goto("s-friction")}>See Friction</button> · <button type="button" className="link" onClick={() => goto("s-next")}>See Do next</button></p>}
      <p className="note">Shares are of {dm.byCost ? "priced cost" : "all tokens"} in this view ({text(dm.total)}).{dm.unpriced ? ` ${fmtInt(dm.unpriced.n)} of ${fmtInt(dm.unpriced.of)} sessions are unpriced: excluded from cost, not counted as $0.` : ""}{dm.id === "projects" && dm.rows.some((r) => !r.filterable) ? " Sessions with no project cannot be filtered to." : ""}</p>
    </Panel>
  );
}


/** Card with a hover source chip (`data-src`, see styles.css). ponytail: ui.tsx Card has no such prop and is not ours; fold into Card when it does. */
function Panel({ id, title, meta, src, span, actions, children }: { id?: string; title: string; meta?: React.ReactNode; src: string; span: 4 | 8 | 12; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`card s${span}`} id={id} role="group" aria-label={title} data-src={src}>
      <header className="card-h"><h3>{title}</h3>{meta ? <span className="meta">{meta}</span> : null}{actions ? <span className="card-acts">{actions}</span> : null}</header>
      {children}
    </div>
  );
}

type Scope = { from?: string };
/** The struggled comparison on the basis, computed once: the Brief and the weekly chart read the same verdict. */
type Cmp = { now: Rate; prev: Rate | null; vd: Verdict };

/** CI bar geometry on a `w`-px track (6px padding each side): x of zero, of the interval ends and of the point estimate. The domain always holds 0. */
export function ciGeom(lo: number, hi: number, d: number, w = 120, pad = 6) {
  const a = Math.min(0, lo), b = Math.max(0, hi), k = (w - 2 * pad) / (b - a || 1), x = (v: number) => +(pad + (v - a) * k).toFixed(1);
  return { zero: x(0), x0: x(lo), x1: x(hi), dot: x(d) };
}
const CI_W = 120;
/** The change and its likely range as a bar: a labelled zero tick, the interval, the estimate as a dot. Decorative; the caption beside it carries the numbers. */
function CiBar({ lo, hi, d }: { lo: number; hi: number; d: number }) {
  const g = ciGeom(lo, hi, d, CI_W);
  return (
    <svg className="ci-bar" width={CI_W} height={28} viewBox={`0 0 ${CI_W} 28`} aria-hidden="true" focusable="false">
      <line className="ci-axis" x1={0} x2={CI_W} y1={8} y2={8} />
      <rect className="ci-rng" x={g.x0} y={5} width={Math.max(2, g.x1 - g.x0)} height={6} rx={3} />
      <line className="ci-zero" x1={g.zero} x2={g.zero} y1={1} y2={15} />
      <circle className="ci-dot" cx={g.dot} cy={8} r={4} />
      <text className="ci-0" x={g.zero} y={26} textAnchor="middle">0</text>
    </svg>
  );
}
/** "1 session", "2 sessions". */
const nSess = (n: number) => `${fmtInt(n)} session${n === 1 ? "" : "s"}`;

/** Briefing: the struggled rate, what it is compared against, how sure the change is, and the driver once. Honest copy for every state. */
function Brief({ b, bs, cmp: { now, prev, vd }, win, scope, all: unDated }: { b: Briefing; bs: Basis; cmp: Cmp; win: number; scope: Scope; all: SessionRow[] }) {
  const { d, v, f, ids, apply, clear, win: wn } = useStore();
  const rows = useNext(), ops = useRowOps();
  const openIds = useMemo(() => openExposure(d), [d]);
  // the Key numbers tiles' verdicts on the same basis (lib/mix): an Also moved chip with a tile is grey when its tile is (mixed, within range),
  // and dropped when its tile shows no change, so the brief never reads as a win the tile below calls mixed
  const dl = useMemo(() => kpiDeltas(bs, wn, openIds), [bs, wn, openIds]);
  const tiled = (id: Mover["id"]): id is "applied" | "cpa" | "sessions" => id === "applied" || id === "cpa" || id === "sessions";
  const greyOf = (m: Mover) => (tiled(m.id) ? dl[m.id]?.grey : undefined);
  const dd = vd.d;
  const real = vd.kind === "clear" || vd.kind === "early", up = vd.dir === "up";
  const tone = real ? (up ? "bad" : "good") : "flat";
  const pct = (x: number) => fmtPct(x, 1);
  const drv = real ? b.drivers?.headline ?? null : null;
  const top = rows[0], topN = top ? ops.count(top) : 0, topSec = top ? ops.sec(top) : null;
  const st = useMemo(() => story(bs.cur), [bs]);
  // raw session counts are not comparable across a 4-week vs a 22-week split, so the Sessions mover only runs against an equal prior window
  const all = useMemo(() => movers(bs.cur, bs.base, 5).filter((m) => (bs.mode !== "split" || m.id !== "sessions") && (!tiled(m.id) || dl[m.id] !== undefined)).slice(0, 2), [bs, dl]);
  // a grey (mixed / within range) change never leads the headline
  const lead = vd.kind === "noise" ? all.find((m) => !greyOf(m)) : undefined, mv = all.filter((m) => m !== lead);
  const toneOf = (g: boolean | null) => (g === null ? "flat" : g ? "good" : "bad");
  const n = bs.cur.length, p = now.p;
  const head = p === null ? (n ? `${fmtInt(n)} session${n === 1 ? "" : "s"}, none with a prompt${bs.mode === "split" ? " in the last 4 weeks" : ""}` : bs.mode === "split" ? "No prompts in the last 4 weeks" : "No prompts in this window")
    : vd.kind === "none" ? (p === 0 ? "No sessions struggled" : `Struggling at ${pct(p)}: ${oneIn(p)} sessions`)
    : real ? (bs.mode === "split" ? `Struggling ${up ? "rose" : "fell"} in the last 4 weeks` : up ? "More sessions are struggling" : "Fewer sessions are struggling")
    : lead ? `${lead.label} ${lead.text}; struggling held` : `Struggling held at about ${pct(p)}`;
  const was = vd.kind !== "none" && prev?.p != null ? prev.p : null;
  const last = p === null ? unDated.reduce((m, r) => (r.prompts > 0 && r.date > m ? r.date : m), "") : "";
  const dated = f.from !== undefined || f.to !== undefined;
  // "1 in 3" vs "1 in 3" reads as no change, so equal phrasings fall back to percentages; CI ends sign off the rounded value (never "-0.0")
  const fr = was !== null && p !== null && oneIn(p) === oneIn(was) ? pct : oneIn, end = (x: number) => pts(x, 1).replace(" pts", "");
  const k = (r: number | null, nn: number) => Math.round((r ?? 0) * nn);
  const drvN = drv ? segCount(bs.cur, drv) : 0;
  // each story row: its sentence, then one compact "Open N sessions" action (the driver drill is the single primary)
  const why = drv ? (
    <><span className="b-say"><b>{drv.key}</b>: {k(drv.r1, drv.n1)} of its {nSess(drv.n1)} struggled, {(drv.r1 ?? 0) < (drv.r0 ?? 0) ? "down" : "up"} from {k(drv.r0, drv.n0)} of {fmtInt(drv.n0)}.</span>{" "}
      {drvN > 0 && <button type="button" className="btn primary b-act" onClick={() => apply({ ...(drv.project !== undefined ? { project: drv.project } : {}), ...(drv.intent ? { intent: drv.intent as never } : {}), ...scope }, { list: true })}
        aria-label={`Open ${nSess(drvN)}: ${drv.key}`}>Open {nSess(drvN)}</button>}</>
  ) : st.why && <span className="b-say">{st.why}</span>;
  const sure = vd.kind === "noise" ? "could be" : "likely";
  return (
    <section className="s12 brief" aria-labelledby="ov-hd" data-tone={tone}>
      <div className="b-top">
        <p className="eyebrow"><i className="b-dot" aria-hidden="true" />{vd.eyebrow}</p>
        <span className="b-basis">{bs.label ? `${bs.label} · ` : ""}{win} days</span>
        <span className="b-acts"><WrappedButton /><CopySummary /></span>
      </div>
      <h3 id="ov-hd">{head}</h3>
      <div className="lead">
        {p !== null ? (
          <>
            <p className="b-n">
              <button type="button" className="b-num" onClick={() => apply({ struggled: true, ...scope }, { list: true })}
                aria-label={`${pct(p)} of sessions struggled${bs.mode === "split" ? " in the last 4 weeks" : ""}. Open the ${fmtInt(now.k)} struggled sessions`}>{pct(p)}</button>
              {was !== null && <span className="was">{real && <span aria-hidden="true">{up ? "↑" : "↓"} </span>}from {pct(was)}</span>}
            </p>
            <p className="b-cap">of sessions struggled: <span className="nw">{fr(p)}</span>{was !== null && <>, {vd.kind === "noise" ? "about the same as" : up ? "up from" : "down from"} <span className="nw">{fr(was)}</span></>}</p>
            {dd && prev && (
              <p className="ci" title={`${pts(dd.diff, 1)}, ${sure} ${end(dd.lo)} to ${end(dd.hi)} pts (95% interval). Sessions with a prompt: ${fmtInt(now.n)} now, ${fmtInt(prev.n)} before`}>
                <b className="ci-pt">{pts(dd.diff, 1)}</b> <CiBar lo={dd.lo} hi={dd.hi} d={dd.diff} /> <span className="ci-n">{sure} {end(dd.lo)} to {end(dd.hi)}</span>
              </p>
            )}
            {dd && prev && <p className="b-foot">{fmtInt(now.n)} vs {fmtInt(prev.n)} sessions with a prompt</p>}
            {vd.kind === "none" && <p className="b-foot">{prev ? `Too few sessions with a prompt to compare yet (${fmtInt(now.n)} vs ${fmtInt(prev.n)})` : "No earlier window to compare yet"}</p>}
          </>
        ) : (
          <>
            {last && <p className="b-cap">Last prompt {fmtDate(last)}</p>}
            {dated ? <button type="button" className="btn" onClick={() => apply({ from: undefined, to: undefined })}>Show all time</button>
              : !isEmpty(f) && <button type="button" className="btn" onClick={() => clear()}>Clear filters</button>}
          </>
        )}
      </div>
      {(why || top || mv.length > 0) && (
        <div className="b-side">
          {(why || top) && (
            <dl className="story">
              {why && <div><dt>{drv ? "Why" : "Why it matters"}</dt><dd>{why}</dd></div>}
              {top && (
                <div><dt>Do next</dt><dd><span className="b-say">{top.action}</span>
                  {/* the same button as row 1 of Do next; an action that would open 0 sessions is hidden, not offered */}
                  {top.filter && topN > 0 ? <button type="button" className="btn b-act" onClick={() => ops.open(top)} aria-label={`Open ${nSess(topN)} behind: ${top.action}`}>Open {nSess(topN)}</button>
                    : topSec && <button type="button" className="btn b-act" onClick={() => ops.see(top)} aria-label={`See ${topSec.title}: evidence for ${top.action}`}>See {topSec.title}</button>}
                </dd></div>
              )}
            </dl>
          )}
          {mv.length > 0 && (
            <p className="movers"><span className="meta">Also moved</span>
              {mv.map((m) => {
                // the arrow carries the sign: "↓43%", never "↓ -43%"
                const g = greyOf(m), up = !m.text.startsWith("-"), mag = m.text.replace(/^[+-]/, ""), mf = m.filter;
                const body = <>{m.label} <b data-tone={g ? "flat" : toneOf(m.good)}><span aria-hidden="true">{up ? "↑" : "↓"}</span><span className="sr-only">{up ? "up " : "down "}</span>{mag}</b>{g && <span className="mv-g"> {g}</span>}</>;
                return mf ? <button key={m.id} type="button" className="tag" onClick={() => apply({ ...mf, ...scope }, { list: true })} aria-label={`${m.label} ${up ? "up" : "down"} ${mag}${g ? `, ${g}` : ""} vs the earlier window. Open these sessions`}>{body}</button>
                  : <span key={m.id} className="tag">{body}</span>;
              })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Drivers({ b, scope, label, rows: cur }: { b: Briefing; scope: Scope; label?: string; rows: SessionRow[] }) {
  const { apply } = useStore();
  const a = b.drivers;
  const rows = a ? topDrivers(a) : [], tot = sumTotal(rows), top = Math.max(1e-9, ...rows.map((r) => Math.abs(r.total)), Math.abs(tot));
  const k = (r: number | null, n: number) => fmtInt(Math.round((r ?? 0) * n));
  const h = a?.headline;
  return (
    <Panel id="s-driver" title={a && rows.length ? `Where the ${pts(a.delta, 1)} came from` : "Where the change came from"} meta={`${label ? `${label}. ` : ""}Points each row added to the change; right is worse`} span={12} src={h ? `attribution · n ${h.n1} vs ${h.n0}` : "attribution · project × intent"}>
      {!rows.length ? <Empty>Needs an earlier window with prompts in both periods.</Empty> : (
        <>
          {/* the zero line sits mid-track only when both signs occur; one-sided, the empty half shrinks to 20% */}
          <ul className="drv" data-side={!rows.some((r) => r.total < 0) && tot >= 0 ? "pos" : !rows.some((r) => r.total > 0) && tot <= 0 ? "neg" : undefined} aria-label="Signed share of the change, in points">
            {rows.map((r) => {
              const body = <>
                <span><b>{r.key === "Other" ? "All other work" : r.key}</b>{h && r.key === h.key && <em className="drv-why">In the brief</em>}<small>{k(r.r1, r.n1)}/{fmtInt(r.n1)} vs {k(r.r0, r.n0)}/{fmtInt(r.n0)}</small></span>
                <span className="dv" data-neg={r.total < 0 || undefined} style={{ "--w": Math.abs(r.total) / top } as React.CSSProperties}><i aria-hidden="true" /><b className="n">{pts(r.total, 1)}</b></span>
              </>;
              return (
                <li key={r.key} data-tone={r.total > 0 ? "bad" : r.total < 0 ? "good" : "flat"} data-why={(h && r.key === h.key) || undefined}>
                  {r.key !== "Other" && (r.project || r.intent) ? (
                    <button type="button" onClick={() => apply({ ...(r.project ? { project: r.project } : {}), ...(r.intent ? { intent: r.intent as never } : {}), ...scope }, { list: true })}
                      aria-label={`${r.key}: ${pts(r.total, 1)} of the change. Open these sessions`}>{body}</button>
                  ) : body}
                </li>
              );
            })}
            <li className="drv-t" data-tone={tot > 0 ? "bad" : tot < 0 ? "good" : "flat"}>
              <span><b>Total</b><small>sum of the rows above</small></span>
              <span className="dv" data-neg={tot < 0 || undefined} style={{ "--w": Math.abs(tot) / top } as React.CSSProperties}><i aria-hidden="true" /><b className="n">{pts(tot, 1)}</b></span>
            </li>
          </ul>
          {h && <button type="button" className="btn b-act" onClick={() => apply({ project: h.project, ...(h.intent ? { intent: h.intent as never } : {}), ...scope }, { list: true })}
            aria-label={`Open ${nSess(segCount(cur, h))}: ${h.key}`}>Open {nSess(segCount(cur, h))}</button>}
        </>
      )}
    </Panel>
  );
}

export function Overview() {
  const { d, f, v, prior, win, exposed, caps, cmp } = useStore();
  const [metric, setMetric] = useState<Metric>("struggled");
  const [view, setView] = useState<View>("area");
  const t = d.totals;
  const all = useMemo(() => applyFilter(d.sessions, { ...f, from: undefined, to: undefined }, openExposure(d)), [d, f]);
  const b = useMemo(() => briefing(v.rows, prior ? prior.v.rows : null, { all, exposed: exposed.size }), [all, v, prior, exposed]);
  // the Brief and Drivers compare on the basis (prior window, or last 4 weeks vs the rest); the Trend panel keeps the full window
  const bs = useMemo(() => basis(v.rows, prior, win, cmp), [v.rows, prior, win, cmp]);
  const bb = useMemo(() => (bs.mode === "split" ? briefing(bs.cur, bs.base, { all, exposed: exposed.size }) : b), [bs, b, all, exposed]);
  const scope = useMemo<Scope>(() => (bs.cut ? { from: bs.cut } : {}), [bs]);
  const sc = useMemo<Cmp>(() => { const now = struggledRate(bs.cur), prev = bs.base ? struggledRate(bs.base) : null; return { now, prev, vd: verdict(now, prev) }; }, [bs]);
  // the chart draws the earlier rate only when the Brief compares (both sides n >= MIN_N); the dashed line spans the earlier days, the shading the compared ones
  const ref: Ref | null = sc.vd.kind === "none" || sc.prev?.p == null ? null
    : bs.mode === "split" && bs.cut ? { p: sc.prev.p, was: [win.from, addDays(bs.cut, -1)], now: [bs.cut, win.to], tag: "last 4 weeks" }
    : prior ? { p: sc.prev.p, was: [prior.win.from, prior.win.to], now: [win.from, win.to], tag: "this window" } : null;
  const m: Metric = metric === "spend" && !caps.hasCost ? "struggled" : metric;
  const priced = v.rows.filter((r) => r.cost_usd !== null);
  const big: Record<Metric, string> = { struggled: b.struggled.now === null ? "–" : fmtPct(b.struggled.now, 1), sessions: fmtInt(b.sessions.now), prompts: fmtCompact(b.prompts.now), spend: priced.length ? `${priced.length < v.rows.length ? "≥ " : ""}${fmtUSD(priced.reduce((a, r) => a + (r.cost_usd ?? 0), 0))}` : "–" };
  return (
    <section id="s-overview" className="sec" aria-labelledby="s-overview-h">
      <h2 id="s-overview-h" className="sr-only">Overview</h2>
      <div className="grid">
        {v.legacy ? <div className="s12 b-top"><span className="b-acts"><WrappedButton /><CopySummary /></span></div> : <Brief b={bb} bs={bs} cmp={sc} win={win.days} scope={scope} all={all} />}
        <Recommend /><Drivers b={bb} scope={scope} rows={bs.cur} label={bs.mode === "split" ? bs.label : undefined} />
        <KeyNumbers bs={bs} setMetric={setMetric} />
        <p className="s12 allt" aria-label="All-time totals, not filtered">
          <span className="meta">All time</span><span>{fmtInt(t.active_days)} active days</span><span>streak {t.longest_streak} longest, {t.current_streak} now</span><span>{fmtInt(t.projects)} projects</span><span>{fmtInt(t.commits_linked)} commits linked</span>
        </p>
        <UsageMix />
        <Panel id="s-trend" title="Per week" meta="last 12 weeks" span={12} src={`sessions · weekly · n ${fmtInt(b.sessions.now)}${b.sessions.prev === null ? "" : ` vs ${fmtInt(b.sessions.prev)}`}`} actions={<TrendToggles metric={m} setMetric={setMetric} view={view} setView={setView} hasCost={caps.hasCost} />}>
          {/* in split mode the struggled headline reads like the Brief: last 4 weeks against the weeks before */}
          {m === "struggled" && bs.mode === "split" && bb.struggled.now !== null
            ? <div className="wk-big"><b>{fmtPct(bb.struggled.now, 1)}</b><span>last 4 weeks{ref ? ` · ${fmtPct(ref.p, 1)} before` : ""}</span></div>
            : <div className="wk-big"><b>{big[m]}</b><span>{m === "spend" ? "priced spend in period" : `${m} in period`}</span></div>}
          <WeekChart weekly={b.weekly} metric={m} view={view} base={ref} />
        </Panel>
        <WhereWent />
      </div>
    </section>
  );
}
