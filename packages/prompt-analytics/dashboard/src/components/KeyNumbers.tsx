// Overview: the Key numbers card (six tiles, each with its own micro-visual and an honest delta on the brief's basis)
// and the Usage mix row (model donut, tokens and spend by tool, model tier mix). Plain SVG and CSS, no chart library.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../state";
import { bucketSeries, costPerApplied, dayDiff, isWide, METRICS, tokensPerApplied, wilson } from "../lib/compare";
import { fmtCompact, fmtInt, fmtPct, fmtRange, fmtUSD } from "../lib/format";
import { Count, DataTable, Segmented } from "./ui";
import { Donut, Gauge, WeekCols } from "./charts";
import type { Metric } from "./Trend";
import type { Basis } from "../lib/brief";
import { appliedRate, spendOutliers } from "../lib/baseline";
import { addDays, openExposure } from "../lib/filter";
import { aboveWeight, kpiDeltas, modelMix, tierMix, tokenTotal, toolMix, type KDelta, type MixBy } from "../lib/mix";
import { tierOf, TIERS } from "../lib/models";
import { listNames } from "../lib/capabilities";
import { MIN_N } from "../lib/thresholds";
import { srcColor, srcLabel } from "../lib/palette";
import type { Source } from "../data/types";
import "./mix.css";

const srcNames = (xs: Source[]) => listNames(xs.map(srcLabel));
const total = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
/** "1 session", "2 sessions" (same as Overview's). */
const nSess = (n: number) => `${fmtInt(n)} session${n === 1 ? "" : "s"}`;
/** A model id that wraps only between its word parts ("claude-" | "sonnet-4-5"), never inside a version like "4-5". */
function MN({ s }: { s: string }) {
  return <>{s.split(/(?<=-)(?=[a-z])/i).map((p, i) => <Fragment key={i}>{i ? <wbr /> : null}<span className="mn">{p}</span></Fragment>)}</>;
}

/** volume = neutral ink; lower / higher = which way is good. */
type Sense = "volume" | "lower" | "higher";
/** A KPI change: ↑/↓ and the size, in ink for volumes, good or bad for quality metrics, grey with its reason when mixed or within range. */
function KD({ x, sense, vs, mean, within = "within this window's likely range" }: { x?: KDelta; sense: Sense; vs: string; mean?: boolean; within?: string }) {
  if (!x) return null;
  const grey = x.grey === "within range" ? within : x.grey;
  const n = x.pct === "new" ? null : x.pct;
  const flat = x.text ? x.text.startsWith("±") : n !== null && Math.round(n * 100) === 0;
  const up = n === null || n > 0;
  const mag = x.text ? x.text.replace(/^[+-]/, "") : n === null ? "new" : `${Math.abs(Math.round(n * 100))}%`;
  const tone = x.grey || flat ? "grey" : sense === "volume" ? "ink" : up === (sense === "higher") ? "good" : "bad";
  const words = `${flat ? "flat" : `${up ? "up" : "down"} ${mag}`}${mean ? " mean" : ""}${x.unit ? ` ${x.unit}` : ""}`;
  return (
    <p className="kd" data-tone={tone}>
      <span aria-hidden="true">{!flat && <span className="kd-a">{up ? "↑" : "↓"}</span>}{flat ? "flat" : mag}{mean ? " mean" : ""}{x.unit ? <span className="kd-u"> {x.unit}</span> : null}</span>
      {grey && <span className="kd-g" aria-hidden="true">{grey}</span>}
      <span className="sr-only">{words} {vs}{grey ? `, ${grey}` : ""}</span>
    </p>
  );
}

/** 100% bar of tier shares (Small, Mid, Top, Unrecognised hatched); `labels` prints shares of 8% and up inside (hidden by CSS when the segment is too narrow). Decorative. */
function TierBar({ vals, labels }: { vals: number[]; labels?: boolean }) {
  const t = total(vals);
  return (
    <span className="tb" aria-hidden="true">
      {vals.map((x, i) => (x > 0 ? <span key={i} className={`tb-${i}`} style={{ flexGrow: x }}>{labels && x / t >= 0.08 ? <b>{fmtPct(x / t)}</b> : null}</span> : null))}
    </span>
  );
}
/** The 4th tier bucket holds sessions with no model id and ids the tier table does not know (Model mix's "Unknown" is only the first). */
const TIER_KEY = [...TIERS, "Unrecognised"];

