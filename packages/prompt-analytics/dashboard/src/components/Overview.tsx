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
import { applyFilter } from "../lib/filter";
import { whereDims } from "../lib/summary";
import { listNames } from "../lib/capabilities";
import { srcLabel } from "../lib/palette";
import type { Source } from "../data/types";

const srcNames = (xs: Source[]) => listNames(xs.map(srcLabel));


function Kpis({ b, setMetric }: { b: Briefing; setMetric: (m: Metric) => void }) {
  const { d, v, prior, win, exposed, goto, caps } = useStore();
  const t = v.totals, p = prior?.v.totals, pn = p?.sessions ?? 0, st = b.struggled;
  const open = useMemo(() => new Set(d.exposure.items.filter((i) => i.status === "open" && i.session).map((i) => i.session as string)), [d]);
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
        spark: sp((rs) => costPerApplied(rs).value ?? 0), cap: true, go: () => goto("s-tools") }
    : { id: "tpa", primary: true, label: "Tokens per applied change", value: tpa === null ? "–" : fmtCompact(tpa),
        sub: `${caps.unpriced.length ? `${srcNames(caps.unpriced)} ${caps.unpriced.length === 1 ? "doesn't" : "don't"} record prices` : "No prices recorded"}, so tokens stand in for cost`,
        chip: ptpa !== null && tpa !== null && (() => { const x = delta(tpa, ptpa, pn); return x && <Delta lowerBetter pct={x.kind === "new" ? "new" : x.pct} />; })(),
        spark: sp((rs) => tokensPerApplied(rs) ?? 0), cap: true, go: () => goto("s-funnel") };
  const cards: { id: string; label: string; value: string; sub?: string; chip: React.ReactNode; spark: number[]; low?: boolean; primary?: boolean; cap?: boolean; go: () => void }[] = [
    { id: "struggled", primary: true, label: "Struggled", value: st.now === null ? "–" : fmtPct(st.now, 1), sub: st.now === null ? "no session had a prompt" : `${fmtInt(Math.round(st.now * st.n))} of ${fmtInt(st.n)} sessions with prompts`,
      chip: st.diff !== null && <Delta lowerBetter neutral={!st.real} pct={st.diff} text={Math.abs(st.diff * 100) < 0.05 ? "no change" : `${st.diff > 0 ? "+" : "-"}${Math.abs(st.diff * 100).toFixed(1)} pts${st.real ? "" : " · noise"}`} />,
      spark: b.weekly.map((w) => (w.struggled ?? 0) * 100), go: () => { setMetric("struggled"); goto("s-trend"); } },
    { id: "sessions", label: "Sessions", value: fmtInt(t.sessions), chip: p && (() => { const x = delta(t.sessions, p.sessions, pn); return x ? <Delta neutral pct={x.kind === "new" ? "new" : x.pct} /> : pn < MIN_PRIOR_N ? <LowBase n={pn} /> : null; })(), spark: sp(METRICS.sessions), go: () => { setMetric("sessions"); goto("s-trend"); } },
    effCard,
    { id: "prompts", label: "Prompts", value: fmtCompact(t.prompts), sub: t.asked ? `${(t.prompts / t.asked).toFixed(1)} per session with prompts` : undefined, chip: p && (() => { const x = delta(t.prompts, p.prompts, pn); return x ? <Delta neutral pct={x.kind === "new" ? "new" : x.pct} /> : pn < MIN_PRIOR_N ? <LowBase n={pn} /> : null; })(), spark: sp(METRICS.prompts), go: () => { setMetric("prompts"); goto("s-trend"); } },
    { id: "applied", label: "Applied", value: t.asked ? fmtPct(rate) : "0%", sub: t.asked ? (isWide(t.applied, t.asked) ? `n=${fmtInt(t.asked)}, wide CI ${fmtPct(wilson(t.applied, t.asked)[0])}-${fmtPct(wilson(t.applied, t.asked)[1])}` : `${fmtInt(t.applied)} of ${fmtInt(t.asked)} sessions with prompts`) : undefined,
      chip: p && p.asked > 0 && (() => { const x = dPts(rate, prate, 1); return x && <Delta pct={x.pct} text={x.text} />; })(), spark: sp(METRICS.applied), low: t.asked > 0 && isWide(t.applied, t.asked), go: () => goto("s-funnel") },
    { id: "exposed", label: "Exposed", value: t.sessions ? fmtPct(exposed.size / t.sessions, 1) : "0%", sub: `${fmtInt(exposed.size)} sessions with open findings`,
      chip: p && (() => { const x = delta(exposed.size, pExposed, pn); return x && <Delta lowerBetter pct={x.kind === "new" ? "new" : x.pct} />; })(), spark: sparkSeries(v.rows, win, (rs) => rs.filter((r) => open.has(r.id)).length), go: () => goto("s-exposure") },
  ];
  return (
    <ul className="kpis k6" aria-label="Totals for the current selection">
      {cards.map((c, i) => (
        <li key={c.id} data-primary={c.primary || undefined} style={{ "--i": i } as React.CSSProperties}>
          <button type="button" className="kpi" data-kpi={c.id} data-primary={c.primary || undefined} onClick={c.go} aria-label={`${c.label}: ${c.value}. Jump to details`}>
            <span className="lbl">{c.label}</span>
            <Count className="val" text={c.value} />
            <span className="chips">{c.chip}{c.sub ? <span className="sub" data-low={c.low || undefined}>{c.sub}</span> : null}</span>
            <Spark values={c.spark} cap={c.cap} />
            {cap && <span className="cap">{cap}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

const DOT: Record<Item["sev"], string> = { bad: "var(--bad)", warn: "var(--warn)", info: "var(--muted)" };

function Attention() {
  const { d, v, f, ids, apply, goto, setExCat } = useStore();
  const items = useMemo(() => attention(d, v, f, ids), [d, v, f, ids]);
  const run = (it: Item) => {
    const a = it.action;
    if (a.kind === "drill") apply(a.filter, { list: a.list });
    else { if (a.exCat) setExCat(a.exCat); goto(a.id); }
  };
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

const pts = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "-" : ""}${Math.abs(x * 100).toFixed(d)} pts`;

/** Briefing: what changed, by how much, how sure, and the driver. A calm variant when nothing is significant or there is nothing to compare. */
function Brief({ b, nPrior, win }: { b: Briefing; nPrior: number; win: number }) {
  const s = b.struggled, up = (s.diff ?? 0) > 0, real = s.real && s.diff !== null, tone = real ? (up ? "bad" : "good") : "flat";
  const head = s.now === null ? "No sessions with a prompt in this window" : s.prev === null ? "No earlier window to compare" : real ? (up ? "More sessions are struggling" : "Fewer sessions are struggling") : "Nothing changed significantly";
  const why = real ? b.drivers?.headline : null;
  const pct = (x: number) => fmtPct(x, 1);
  return (
    <section className="s12 brief" aria-labelledby="ov-hd" data-tone={tone}>
      <p className="eyebrow">{real ? (up ? "Early sign" : "Improving") : "Steady"} · {win} days</p>
      <h3 id="ov-hd">{head}</h3>
      {s.now !== null && (
        <div className="jump" role="img" aria-label={s.prev === null ? `Struggled rate ${pct(s.now)}` : `Struggled rate ${real ? (up ? "rose" : "fell") : "stayed near"} ${pct(s.prev)} to ${pct(s.now)}`}>
          {s.prev !== null && <><span className="was">{pct(s.prev)}</span><svg viewBox="0 0 60 24" aria-hidden="true"><path d="M2 12h50M44 4l10 8-10 8" /></svg></>}
          <span className="now">{pct(s.now)}</span>
        </div>
      )}
      {s.diff !== null && s.ci && <span className="ci">{pts(s.diff)} · 95% CI {pts(s.ci[0])} to {pts(s.ci[1])} · n {fmtInt(s.n)} vs {fmtInt(nPrior)}{real ? "" : " · within noise"}</span>}
      {why && <button type="button" className="link" onClick={() => document.getElementById("s-driver")?.scrollIntoView({ block: "start" })}>{Math.abs(why.total / (b.drivers?.delta || Infinity)) >= 0.5 ? "mostly" : "partly"} {why.key} · Why →</button>}
    </section>
  );
}

function Drivers({ b }: { b: Briefing }) {
  const { apply } = useStore();
  const a = b.drivers;
  const rows = a ? topDrivers(a) : [], top = Math.max(1e-9, ...rows.map((r) => Math.abs(r.total)));
  const k = (r: number | null, n: number) => fmtInt(Math.round((r ?? 0) * n));
  const h = a?.headline;
  return (
    <Panel id="s-driver" title={a && rows.length ? `Where the ${pts(a.delta)} came from` : "Where the change came from"} span={12} src={h ? `attribution · n ${h.n1} vs ${h.n0}` : "attribution · project × intent"}>
      {!rows.length ? <Empty>Needs an earlier window with prompts in both periods.</Empty> : (
        <>
          <ul className="drv" aria-label="Signed share of the change, in points">
            {rows.map((r) => (
              <li key={r.key} data-tone={r.total > 0 ? "bad" : r.total < 0 ? "good" : "flat"}>
                <span><b>{r.key === "Other" ? "All other work" : r.key}</b><small>{k(r.r1, r.n1)}/{fmtInt(r.n1)} vs {k(r.r0, r.n0)}/{fmtInt(r.n0)}</small></span>
                <b className="n">{pts(r.total)}</b>
                <span className="bar-t" aria-hidden="true"><i style={{ "--w": Math.abs(r.total) / top } as React.CSSProperties} /></span>
              </li>
            ))}
          </ul>
          {h && <button type="button" className="btn" onClick={() => apply({ project: h.project, ...(h.intent ? { intent: h.intent as never } : {}) }, { list: true })}>Open {fmtInt(h.n1)} sessions</button>}
        </>
      )}
    </Panel>
  );
}

export function Overview() {
  const { d, f, v, prior, win, exposed, caps } = useStore();
  const [metric, setMetric] = useState<Metric>("struggled");
  const [view, setView] = useState<View>("area");
  const t = d.totals;
  const b = useMemo(() => briefing(v.rows, prior ? prior.v.rows : null, { all: applyFilter(d.sessions, { ...f, from: undefined, to: undefined }), exposed: exposed.size }), [d, f, v, prior, exposed]);
  const m: Metric = metric === "spend" && !caps.hasCost ? "struggled" : metric;
  const priced = v.rows.filter((r) => r.cost_usd !== null);
  const big: Record<Metric, string> = { struggled: b.struggled.now === null ? "–" : fmtPct(b.struggled.now, 1), sessions: fmtInt(b.sessions.now), prompts: fmtCompact(b.prompts.now), spend: priced.length ? `${priced.length < v.rows.length ? "≥ " : ""}${fmtUSD(priced.reduce((a, r) => a + (r.cost_usd ?? 0), 0))}` : "–" };
  return (
    <section id="s-overview" className="sec" aria-labelledby="s-overview-h">
      <h2 id="s-overview-h" className="sr-only">Overview</h2>
      <div className="grid">
        <div className="s12 ov-acts"><WrappedButton /><CopySummary /></div>
        {prior !== null || b.struggled.now !== null ? <Brief b={b} nPrior={prior ? struggledRate(prior.v.rows).n : 0} win={win.days} /> : null}
        <div className="s12"><Kpis b={b} setMetric={setMetric} /></div>
        <p className="s12 allt" aria-label="All-time totals, not filtered">
          <span className="meta">All time</span> {fmtInt(t.active_days)} active days · streak {t.longest_streak} longest, {t.current_streak} now · {fmtInt(t.projects)} projects · {fmtInt(t.commits_linked)} commits linked
        </p>
        <Panel id="s-trend" title="Per week" meta="last 12 weeks" span={8} src={`sessions · weekly · n ${fmtInt(b.sessions.now)}${b.sessions.prev === null ? "" : ` vs ${fmtInt(b.sessions.prev)}`}`} actions={<TrendToggles metric={m} setMetric={setMetric} view={view} setView={setView} hasCost={caps.hasCost} />}>
          <div className="wk-big"><b>{big[m]}</b><span>{m === "spend" ? "priced spend in period" : `${m} in period`}</span></div>
          <WeekChart weekly={b.weekly} metric={m} view={view} />
        </Panel>
        <Attention /><Drivers b={b} /><WhereWent />
      </div>
    </section>
  );
}
