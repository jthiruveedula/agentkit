import { useMemo, useState } from "react";
import { useStore } from "../state";
import { attention, THRESHOLDS, type Item } from "../lib/attention";
import { costPerApplied, tokensPerApplied, delta, isWide, METRICS, MIN_PRIOR_N, pointDelta, sparkSeries, wilson } from "../lib/compare";
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { Count, Delta, Empty, LowBase, Segmented } from "./ui";
import { Spark } from "./charts";
import { CopySummary } from "./CopySummary";
import { WrappedButton } from "./Wrapped";
import { TrendToggles, WeekChart, type Metric, type View } from "./Trend";
import { briefing, type Briefing } from "../lib/briefing";
import { topDrivers } from "../lib/attribute";
import { struggledRate } from "../lib/metrics";
import { applyFilter, isEmpty, openExposure } from "../lib/filter";
import { basis, oneIn, segCount, verdict, type Basis } from "../lib/brief";
import { pts } from "../lib/stats";
import { story } from "../lib/story";
import { movers } from "../lib/movers";
import { whereDims } from "../lib/summary";
import { listNames } from "../lib/capabilities";
import { srcLabel } from "../lib/palette";
import type { SessionRow, Source } from "../data/types";
import "./story.css";

const srcNames = (xs: Source[]) => listNames(xs.map(srcLabel));