const KINDS = [["pii", "PII"], ["secret", "Secrets"], ["phi", "PHI"]] as const;

interface Tile { id: string; label: string; value: string; small?: string; delta?: ReactNode; sub?: string; /** `sub` as shown, when it needs markup (title and aria keep the string) */ subEl?: ReactNode; hint?: string; low?: boolean; vis?: ReactNode; note?: ReactNode; primary?: boolean; go: () => void; open: () => void }

/** Key numbers: Sessions, Total spend, Tokens, Cost per applied change, Applied rate, Exposed. Deltas compare on the brief's basis. */
export function KeyNumbers({ bs, setMetric }: { bs: Basis; setMetric: (m: Metric) => void }) {
  const { d, f, v, prior, win, exposed, goto, caps, apply, openList, openSession, setView, secs } = useStore();
  const t = v.totals;
  const open = useMemo(() => openExposure(d), [d]);
  const dl = useMemo(() => kpiDeltas(bs, win, open), [bs, win, open]);
  const tm = useMemo(() => tierMix(v.rows), [v.rows]);
  const sorted = (so: string, list: () => void) => () => { list(); setView({ so }); };
  const applied = () => apply({ applied: true }, { list: true });
  const cut = bs.mode === "split" ? bs.cut : undefined;
  const vs = cut ? `in the ${bs.label.toLowerCase()}` : bs.label;

  // Sessions: whole weeks ending on the window's last day (a partial week is dropped from the start), the compared weeks in accent
  const wk = win.days >= 7 && win.days % 7 ? { from: addDays(win.from, win.days % 7), to: win.to, days: win.days - (win.days % 7) } : win;
  const all = bucketSeries(v.rows, wk, 7, METRICS.sessions), off = Math.max(0, all.length - 24), weeks = all.slice(off);
  const from = cut ? Math.max(0, weeks.findIndex((_, i) => addDays(wk.from, (off + i) * 7) >= cut)) : 0;
  const curDays = cut ? dayDiff(cut, win.to) + 1 : win.days, baseDays = cut ? dayDiff(win.from, cut) : prior?.win.days ?? win.days;
  const perWk = (n: number, days: number) => (days > 0 ? (n * 7) / days : null);
  const wNow = dl.sessions ? perWk(bs.cur.length, curDays) : null, wWas = dl.sessions && bs.base ? perWk(bs.base.length, baseDays) : null;
  const wFmt = (x: number) => (x >= 10 ? fmtInt(x) : x.toFixed(1));

  const cpa = costPerApplied(v.rows), tpa = tokensPerApplied(v.rows), cpaLow = cpa.value !== null && cpa.pricedApplied < MIN_N;
  // a few sessions dominating spend skew the mean: say so, and list them (each opens its session)
  const out = caps.hasCost && cpa.value !== null ? spendOutliers(v.rows) : null;
  const lead = out && `${out.top.length} session${out.top.length === 1 ? " is" : "s are"} ${fmtPct(out.share)} of priced spend`;
  const spent = out ? v.rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0) : 0;
  const OUT_C = ["var(--kx-o1)", "var(--kx-o2)", "var(--kx-o3)"];
  // split mode: the headline, gauge, range and change are all the last 4 weeks; the whole window's rate is named in the sub
  const ar = appliedRate(v.rows), cr = cut ? appliedRate(bs.cur) : ar, ci = cr.n ? wilson(cr.k, cr.n) : null, wide = cr.n > 0 && isWide(cr.k, cr.n);
  const dated = f.from !== undefined || f.to !== undefined;
  const within = cut ? "within the last 4 weeks' likely range" : "within this window's likely range";
  const priced = t.sessions - t.unpriced, tok = tokenTotal(v.rows);
  const topModel = useMemo(() => (f.model === undefined ? modelMix(v.rows, "sessions").top : null), [v.rows, f.model]);
  const lines = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join("\n") || undefined;
  // Exposed on the same basis as Applied: in split mode the headline, kind bars and change are the last 4 weeks
  const ex = useMemo(() => (cut ? new Set(bs.cur.filter((r) => exposed.has(r.id)).map((r) => r.id)) : exposed), [cut, bs.cur, exposed]);
  const exN = cut ? bs.cur.length : t.sessions;
  const kinds = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const it of d.exposure.items) if (it.status === "open" && it.session && ex.has(it.session)) m.set(it.category, (m.get(it.category) ?? new Set()).add(it.session));
    return KINDS.map(([k, name]) => ({ k, name, n: m.get(k)?.size ?? 0 }));
  }, [d, ex]);

  const med = dl.cpa?.grey === "mixed" && dl.cpa.med ? `median ${dl.cpa.med[1] > dl.cpa.med[0] ? "rose" : "fell"} ${fmtUSD(dl.cpa.med[0])} to ${fmtUSD(dl.cpa.med[1])}` : undefined;
  const sx = dl.spend;
  const sesHead = lines(wNow !== null && wWas !== null && `${wFmt(wNow)} a week, was ${wFmt(wWas)}`,
    `${fmtInt(t.prompts)} prompts${t.asked ? ` · ${(t.prompts / t.asked).toFixed(1)} per session with prompts` : ""}`);
  const tiles: Tile[] = [
    { id: "sessions", label: "Sessions", value: fmtInt(t.sessions), delta: <KD x={dl.sessions} sense="volume" vs={vs} />,
      vis: weeks.length > 1 ? <WeekCols values={weeks} from={from} now={wNow} was={wWas} /> : undefined,
      sub: lines(sesHead, topModel && `Top model ${topModel.label} · ${fmtPct(topModel.share)} of sessions`),
      // the model id breaks only between its word parts ("claude-" | "sonnet-4-5"), as in Model mix
      subEl: topModel ? <>{sesHead && `${sesHead}\n`}Top model <MN s={topModel.label} /> · {fmtPct(topModel.share)} of sessions</> : undefined,
      go: () => { setMetric("sessions"); goto("s-trend"); }, open: openList },
  ];
  if (caps.hasCost) {
    tiles.push({ id: "spend", label: "Total spend", value: t.cost === null ? "–" : fmtUSD(t.cost), delta: <KD x={sx} sense="volume" vs={vs} />,
      vis: t.sessions > 0 ? (
        <div className="km">
          <span className="meter" aria-hidden="true"><span className="m-on" style={{ flexGrow: priced }} />{t.unpriced > 0 && <span className="m-off" style={{ flexGrow: t.unpriced }} />}</span>
          <span className="km-l"><span><b>{fmtPct(priced / t.sessions)}</b> priced</span>{t.unpriced > 0 && <span>{fmtInt(t.unpriced)} unpriced</span>}</span>
        </div>
      ) : undefined,
      sub: lines(sx?.grey === "mixed" && sx.alt !== undefined && `Without the ${sx.nOut} costliest sessions, spend is ${sx.alt > 0 ? "up" : "down"} ${fmtPct(Math.abs(sx.alt))}${sx.unit ? ` ${sx.unit}` : ""}`,
        t.unpriced > 0 && "A floor, not a total: unpriced sessions add nothing"),
      go: () => { setMetric("spend"); goto("s-trend"); }, open: sorted("cost-d", openList) });
  }
  tiles.push({ id: "tokens", label: "Tokens", value: tok.counted ? fmtCompact(t.tokens) : "–", small: tok.perSession === null ? undefined : `${fmtCompact(tok.perSession)}/session`, delta: <KD x={dl.tokens} sense="volume" vs={vs} />,
    vis: total(tm.tokens) > 0 ? (
      <div className="kt-tier">
        <TierBar vals={tm.tokens} />
        <span className="tkey">{tm.tokens.map((x, i) => (x > 0 ? <span key={i}><i className={`tb-${i}`} aria-hidden="true" />{TIER_KEY[i]} <b>{fmtPct(x / total(tm.tokens))}</b></span> : null))}</span>
      </div>
    ) : undefined,
    sub: !tok.counted ? "no token data" : tok.counted < t.sessions ? `Per session counts the ${fmtInt(tok.counted)} of ${fmtInt(t.sessions)} sessions that recorded tokens` : undefined,
    go: () => goto(secs.has("s-models") ? "s-models" : "s-tools"), open: sorted("tokens-d", openList) });
  tiles.push(caps.hasCost
    ? { id: "cpa", primary: true, label: "Cost per applied change", value: cpa.value === null ? "–" : fmtUSD(cpa.value), delta: <KD x={dl.cpa} sense="lower" vs={vs} mean={!!dl.cpa?.med} />,
        sub: cpa.value === null ? "no priced session applied a change" : cpaLow ? `Few sessions: ${fmtInt(cpa.pricedApplied)} priced of ${fmtInt(cpa.applied)} applied`
          : med ?? lead ?? `${fmtInt(cpa.pricedApplied)} priced of ${fmtInt(cpa.applied)} applied sessions`, low: cpaLow,
        vis: out ? (
          <span className="meter conc" aria-hidden="true">{out.top.map((r, i) => <span key={r.id} style={{ flexGrow: r.cost_usd ?? 0, background: OUT_C[i] }} />)}<span className="m-rest" style={{ flexGrow: Math.max(0, spent - total(out.top.map((r) => r.cost_usd ?? 0))) }} /></span>
        ) : undefined,
        note: out && lead ? (
          <div className="kpi-note">
            <ul aria-label={`${lead}, costliest first`}>
              {out.top.map((r, i) => (
                <li key={r.id}><button type="button" className="link kpi-out" onClick={() => openSession(r.id)} title={r.title || r.id}
                  aria-label={`Open session: ${r.title || r.id}, ${fmtPct((r.cost_usd ?? 0) / spent)} of priced spend`}><i aria-hidden="true" style={{ background: OUT_C[i] }} /><span>{r.title || "Untitled session"}</span><b>{fmtPct((r.cost_usd ?? 0) / spent)}</b></button></li>
              ))}
            </ul>
          </div>
        ) : undefined,
        go: () => goto("s-tools"), open: sorted("cost-d", applied) }
    // No price anywhere in view: never show $0; tokens per applied change carries the efficiency story instead.
    : { id: "tpa", primary: true, label: "Tokens per applied change", value: tpa === null || !tok.counted ? "–" : fmtCompact(tpa),
        // no number: say which input is missing (as the Tokens tile does), not why tokens stand in for a cost that is not shown either
        sub: !tok.counted ? "no token data" : tpa === null ? "no session applied a change" : `${caps.unpriced.length ? `${srcNames(caps.unpriced)} ${caps.unpriced.length === 1 ? "doesn't" : "don't"} record prices` : "No prices recorded"}, so tokens stand in for cost`,
        go: () => goto("s-funnel"), open: sorted("tokens-d", applied) });
  tiles.push({ id: "applied", label: "Applied rate", value: cr.p === null ? "–" : fmtPct(cr.p), delta: <KD x={dl.applied} sense="higher" vs={vs} within={within} />,
    vis: cr.p !== null && ci ? (
      <div className="kg">
        <Gauge p={cr.p} lo={ci[0]} hi={ci[1]} was={dl.applied?.was} />
        <p className="kg-l"><span>likely {fmtPct(ci[0])} to {fmtPct(ci[1])}</span>{dl.applied?.was != null && <span>earlier: {fmtPct(dl.applied.was, 1)}</span>}</p>
      </div>
    ) : undefined,
    sub: lines(wide && "Few sessions, wide range",
      cr.p !== null && `${cut ? "Last 4 weeks: " : ""}${fmtInt(cr.k)} of ${fmtInt(cr.n)} change sessions`,
      cut && cr.p === null && "No change sessions in the last 4 weeks",
      cut && ar.p !== null && `${dated ? "Whole period" : "All time"}: ${fmtPct(ar.p)}`),
    hint: cr.p !== null && cr.k ? `${fmtPct(cr.looped / cr.k)} of those needed 3+ loops` : undefined, low: wide,
    go: () => goto("s-funnel"), open: applied });
  tiles.push({ id: "exposed", label: "Exposed", value: exN ? fmtPct(ex.size / exN, 1) : "0%", delta: <KD x={dl.exposed} sense="lower" vs={vs} within={within} />,
    vis: ex.size > 0 ? (
      <ul className="kx" aria-label="Sessions with open findings, by kind">
        {kinds.map((k) => <li key={k.k} data-k={k.k}><span>{k.name}</span><span className="kx-t" aria-hidden="true"><i style={{ "--w": k.n / ex.size } as React.CSSProperties} /></span><b>{fmtInt(k.n)}</b></li>)}
      </ul>
    ) : undefined,
    sub: cut ? lines(`Last 4 weeks: ${fmtInt(ex.size)} of ${nSess(exN)} with open findings`, t.sessions > 0 && `${dated ? "Whole period" : "All time"}: ${fmtPct(exposed.size / t.sessions, 1)}`)
      : `${nSess(exposed.size)} with open findings${exposed.size ? "; one can hold several kinds" : ""}`,
    hint: cut && ex.size ? "one session can hold several kinds" : undefined,
    go: () => goto("s-exposure"), open: () => apply({ exposed: true }, { list: true }) });

  // split mode: Sessions, spend and tokens total the window; Applied and Exposed headline the last 4 weeks. The title names both.
  const whole = dated ? fmtRange(win.from, win.to) : "all time";
  const span = cut ? `: totals ${dated ? whole : "all time"}, rates last 4 weeks` : `, ${whole}`;
  return (
    <div className="s12 card kcard" role="group" aria-labelledby="kn-h">
      <header className="kc-h">
        <h3 id="kn-h">Key numbers<span className="kc-p">{span}</span></h3>
        <p className="kc-key">
          {bs.mode === "none" ? <span>No earlier window to compare yet</span> : <>
            <span><b aria-hidden="true">↑↓ </b>{cut ? bs.label : `This window ${bs.label}`}</span>
            <span><i className="k-tick" aria-hidden="true" />earlier window</span>
            <span><i className="k-grey" aria-hidden="true" />grey: within noise or driven by outliers</span>
          </>}
        </p>
      </header>
      <ul className={`kpis k${tiles.length}`} aria-label={`Totals for the current selection${bs.mode !== "none" ? `, changes ${cut ? bs.label.replace(/^Last/, "in the last") : `vs ${bs.label.replace(/^vs /, "")}`}` : ""}`}>
        {tiles.map((c) => (
          <li key={c.id}>
            {/* the tile is not a button: its main button stretches over it (::after), so the outlier buttons sit in flow without nesting */}
            <div className="kt" data-kpi={c.id} data-primary={c.primary || undefined}>
              <button type="button" className="kpi-main" onClick={c.open} aria-label={`${c.label}: ${c.value === "–" ? c.sub ?? "no data" : c.value}${c.small ? `, ${c.small}` : ""}. Open the sessions behind it`}>
                <span className="lbl">{c.label}</span>
                <span className="kv"><Count className="val" text={c.value} />{c.small && <small>{c.small}</small>}</span>
              </button>
              {c.delta}
              {c.sub ? <p className="sub" data-low={c.low || undefined} title={c.hint ? `${c.sub} · ${c.hint}` : c.sub}>{c.subEl ?? c.sub}{c.hint && <span className="sr-only"> · {c.hint}</span>}</p> : null}
              {c.note}
              {c.vis && <div className="kt-vis">{c.vis}</div>}
            </div>
            <button type="button" className="link kpi-go" onClick={c.go} aria-label={`Jump to the ${c.label} details`}>Details</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MixCard({ id, title, span, actions, children }: { id: string; title: string; span: 3 | 4 | 5; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className={`card s${span} mixc`} id={id} role="group" aria-labelledby={`${id}-h`}>
      <header className="card-h"><h3 id={`${id}-h`}>{title}</h3>{actions ? <span className="card-acts">{actions}</span> : null}</header>
      {children}
    </div>
  );
}

const MODEL_C = ["var(--mx1)", "var(--mx2)", "var(--mx3)", "var(--mx4)", "var(--mx5)"];

/** Share by model, switchable between sessions, tokens and spend. Slices keep their session order; a slice or legend row filters to the model. */
function ModelMix() {
  const { v, f, caps, drill } = useStore();
  const [pick, setPick] = useState<MixBy>("sessions");
  const by: MixBy = pick === "spend" && !caps.hasCost ? "sessions" : pick;
  const m = useMemo(() => modelMix(v.rows, by), [v.rows, by]);
  const ses = useMemo(() => modelMix(v.rows, "sessions"), [v.rows]);
  const aw = useMemo(() => (caps.hasCost ? aboveWeight(v.rows) : null), [v.rows, caps.hasCost]);
  // no model ids in this export: nothing to break down. Under a model filter the card stays, so its pressed row (and focus) survive.
  if (f.model === undefined && !m.slices.some((s) => s.kind !== "unknown")) return null;
  const fmtV = by === "sessions" ? fmtInt : by === "tokens" ? fmtCompact : fmtUSD, unit = by === "sessions" ? "sessions" : by === "tokens" ? "tokens" : "priced spend";
  let mi = 0;
  const rows = m.slices.map((s) => {
    const color = s.kind === "model" ? MODEL_C[mi++ % MODEL_C.length] : s.kind === "other" ? "var(--mx-o)" : "var(--mx-u)";
    // missing data is never a 0: unpriced spend reads "not priced", no recorded tokens "no token data"
    const none = by === "spend" ? s.priced === 0 : by === "tokens" && s.value === 0;
    const val = none ? (by === "spend" ? "not priced" : "no token data") : fmtV(s.value), share = none ? "" : fmtPct(s.share);
    const pickIt = s.kind === "other" ? undefined : () => drill({ model: s.key });
    return { s, color, val, share, pickIt, name: s.kind === "other" ? `${s.models} others` : s.label };
  });
  const unknown = m.slices.find((s) => s.kind === "unknown");
  const centre = m.top ?? (unknown && unknown.value > 0 ? unknown : null);
  const shortName = (x: string) => x.replace(/^claude-(?=[a-z])/, "");   // the hole fits "sonnet-4-5", not "claude-sonnet-4-5"
  const filtered = f.model === undefined ? null : f.model ? <b><MN s={f.model} /></b> : <b>sessions with no model id</b>;
  return (
    <MixCard id="s-mix-models" title="Model mix" span={5}
      actions={<Segmented quiet label="Measure" value={by} onChange={setPick} options={[{ id: "sessions" as MixBy, text: "Sessions" }, { id: "tokens" as MixBy, text: "Tokens" }, ...(caps.hasCost ? [{ id: "spend" as MixBy, text: "Spend" }] : [])]} />}>
      {filtered ? <p className="lede">Filtered to {filtered}: {nSess(v.rows.length)}. Press its row again to show every model.</p>
        : aw ? <p className="lede"><b><MN s={aw.model} /></b> costs above its weight: {fmtPct(aw.tok)} of tokens in priced sessions, {fmtPct(aw.spend)} of priced spend.</p>
        : ses.top && <p className="lede"><b><MN s={ses.top.label} /></b> runs {fmtPct(ses.top.share)} of sessions.</p>}
      <div className="dn-row">
        <Donut segs={rows.map((r) => ({ key: `${r.s.kind}:${r.s.key}`, value: r.s.value, color: r.color, hatch: r.s.kind === "unknown", on: r.pickIt && f.model === r.s.key, title: `${r.name}: ${r.val}${r.share ? `, ${r.share}` : ""}`, onPick: r.pickIt }))}>
          {centre ? <><b className="dn-big">{fmtPct(centre.share)}</b><span className="dn-who"><MN s={shortName(centre.label)} /></span><span className="dn-of">of {fmtV(m.total)} {unit}</span></>
            : <span className="dn-of">{by === "tokens" ? "No token data" : by === "spend" ? "Nothing priced" : "No sessions"}</span>}
        </Donut>
        <table className="mlg">
          <caption className="sr-only">Share of {unit} by model{by === "spend" && m.unpriced ? `, ${fmtInt(m.unpriced)} unpriced sessions left out` : ""}</caption>
          <thead className="sr-only"><tr><th scope="col">Model</th><th scope="col">Tier</th><th scope="col">{by === "sessions" ? "Sessions" : by === "tokens" ? "Tokens" : "Spend"}</th><th scope="col">Share</th></tr></thead>
          <tbody>
            {rows.map(({ s, color, val, share, pickIt, name }) => {
              const sw = <i className="mlg-sw" data-hatch={s.kind === "unknown" || undefined} style={{ background: s.kind === "unknown" ? undefined : color }} aria-hidden="true" />;
              return (
                <tr key={`${s.kind}:${s.key}`} data-kind={s.kind}>
                  <th scope="row">{pickIt
                    ? <button type="button" className="mlg-b" aria-pressed={f.model === s.key} onClick={pickIt} title={name} aria-label={`${name}: ${val}${share ? `, ${share} of ${unit}` : ""}. ${f.model === s.key ? "Show every model" : `Filter to ${s.kind === "unknown" ? "sessions with no model id" : "this model"}`}`}>{sw}<span><MN s={name} /></span></button>
                    : <span className="mlg-t" title={name}>{sw}<span>{name}</span></span>}</th>
                  <td className="mlg-tier">{s.kind === "model" ? (() => { const t = tierOf(s.key); return t === null ? "" : TIERS[t]; })() : ""}</td>
                  <td className="mlg-v">{val}</td>
                  <td className="mlg-p">{share}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">{unknown ? `Unknown: ${nSess(unknown.sessions)} with no model id. ` : ""}{by === "spend" && m.unpriced ? `${fmtInt(m.unpriced)} unpriced sessions are left out, not counted as $0. ` : ""}{by === "tokens" && aw && !filtered && v.rows.some((r) => r.cost_usd == null) ? "Shares here count every session's tokens; the line above counts priced sessions only." : ""}</p>
    </MixCard>
  );
}

/** Tokens (left) and priced spend (right) per tool, each side on its own scale. Unpriced is hatched "not priced", never $0. A row filters to the tool. */
function ToolMix() {
  const { v, f, drill } = useStore();
  const rows = useMemo(() => toolMix(v.rows), [v.rows]);
  if (!rows.length) return null;
  const mt = Math.max(1, ...rows.map((r) => r.tokens)), mc = Math.max(1e-9, ...rows.map((r) => r.cost ?? 0));
  const tt = total(rows.map((r) => r.tokens)), ct = total(rows.map((r) => r.cost ?? 0)), top = rows[0];
  return (
    <MixCard id="s-mix-tools" title="Tokens and spend by tool" span={4}>
      {/* no ranking claim without data: tokens and spend shares only when some tool recorded them */}
      <p className="lede">{tt > 0 ? <><b>{srcLabel(top.source)}</b> is {fmtPct(top.tokens / tt)} of tokens{ct > 0 && top.cost !== null ? ` and ${fmtPct(top.cost / ct)} of priced spend` : ""}.</>
        : ct > 0 && top.cost !== null ? <><b>{srcLabel(top.source)}</b> is {fmtPct(top.cost / ct)} of priced spend; no tool recorded tokens.</>
        : "No tool in this selection recorded tokens or prices."}</p>
      <div className="fly" role="group" aria-label="Tokens and spend by tool, one click filters">
        <div className="fly-h" aria-hidden="true"><span>Tokens</span><span>Tool</span><span>Spend</span></div>
        {rows.map((r) => (
          <button key={r.source} type="button" className="fly-r" aria-pressed={f.source === r.source} onClick={() => drill({ source: r.source })} style={{ "--c": srcColor(r.source) } as React.CSSProperties}
            aria-label={`${srcLabel(r.source)}: ${r.tokens > 0 ? `${fmtCompact(r.tokens)} tokens` : "no token data"}, ${r.cost === null ? "not priced" : fmtUSD(r.cost)}, ${fmtInt(r.priced)} of ${fmtInt(r.sessions)} sessions priced. Filter to this tool`}>
            <span className="fly-n">{srcLabel(r.source)}<small>{fmtInt(r.priced)}/{fmtInt(r.sessions)} priced</small></span>
            <span className="fly-t" data-side="l" style={{ "--w": r.tokens / mt } as React.CSSProperties}><small className="fly-k">Tokens</small>{r.tokens > 0 ? <><i /><b>{fmtCompact(r.tokens)}</b></> : <em>no token data</em>}</span>
            <span className="fly-t" data-side="r" style={{ "--w": (r.cost ?? 0) / mc } as React.CSSProperties}><small className="fly-k">Spend</small>{r.cost !== null ? <><i /><b>{fmtUSD(r.cost)}</b></> : <em className="fly-np">not priced</em>}</span>
          </button>
        ))}
      </div>
      <p className="note">Each side has its own scale. Not priced is missing data, not $0.</p>
      <DataTable caption="Tokens and spend by tool" head={["Tool", "Tokens", "Spend", "Priced sessions"]}
        rows={rows.map((r) => [srcLabel(r.source), r.tokens > 0 ? fmtCompact(r.tokens) : "no token data", r.cost === null ? "not priced" : fmtUSD(r.cost), `${fmtInt(r.priced)} of ${fmtInt(r.sessions)}`])} />
    </MixCard>
  );
}

/** Sessions, tokens and priced spend split by model tier (Small, Mid, Top, Unrecognised), as 100% bars. */
function TierMix() {
  const { v } = useStore();
  const tm = useMemo(() => tierMix(v.rows), [v.rows]);
  const members = useMemo(() => {
    const m: Map<string, number>[] = [new Map(), new Map(), new Map()];
    for (const r of v.rows) { const t = tierOf(r.model); if (t !== null && r.model) m[t].set(r.model, (m[t].get(r.model) ?? 0) + 1); }
    return m.map((x) => [...x].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k));
  }, [v.rows]);
  const ns = total(tm.sessions);
  if (!ns || tm.sessions[3] === ns) return null;
  const bars: [string, number[]][] = ([["Sessions", tm.sessions], ["Tokens", tm.tokens], ["Spend", tm.spend]] as [string, number[] | null][]).flatMap(([k, a]) => (a && total(a) > 0 ? [[k, a] as [string, number[]]] : []));
  const sp = tm.spend && total(tm.spend) > 0 ? tm.spend : null;
  return (
    <MixCard id="s-mix-tiers" title="Model tier mix" span={3}>
      <p className="lede">Top-tier models run <b>{fmtPct(tm.sessions[2] / ns)}</b> of sessions{sp ? <> and <b>{fmtPct(sp[2] / total(sp))}</b> of priced spend</> : null}.</p>
      <div className="tm-w">
        <div className="tm" aria-hidden="true">
          {bars.map(([name, a]) => <div key={name} className="tm-r"><span>{name}</span><TierBar vals={a} labels /></div>)}
        </div>
        <p className="tkey" aria-hidden="true">{TIER_KEY.map((k, i) => <span key={k}><i className={`tb-${i}`} />{k}</span>)}</p>
      </div>
      <p className="note">
        {members.map((ms, i) => (ms.length ? <Fragment key={i}>{TIERS[i]}: {ms.map((m, j) => <Fragment key={m}>{j ? ", " : ""}<MN s={m} /></Fragment>)}. </Fragment> : null))}
        {tm.sessions[3] ? `Unrecognised: ${nSess(tm.sessions[3])} with no model id or an id the tier table does not know.` : null}
      </p>
      <DataTable caption="Share by model tier" head={["Measure", ...TIER_KEY]} rows={bars.map(([name, a]) => [name, ...a.map((x) => fmtPct(x / total(a)))])} />
    </MixCard>
  );
}

/** The usage mix row: three cards under the key numbers (5/4/3 of the 12-column grid). */
export function UsageMix() {
  const { v } = useStore();
  if (!v.rows.length) return null;
  return <><ModelMix /><ToolMix /><TierMix /></>;
}
