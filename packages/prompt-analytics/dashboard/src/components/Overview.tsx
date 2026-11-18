import { useMemo, useState } from "react";
import { useStore } from "../state";
import { delta } from "../lib/compare";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtSigned, fmtUSD } from "../lib/format";
import { Card, Count, Empty, Segmented, W } from "./ui";
import { Recommend, useNext } from "./Recommend";
import { CopySummary } from "./CopySummary";
import { Bullet, Gauge, sparkPath } from "./charts";
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
import { alerts, forecast, type Alert } from "../lib/watch";
import "./hero.css";
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
  const big = Math.max(...dm.rows.map((r) => r.share), dm.other?.share ?? 0, 1e-9);   // bars scale to the largest share, not to 100%
  return (
    <Panel id="s-where" src="priced cost share · one denominator" title="Where it went" meta={`top ${dm.rows.length} by ${dm.note}${dm.byCost ? "" : " (nothing priced, so tokens stand in)"}; one click filters`} span={12}
      actions={dims.length > 1 ? <Segmented quiet label="Break down by" value={dm.id} onChange={setPick} options={dims.map((x) => ({ id: x.id, text: x.name }))} /> : undefined}>
      <div className="wh" role="group" aria-label={`${dm.name} by ${dm.note}`}>
        <div className="wh-r wh-h" aria-hidden="true"><span>{dm.name.slice(0, -1)}</span><span className="wh-t">Share (longest = {fmtPct(big)})</span><span className="wh-v">{dm.byCost ? "Cost · share" : "Tokens · share"}</span><span className="wh-f" title="Mean friction, and its gap to the median of the group">Friction vs med.</span><span className="wh-p">{dm.byCost ? "$ / session" : "tok / session"}</span></div>
        {dm.rows.map((r) => (
          <button key={r.key} type="button" className="wh-r wh-b" aria-pressed={undefined} disabled={!r.filterable} style={{ "--w": r.share / big } as React.CSSProperties}
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
          <div className="wh-r wh-o" style={{ "--w": dm.other.share / big } as React.CSSProperties} aria-label={`${dm.other.n} more: ${fmtPct(dm.other.share)}`}>
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

/** The struggled rate per day over the last 30 days of the window, each day pooled with the 6 before it (single days are too thin). null = no prompt in that week. */
export function trail(rows: SessionRow[], to: string, days = 30): (number | null)[] {
  return Array.from({ length: days }, (_, i) => { const d = addDays(to, i - days + 1), a = addDays(d, -6); return struggledRate(rows.filter((r) => r.date >= a && r.date <= d)).p; });
}
/** Strip widget 2: the 30-day struggled rate as a sparkline (7-day rolling), the earlier rate dashed, min / now chips, and how many weeks it has moved one way. */
function Spark({ vals, was }: { vals: (number | null)[]; was: number | null }) {
  const { apply, win } = useStore();
  const W0 = 120, H = 44, n = vals.length, real = vals.filter((v): v is number => v !== null);
  if (real.length < 2) return null;
  const top = Math.max(...real, was ?? 0, 0.01) * 1.15, x = (i: number) => (i * W0) / (n - 1), y = (v: number) => +(H - 2 - (v / top) * (H - 4)).toFixed(2);
  const line = sparkPath(vals, x, y), full = real.length === n;
  let last = n - 1;
  while (vals[last] === null) last--;
  const now = vals[last] as number;
  // whole weeks (points 7 days apart, back from the last) that moved the same way
  let wk = 0, dir = 0;
  for (let i = last; i >= 7 && vals[i] !== null && vals[i - 7] !== null; i -= 7) { const s = Math.sign((vals[i] as number) - (vals[i - 7] as number)); if (!s || (dir && s !== dir)) break; dir = s; wk++; }
  const pct = (v: number) => fmtPct(v, 1);
  return (
    <W n={2} ic="trend" t="30-day trend" className="trend" cap={`7-day avg · ${wk ? `${dir > 0 ? "rising" : "falling"} ${wk} wk${wk > 1 ? "s" : ""}` : "steady"}`}
      label={`Struggle rate, last 30 days, 7-day rolling: lowest ${pct(Math.min(...real))}, now ${pct(now)}`}>
      <div className="sp" data-dir={dir > 0 ? "up" : dir < 0 ? "down" : undefined}>
        <svg viewBox={`0 0 ${W0} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {full && <path className="sp-a" d={`${line}L${W0},${H}L0,${H}Z`} />}
          {was !== null && <line className="sp-was" x1={0} x2={W0} y1={y(was)} y2={y(was)} vectorEffect="non-scaling-stroke" />}
          <path className="sp-l" d={line} pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
        <i className="sp-d" style={{ left: `${(x(last) / W0) * 100}%`, top: `${(y(now) / H) * 100}%` }} />
      </div>
      <p className="w-chips"><span className="chip" aria-hidden="true">low {pct(Math.min(...real))}</span>
        <button type="button" className={`chip${dir > 0 ? " bad" : ""}`} onClick={() => apply({ struggled: true, from: addDays(win.to, -29), to: win.to }, { list: true })}
          aria-label={`7-day struggle rate ${pct(now)}. Open the struggled sessions of the last 30 days`}>7d {pct(now)}</button></p>
    </W>
  );
}

/** Strip widget 4: the latest cost-per-landed-change spike the analyzer flagged (time.anomaly.cost_per_change.<week>; ids sort by week), against its usual level. */
function Cost() {
  const { d, apply } = useStore();
  const c = useMemo(() => d.insights.filter((i) => i.id.startsWith("time.anomaly.cost_per_change.") && i.delta !== null && i.delta > -1)
    .sort((a, b) => b.id.localeCompare(a.id))[0], [d.insights]);
  if (!c || c.delta === null) return null;
  const usd = (x: number) => (x >= 1 ? `$${fmtInt(Math.round(x))}` : `$${x.toFixed(2)}`), usual = c.value / (1 + c.delta);
  const wk = /^\d{4}-\d{2}-\d{2}$/.test(c.id.split(".").pop() ?? "") ? c.id.split(".").pop()! : "";
  const dp = `${c.delta >= 0 ? "+" : "-"}${fmtInt(Math.round(Math.abs(c.delta) * 100))}%`;
  return (
    <W n={4} ic="cost" t="Cost / change" className="cost" cap={`usually ${usd(usual)}`} label={`${c.claim}, ${dp}`}>
      <p className="w-v">{wk
        ? <button type="button" className="b-num w-n" onClick={() => apply({ from: wk, to: addDays(wk, 6) }, { list: true })} aria-label={`${usd(c.value)} per landed change, week of ${fmtDate(wk)}. Open that week's sessions`}><Count text={usd(c.value)} tick /></button>
        : <Count className="w-n" text={usd(c.value)} tick />}<span className={`chip${c.delta > 0 ? " bad" : ""}`}>{dp}</span></p>
    </W>
  );
}

/** Briefing: the struggled rate, what it is compared against, how sure the change is, and the driver once. Honest copy for every state. */
function Brief({ b, bs, cmp: { now, prev, vd }, win, scope, all: unDated }: { b: Briefing; bs: Basis; cmp: Cmp; win: number; scope: Scope; all: SessionRow[] }) {
  const { d, v, f, ids, apply, clear, goto, win: wn } = useStore();
  const tr = useMemo(() => trail(v.rows, wn.to), [v.rows, wn.to]);
  const next = useNext();
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
  const st = useMemo(() => story(bs.cur), [bs]);
  // raw session counts are not comparable across a 4-week vs a 22-week split, so the Sessions mover only runs against an equal prior window
  const all = useMemo(() => movers(bs.cur, bs.base, 5).filter((m) => (bs.mode !== "split" || m.id !== "sessions") && (!tiled(m.id) || dl[m.id] !== undefined)).slice(0, 2), [bs, dl]);
  // a grey (mixed / within range) change never leads the headline
  const lead = vd.kind === "noise" ? all.find((m) => !greyOf(m)) : undefined, mv = all.filter((m) => m !== lead && !tiled(m.id));   // a chip whose metric has a Key numbers tile repeats it
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
  const k0 = drv ? k(drv.r0, drv.n0) : 0, k1 = drv ? k(drv.r1, drv.n1) : 0;
  const dsum = b.drivers?.delta ?? 0, share = drv && dsum ? drv.total / dsum : 0;
  // the receipt: culprit -> its share of the change -> the Do next row that fixes it (the row filtered to the culprit, else row 1)
  const hit = drv && drv.project !== undefined ? next.findIndex((r) => !!r.filter && r.filter.project === drv.project && (!r.filter.intent || !drv.intent || r.filter.intent === drv.intent)) : -1;
  const fix = drv && next.length ? { n: Math.max(0, hit) + 1, row: next[Math.max(0, hit)] } : null;
  const toFix = (id: string) => {   // scroll to the Do next card, then put focus on that row's first control (rows past the first three stay folded)
    goto("s-next");
    requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>("#s-next [data-next]")].find((e) => e.dataset.next === id)?.querySelector<HTMLElement>("button, summary")?.focus({ preventScroll: true }));
  };
  const open = drv && drvN > 0 && <button type="button" className="btn primary b-act" onClick={() => apply({ ...(drv.project !== undefined ? { project: drv.project } : {}), ...(drv.intent ? { intent: drv.intent as never } : {}), ...scope }, { list: true })}
    aria-label={`Open ${nSess(drvN)}: ${drv.key}`}>Open {nSess(drvN)}</button>;
  // the Why sentence is carried by the figure's label; sighted readers get two dot rows (before / now) and one line of counts
  const dots = (kk: number, nn: number) => <span className="wd" aria-hidden="true">{Array.from({ length: nn }, (_, i) => <i key={i} data-on={i < kk || undefined} style={{ "--k": i } as React.CSSProperties} />)}</span>;
  const many = drv ? drv.n0 > 24 || drv.n1 > 24 : false;
  const why = drv ? (
    <><figure className="b-fig" role="group" aria-label={`${drv.key}: ${k1} of its ${nSess(drv.n1)} struggled, ${(drv.r1 ?? 0) < (drv.r0 ?? 0) ? "down" : "up"} from ${k0} of ${fmtInt(drv.n0)}.${share > 0 && share <= 1 ? ` It accounts for ${pts(drv.total, 1)} of the ${pts(dsum, 1)} change.` : ""}`}>
        <figcaption className="sr-only">{drv.key}</figcaption>
        {many ? <Bullet p={drv.r1 ?? 0} was={drv.r0} /> : null}
        {([["Before", k0, drv.n0, "prior"], ["Now", k1, drv.n1, "now"]] as const).map(([l, kk, nn, c]) => (
          <div key={l} className="ud-r" data-r={c}><span className="ud-l sr-only">{l}</span>{many ? null : dots(kk, nn)}<span className="ud-n sr-only">{kk} of {fmtInt(nn)}</span></div>
        ))}
      </figure>
      <p className="w-v" aria-hidden="true"><span className="w-n">{k1} of {fmtInt(drv.n1)}</span><span className="w-u">was {k0} of {fmtInt(drv.n0)}</span></p>
      {open}</>
  ) : st.why && <span className="b-say">{st.why}</span>;
  const sure = vd.kind === "noise" ? "could be" : "likely";
  const dmax = [0.25, 0.5].find((m) => m >= Math.max(p ?? 0, was ?? 0)) ?? 1;   // the gauge scale: 0-25% unless a rate is past it
  const noneFoot = vd.kind === "none" ? (prev ? `Too few sessions with a prompt to compare yet (${fmtInt(now.n)} vs ${fmtInt(prev.n)})` : "No earlier window to compare yet") : "";
  return (
    <section className="s12 brief" aria-labelledby="ov-hd" data-tone={tone}>
      <div className="b-top">
        <p className="eyebrow"><i className="b-dot" aria-hidden="true" />{vd.eyebrow}</p>
        <h3 id="ov-hd">{head}</h3>
        <span className="b-basis">{bs.label ? `${bs.label} · ` : ""}{win} days</span>
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
        <span className="b-acts"><CopySummary /></span>
      </div>
      <div className="strip">
        <W n={1} ic="gauge" t="Struggle score" className="lead"
          cap={p === null ? undefined : noneFoot ? <span className="b-foot" title={noneFoot}>{noneFoot}</span> : `${oneIn(p)} sessions`}>
          {p !== null ? (
            <>
              <div className="b-ring" role="group" aria-label={`Struggle rate ${pct(p)}${was !== null ? `, earlier ${pct(was)}` : ""}`}
                title={dd && prev ? `${pts(dd.diff, 1)}, ${sure} ${end(dd.lo)} to ${end(dd.hi)} pts (95% interval). Sessions with a prompt: ${fmtInt(now.n)} now, ${fmtInt(prev.n)} before` : undefined}>
                <Gauge p={p} was={was} max={dmax} />
              </div>
              <p className="w-v g-v">
                <button type="button" className="b-num w-n" onClick={() => apply({ struggled: true, ...scope }, { list: true })}
                  aria-label={`${pct(p)} of sessions struggled${bs.mode === "split" ? " in the last 4 weeks" : ""}. Open the ${fmtInt(now.k)} struggled sessions`}><Count text={pct(p)} tick /></button>
                {was !== null && <span className={`was chip${real && up ? " bad" : real ? " good" : ""}`}>{real && <span aria-hidden="true">{up ? "↑" : "↓"} </span>}from {pct(was)}</span>}
              </p>
              {/* the sentence, interval and counts stay for screen readers; sighted readers get them in the gauge's tooltip */}
              <div className="sr-only">
                <p className="b-cap">of sessions struggled: <span className="nw">{fr(p)}</span>{was !== null && <>, {vd.kind === "noise" ? "about the same as" : up ? "up from" : "down from"} <span className="nw">{fr(was)}</span></>}</p>
                {dd && prev && (
                  <p className="ci"><b className="ci-pt">{pts(dd.diff, 1)}</b> <CiBar lo={dd.lo} hi={dd.hi} d={dd.diff} /> <span className="ci-n">{sure} {end(dd.lo)} to {end(dd.hi)}</span></p>
                )}
                {dd && prev && <p className="b-foot">{fmtInt(now.n)} vs {fmtInt(prev.n)} sessions with a prompt</p>}
              </div>
            </>
          ) : (
            <>
              {last && <p className="b-cap">Last prompt {fmtDate(last)}</p>}
              {dated ? <button type="button" className="btn" onClick={() => apply({ from: undefined, to: undefined })}>Show all time</button>
                : !isEmpty(f) && <button type="button" className="btn" onClick={() => clear()}>Clear filters</button>}
            </>
          )}
        </W>
        <Spark vals={tr.slice(6)} was={was} />
        <Cost />
        <W n={5} ic="why" t={drv ? "Why" : "Why it matters"} className="why"
          cap={drv && fix ? <button type="button" className="w-fix" title={`${fix.row.detail} (${fix.row.impact})`} onClick={() => toFix(fix.row.id)}
            aria-label={`Fix #${fix.n}: ${fix.row.action} (${fix.row.impact}). Go to this Do next row`}>Fix #{fix.n}: {fix.row.action}</button> : undefined}>
          {why ? <dl className="story"><div><dt className="sr-only">{drv ? "Why" : "Why it matters"}</dt><dd>{why}</dd></div></dl> : <span className="b-say">No single project or intent stands out.</span>}
        </W>
      </div>
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
          {h && <button type="button" className="link drv-open" onClick={() => apply({ project: h.project, ...(h.intent ? { intent: h.intent as never } : {}), ...scope }, { list: true })}
            aria-label={`Open these ${nSess(segCount(cur, h))}: ${h.key}`}>Open these {fmtInt(segCount(cur, h))}</button>}
        </>
      )}
    </Panel>
  );
}

/** Watchtower: threshold breaches from the export (lib/watch). Each row opens the sessions behind it; a quiet line when nothing is over. */
function Alerts() {
  const { d, v, win, apply, openSession, goto, setExCat } = useStore();
  const xs = useMemo(() => alerts(d, v.rows, win), [d, v.rows, win]);
  const open = (a: Alert) => (a.filter ? apply(a.filter, { list: true }) : a.secret?.length === 1 ? openSession(a.secret[0]) : (setExCat("secret"), goto("s-exposure")));
  return (
    <Card id="s-alerts" title="Alerts" meta="struggle rate, open secrets, cost spikes" src="thresholds · this view" span={12} thin={!xs.length}
      so={xs.length ? `${fmtInt(xs.length)} thing${xs.length === 1 ? " is" : "s are"} over a threshold.` : "No alerts: nothing in this view is over its threshold."}>
      {!xs.length ? null : (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Alerts, most urgent first</caption>
            <tbody>{xs.map((a) => (
              <tr key={a.id}>
                <td><span className="tag" data-sev={a.sev}>{a.sev === "bad" ? "Act" : "Watch"}</span></td>
                <td>{a.text}</td>
                <td><button type="button" className="link" onClick={() => open(a)} aria-label={`${a.text}. ${a.filter || a.secret?.length === 1 ? "Open the sessions behind it" : "Open the review queue"}`}>{a.filter || a.secret?.length === 1 ? "Open sessions" : "Review"}</button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Month-end projection (labelled as one) with the numbers it is built from. Each number opens its sessions. Topic cost flags live in Friction. */
function Forecast({ all }: { all: SessionRow[] }) {
  const { d, apply } = useStore();
  const { start, end } = d.range;
  const fc = useMemo(() => forecast(all, start, end), [all, start, end]);
  if (!fc) return null;
  const month = () => apply({ from: fc.monthFrom, to: end }, { list: true });
  const row = (label: string, text: string, go: () => void, aria: string) => <tr key={label}><th scope="row">{label}</th><td><button type="button" className="link" onClick={go} aria-label={aria}>{text}</button></td></tr>;
  return (
    <Card id="s-forecast" title="Cost projection" meta={<><span className="tag">projection</span> to the end of the month, as of {fmtDate(end)}</>} src="cost_usd · priced only" span={12}
      so={<>Projected month end: <b>{fmtUSD(fc.projected)}</b>, a projection, not a bill.</>}>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">How the month-end projection is built</caption>
          <tbody>
            {row("Month to date, priced", fmtUSD(fc.mtd), month, `Month to date priced spend ${fmtUSD(fc.mtd)}. Open this month's sessions`)}
            {row(`Daily run-rate, last ${fc.days} days`, `${fmtUSD(fc.rate)} a day`, () => apply({ from: fc.runFrom, to: end }, { list: true }), `Daily run-rate ${fmtUSD(fc.rate)}, from the last ${fc.days} days. Open those sessions`)}
            <tr><th scope="row">Days left in the month</th><td>{fmtInt(fc.left)}</td></tr>
            {row("Projected month end", fmtUSD(fc.projected), month, `Projected month-end spend ${fmtUSD(fc.projected)}, a projection. Open this month's sessions`)}
          </tbody>
        </table>
      </div>
      <p className="note">Projection = month-to-date priced spend + run-rate x days left; a straight line, not a forecast.{fc.unpriced ? ` ${fmtInt(fc.unpriced)} unpriced session${fc.unpriced === 1 ? "" : "s"} this month are left out, not counted as $0.` : ""}</p>
    </Card>
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
        {v.legacy ? <div className="s12 b-top"><span className="b-acts"><CopySummary /></span></div> : <div className="s12 hero"><Brief b={bb} bs={bs} cmp={sc} win={win.days} scope={scope} all={all} /></div>}
        <Alerts />
        <KeyNumbers bs={bs} setMetric={setMetric} all={all} />
        <Forecast all={all} />
        <Recommend /><Drivers b={bb} scope={scope} rows={bs.cur} label={bs.mode === "split" ? bs.label : undefined} />
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