function Kpis({ b, setMetric, noStruggled }: { b: Briefing; setMetric: (m: Metric) => void; noStruggled: boolean }) {
  const { d, v, prior, win, exposed, goto, caps, apply, openList, setView } = useStore();
  const t = v.totals, p = prior?.v.totals, pn = p?.sessions ?? 0, st = b.struggled;
  const open = useMemo(() => openExposure(d), [d]);
  const sorted = (so: string, list: () => void) => () => { list(); setView({ so }); };
  const applied = () => apply({ applied: true }, { list: true });
  const pExposed = prior ? prior.v.rows.filter((r) => open.has(r.id)).length : 0;
  const cap = prior ? `vs ${fmtDate(prior.win.from)} – ${fmtDate(prior.win.to)}` : "";
  const rate = t.asked ? t.applied / t.asked : 0, prate = p && p.asked ? p.applied / p.asked : 0;
  const pa = p?.asked ?? 0;
  const dPts = (cur: number, pr: number, digits: number) => { const x = pointDelta(cur, pr, pa >= 30 ? pa : 0); if (x === null) return null; const m = Math.abs(x * 100).toFixed(digits); return { pct: x, text: (+m === 0 ? "±0 pts" : `${x > 0 ? "+" : "-"}${m} pts`) }; };   // guard n>=30; sign from the printed value
  const sp = (fn: (r: typeof v.rows) => number) => sparkSeries(v.rows, win, fn);
  const cpa = costPerApplied(v.rows), pcpa = prior ? costPerApplied(prior.v.rows) : null;
  const tpa = tokensPerApplied(v.rows), ptpa = prior ? tokensPerApplied(prior.v.rows) : null;
  const unShare = t.sessions ? t.unpriced / t.sessions : 0;
  const partial = caps.hasCost && unShare > 0.2 ? <span className="tag" data-st="partial">{fmtPct(unShare)} unpriced, partial</span> : null;
  // No price anywhere in view: never show $0; tokens per applied change carries the efficiency story instead.
  const effCard = caps.hasCost
    ? { id: "cpa", primary: true, label: "Cost per applied change", value: cpa.value === null ? "–" : fmtUSD(cpa.value),
        sub: cpa.value === null ? "no priced session applied a change" : `per applied · ${fmtInt(cpa.pricedApplied)} priced of ${fmtInt(cpa.applied)} applied`,
        chip: <>{pcpa && cpa.value !== null && pcpa.value !== null && (() => { const x = delta(cpa.value, pcpa.value, pn); return x && <Delta lowerBetter pct={x.kind === "new" ? "new" : x.pct} />; })()}{partial}</>,
        spark: sp((rs) => costPerApplied(rs).value ?? 0), cap: true, go: () => goto("s-tools"), open: sorted("cost-d", applied) }
    : { id: "tpa", primary: true, label: "Tokens per applied change", value: tpa === null ? "–" : fmtCompact(tpa),
        sub: `${caps.unpriced.length ? `${srcNames(caps.unpriced)} ${caps.unpriced.length === 1 ? "doesn't" : "don't"} record prices` : "No prices recorded"}, so tokens stand in for cost`,
        chip: ptpa !== null && tpa !== null && (() => { const x = delta(tpa, ptpa, pn); return x && <Delta lowerBetter pct={x.kind === "new" ? "new" : x.pct} />; })(),
        spark: sp((rs) => tokensPerApplied(rs) ?? 0), cap: true, go: () => goto("s-funnel"), open: sorted("tokens-d", applied) };
  const cards: { id: string; label: string; value: string; sub?: string; chip: React.ReactNode; spark: number[]; low?: boolean; primary?: boolean; cap?: boolean; go: () => void; open: () => void }[] = [
    { id: "struggled", primary: true, label: "Struggled", value: st.now === null ? "–" : fmtPct(st.now, 1), sub: st.now === null ? "no session had a prompt" : `${fmtInt(Math.round(st.now * st.n))} of ${fmtInt(st.n)} sessions with prompts`,
      chip: st.diff !== null && <Delta lowerBetter neutral={!st.real} pct={st.diff} text={Math.abs(st.diff * 100) < 0.05 ? "no change" : `${st.diff > 0 ? "+" : "-"}${Math.abs(st.diff * 100).toFixed(1)} pts${st.real ? "" : " · noise"}`} />,
      spark: b.weekly.map((w) => (w.struggled ?? 0) * 100), go: () => { setMetric("struggled"); goto("s-trend"); }, open: () => apply({ struggled: true }, { list: true }) },
    { id: "sessions", label: "Sessions", value: fmtInt(t.sessions), chip: p && (() => { const x = delta(t.sessions, p.sessions, pn); return x ? <Delta neutral pct={x.kind === "new" ? "new" : x.pct} /> : pn < MIN_PRIOR_N ? <LowBase n={pn} /> : null; })(), spark: sp(METRICS.sessions), go: () => { setMetric("sessions"); goto("s-trend"); }, open: openList },
    effCard,
    { id: "prompts", label: "Prompts", value: fmtCompact(t.prompts), sub: t.asked ? `${(t.prompts / t.asked).toFixed(1)} per session with prompts` : undefined, chip: p && (() => { const x = delta(t.prompts, p.prompts, pn); return x ? <Delta neutral pct={x.kind === "new" ? "new" : x.pct} /> : pn < MIN_PRIOR_N ? <LowBase n={pn} /> : null; })(), spark: sp(METRICS.prompts), go: () => { setMetric("prompts"); goto("s-trend"); }, open: sorted("prompts-d", openList) },
    { id: "applied", label: "Applied", value: t.asked ? fmtPct(rate) : "0%", sub: t.asked ? (isWide(t.applied, t.asked) ? `n=${fmtInt(t.asked)}, wide CI ${fmtPct(wilson(t.applied, t.asked)[0])}-${fmtPct(wilson(t.applied, t.asked)[1])}` : `${fmtInt(t.applied)} of ${fmtInt(t.asked)} sessions with prompts`) : undefined,
      chip: p && p.asked > 0 && (() => { const x = dPts(rate, prate, 1); return x && <Delta pct={x.pct} text={x.text} />; })(), spark: sp(METRICS.applied), low: t.asked > 0 && isWide(t.applied, t.asked), go: () => goto("s-funnel"), open: applied },
    { id: "exposed", label: "Exposed", value: t.sessions ? fmtPct(exposed.size / t.sessions, 1) : "0%", sub: `${fmtInt(exposed.size)} sessions with open findings`,
      chip: p && (() => { const x = delta(exposed.size, pExposed, pn); return x && <Delta lowerBetter pct={x.kind === "new" ? "new" : x.pct} />; })(), spark: sparkSeries(v.rows, win, (rs) => rs.filter((r) => open.has(r.id)).length), go: () => goto("s-exposure"), open: () => apply({ exposed: true }, { list: true }) },
  ];
  return (
    <ul className={`kpis ${noStruggled ? "k5" : "k6"}`} aria-label="Totals for the current selection">
      {(noStruggled ? cards.filter((c) => c.id !== "struggled") : cards).map((c, i) => (
        <li key={c.id} data-primary={c.primary || undefined} style={{ "--i": i } as React.CSSProperties}>
          <button type="button" className="kpi" data-kpi={c.id} data-primary={c.primary || undefined} onClick={c.open} aria-label={`${c.label}: ${c.value}. Open the sessions behind it`}>
            <span className="lbl">{c.label}</span>
            <Count className="val" text={c.value} />
            <span className="chips">{c.chip}{c.sub ? <span className="sub" data-low={c.low || undefined}>{c.sub}</span> : null}</span>
            <Spark values={c.spark} cap={c.cap} />
            {cap && <span className="cap">{cap}</span>}
          </button>
          <button type="button" className="link kpi-go" onClick={c.go} aria-label={`Jump to the ${c.label} details`}>Details</button>
        </li>
      ))}
    </ul>
  );
}

const DOT: Record<Item["sev"], string> = { bad: "var(--bad)", warn: "var(--warn)", info: "var(--muted)" };

/** Run an attention item: a drill filters (and opens the list), a scroll jumps to its section. */
function useRun() {
  const { apply, goto, setExCat } = useStore();
  return (it: Item) => {
    const a = it.action;
    if (a.kind === "drill") apply(a.filter, { list: a.list });
    else { if (a.exCat) setExCat(a.exCat); goto(a.id); }
  };
}

function Attention() {
  const { d, v, f, ids } = useStore();
  const items = useMemo(() => attention(d, v, f, ids), [d, v, f, ids]);
  const run = useRun();
  return (
    <Panel id="s-attention" title="Needs attention" meta="ranked, one click to the cause" src="insights · ranked by sessions" span={4}>
      {items.length === 0 ? <Empty>Nothing needs attention. Checked: {THRESHOLDS}.</Empty> : (
        <ol className="attn">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => run(it)} aria-label={`${it.headline}. ${it.action.kind === "drill" ? "Filter and open sessions" : "Jump to details"}`}>
                <i className="sev" style={{ background: DOT[it.sev] }} aria-hidden="true" />
                <span className="hl">{it.headline}</span>
                <b className="num">{it.num}</b>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

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
  const fr = (x: number | null) => (x === null ? "–" : x.toFixed(2)), vs = (x: number | null) => (x === null ? "" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`);
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
      {o && <p className="wh-out"><b>{o.label}</b> is the friction outlier ({fr(o.friction)}, {vs(o.vsMedian)} vs the median {fr(dm.median)}). <button type="button" className="link" onClick={() => goto("s-friction")}>See Friction</button> · <button type="button" className="link" onClick={() => goto("s-recs")}>See Recommendations</button></p>}
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

/** Briefing: the struggled rate, what it is compared against, how sure the change is, and the driver once. Honest copy for every state. */
function Brief({ b, bs, win, scope, all: unDated }: { b: Briefing; bs: Basis; win: number; scope: Scope; all: SessionRow[] }) {
  const { d, v, f, ids, apply, clear } = useStore();
  const run = useRun();
  const now = useMemo(() => struggledRate(bs.cur), [bs]), prev = useMemo(() => (bs.base ? struggledRate(bs.base) : null), [bs]);
  const vd = verdict(now, prev), dd = vd.d;
  const real = vd.kind === "clear" || vd.kind === "early", up = vd.dir === "up";
  const tone = real ? (up ? "bad" : "good") : "flat";
  const pct = (x: number) => fmtPct(x, 1);
  const drv = real ? b.drivers?.headline ?? null : null;
  const first = useMemo(() => attention(d, v, f, ids)[0], [d, v, f, ids]);
  const rec = d.recommendations[0], ev = rec ? d.insights.find((i) => i.id === rec.evidence_insight) : undefined, ef = ev?.drill.filter;
  // a recommendation is Do next only when it is about the driver (same project, and intent when both have one)
  const recOk = !!rec && (!drv || (!!ef && ef.project === drv.project && (!ef.intent || !drv.intent || ef.intent === drv.intent)));
  const st = useMemo(() => story(bs.cur, { rec: recOk ? rec.title : undefined, attention: first?.headline }), [bs, recOk, rec, first]);
  // raw session counts are not comparable across a 4-week vs a 22-week split, so the Sessions mover only runs against an equal prior window
  const all = useMemo(() => movers(bs.cur, bs.base, 3).filter((m) => bs.mode !== "split" || m.id !== "sessions").slice(0, 2), [bs]);
  const lead = vd.kind === "noise" ? all[0] : undefined, mv = lead ? all.slice(1) : all;
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
  const why = drv ? (
    <><b>{drv.key}</b>: {k(drv.r1, drv.n1)} of its {fmtInt(drv.n1)} sessions struggled, {(drv.r1 ?? 0) < (drv.r0 ?? 0) ? "down" : "up"} from {k(drv.r0, drv.n0)} of {fmtInt(drv.n0)}.{" "}
      <button type="button" className="btn primary" onClick={() => apply({ ...(drv.project !== undefined ? { project: drv.project } : {}), ...(drv.intent ? { intent: drv.intent as never } : {}), ...scope }, { list: true })}
        aria-label={`Open ${fmtInt(drvN)} sessions: ${drv.key}`}>Open {fmtInt(drvN)} sessions</button></>
  ) : st.why;
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
              {was !== null && <span className="was">was {pct(was)}</span>}
            </p>
            <p className="b-cap">of sessions struggled: <span className="nw">{fr(p)}</span>{was !== null && <>, {vd.kind === "noise" ? "about the same as" : up ? "up from" : "down from"} <span className="nw">{fr(was)}</span></>}</p>
            {dd && prev && <p className="ci">{pts(dd.diff, 1)} · {vd.kind === "noise" ? "could be" : "likely"} {end(dd.lo)} to {end(dd.hi)} · n {fmtInt(now.n)} vs {fmtInt(prev.n)}</p>}
            {vd.kind === "none" && <p className="b-foot">{prev ? `Too few sessions with a prompt to compare yet (n ${fmtInt(now.n)} vs ${fmtInt(prev.n)})` : "No earlier window to compare yet"}</p>}
          </>
        ) : (
          <>
            {last && <p className="b-cap">Last prompt {fmtDate(last)}</p>}
            {dated ? <button type="button" className="btn" onClick={() => apply({ from: undefined, to: undefined })}>Show all time</button>
              : !isEmpty(f) && <button type="button" className="btn" onClick={() => clear()}>Clear filters</button>}
          </>
        )}
      </div>
      {(why || st.next || mv.length > 0) && (
        <div className="b-side">
          {(why || st.next) && (
            <dl className="story">
              {why && <div><dt>{drv ? "Why" : "Why it matters"}</dt><dd>{why}</dd></div>}
              {st.next && (
                <div><dt>Do next</dt><dd>{st.next.text}
                  {st.next.kind === "rec" ? ev && <button type="button" className="link" onClick={() => apply(ev.drill.filter, { list: true })} aria-label={`Open the sessions behind: ${st.next.text}`}>Show evidence</button>
                    : first && <button type="button" className="link" onClick={() => run(first)} aria-label={first.action.kind === "drill" ? `Open the sessions behind: ${first.headline}` : `Jump to the details of: ${first.headline}`}>Open</button>}
                </dd></div>
              )}
            </dl>
          )}
          {mv.length > 0 && (
            <p className="movers"><span className="meta">Also moved</span>
              {mv.map((m) => {
                const body = <>{m.label} <b>{m.text}</b></>, mf = m.filter;
                return mf ? <button key={m.id} type="button" className="tag" data-tone={toneOf(m.good)} onClick={() => apply({ ...mf, ...scope }, { list: true })} aria-label={`${m.label} ${m.text} vs the earlier window. Open these sessions`}>{body}</button>
                  : <span key={m.id} className="tag" data-tone={toneOf(m.good)}>{body}</span>;
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
  const rows = a ? topDrivers(a) : [], top = Math.max(1e-9, ...rows.map((r) => Math.abs(r.total)));
  const k = (r: number | null, n: number) => fmtInt(Math.round((r ?? 0) * n));
  const h = a?.headline;
  return (
    <Panel id="s-driver" title={a && rows.length ? `Where the ${pts(a.delta, 1)} came from` : "Where the change came from"} meta={label} span={12} src={h ? `attribution · n ${h.n1} vs ${h.n0}` : "attribution · project × intent"}>
      {!rows.length ? <Empty>Needs an earlier window with prompts in both periods.</Empty> : (
        <>
          <ul className="drv" aria-label="Signed share of the change, in points">
            {rows.map((r) => {
              const body = <>
                <span><b>{r.key === "Other" ? "All other work" : r.key}</b><small>{k(r.r1, r.n1)}/{fmtInt(r.n1)} vs {k(r.r0, r.n0)}/{fmtInt(r.n0)}</small></span>
                <b className="n">{pts(r.total, 1)}</b>
                <span className="bar-t" aria-hidden="true"><i style={{ "--w": Math.abs(r.total) / top } as React.CSSProperties} /></span>
              </>;
              return (
                <li key={r.key} data-tone={r.total > 0 ? "bad" : r.total < 0 ? "good" : "flat"}>
                  {r.key !== "Other" && (r.project || r.intent) ? (
                    <button type="button" onClick={() => apply({ ...(r.project ? { project: r.project } : {}), ...(r.intent ? { intent: r.intent as never } : {}), ...scope }, { list: true })}
                      aria-label={`${r.key}: ${pts(r.total, 1)} of the change. Open these sessions`}>{body}</button>
                  ) : body}
                </li>
              );
            })}
          </ul>
          {h && <button type="button" className="btn" onClick={() => apply({ project: h.project, ...(h.intent ? { intent: h.intent as never } : {}), ...scope }, { list: true })}
            aria-label={`Open ${fmtInt(segCount(cur, h))} sessions: ${h.key}`}>Open {fmtInt(segCount(cur, h))} sessions</button>}
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
  const m: Metric = metric === "spend" && !caps.hasCost ? "struggled" : metric;
  const priced = v.rows.filter((r) => r.cost_usd !== null);
  const big: Record<Metric, string> = { struggled: b.struggled.now === null ? "–" : fmtPct(b.struggled.now, 1), sessions: fmtInt(b.sessions.now), prompts: fmtCompact(b.prompts.now), spend: priced.length ? `${priced.length < v.rows.length ? "≥ " : ""}${fmtUSD(priced.reduce((a, r) => a + (r.cost_usd ?? 0), 0))}` : "–" };
  return (
    <section id="s-overview" className="sec" aria-labelledby="s-overview-h">
      <h2 id="s-overview-h" className="sr-only">Overview</h2>
      <div className="grid">
        {v.legacy ? <div className="s12 b-top"><span className="b-acts"><WrappedButton /><CopySummary /></span></div> : <Brief b={bb} bs={bs} win={win.days} scope={scope} all={all} />}
        <div className="s12"><Kpis b={b} setMetric={setMetric} noStruggled={!v.legacy && bb.struggled.now !== null} /></div>
        <p className="s12 allt" aria-label="All-time totals, not filtered">
          <span className="meta">All time</span> {fmtInt(t.active_days)} active days · streak {t.longest_streak} longest, {t.current_streak} now · {fmtInt(t.projects)} projects · {fmtInt(t.commits_linked)} commits linked
        </p>
        <Panel id="s-trend" title="Per week" meta="last 12 weeks" span={8} src={`sessions · weekly · n ${fmtInt(b.sessions.now)}${b.sessions.prev === null ? "" : ` vs ${fmtInt(b.sessions.prev)}`}`} actions={<TrendToggles metric={m} setMetric={setMetric} view={view} setView={setView} hasCost={caps.hasCost} />}>
          <div className="wk-big"><b>{big[m]}</b><span>{m === "spend" ? "priced spend in period" : `${m} in period`}</span></div>
          <WeekChart weekly={b.weekly} metric={m} view={view} />
        </Panel>
        <Attention /><Drivers b={bb} scope={scope} rows={bs.cur} label={bs.mode === "split" ? bs.label : undefined} /><WhereWent />
      </div>
    </section>
  );
}
