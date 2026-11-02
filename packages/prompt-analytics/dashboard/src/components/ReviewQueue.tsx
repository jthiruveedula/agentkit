import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { getApi } from "../data/api";
import type { ExposureItem, RevealFinding, Source } from "../data/types";
import { fmtDate, fmtInt } from "../lib/format";
import { SOURCES, srcLabel } from "../lib/palette";
import { ToolLogo } from "./Shell";
import "./govern.css";

type Status = ExposureItem["status"];
type Cat = ExposureItem["category"];
const PAGE = 8; // sessions per page
const REVEAL_MS = 30_000;
const CAT_NAME: Record<Cat, string> = { secret: "Secrets", pii: "PII", phi: "PHI" };
const STATUS_NAME: Record<Status, string> = { open: "Open", reviewed: "Reviewed", false_positive: "Not sensitive" };
const name = (s: string) => s.replace(/_/g, " ");
const CATS = Object.keys(CAT_NAME) as Cat[];

/** Pressed-state filter group (one choice at a time). */
function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; text: string }[] }) {
  return <div className="seg3" role="group" aria-label={label}>{options.map((o) => <button key={o.id} type="button" className="fp" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.text}</button>)}</div>;
}

/** Renders a masked preview, turning ⟦kind⟧ tokens into chips. Text nodes only. */
function Masked({ text }: { text: string }) {
  const parts = text.split(/⟦([^⟧]*)⟧/);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="chip">{name(p)}</span> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export interface Group { key: string; source: Source; date: string; title: string | null; items: ExposureItem[] }
/** Items of one session with an identical masked preview (e.g. the same output every turn) collapse into one row. */
export function collapse(items: ExposureItem[]): ExposureItem[][] {
  const m = new Map<string, ExposureItem[]>();
  for (const it of items) {
    const k = it.preview === null ? `id:${it.id}` : `${it.kinds.join()}|${it.preview}`;
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return [...m.values()];
}
/** One group per session (items without a session id stand alone). Order follows the first item of each group. */
export function groupBySession(items: ExposureItem[]): Group[] {
  const m = new Map<string, Group>();
  for (const it of items) {
    const key = it.session ?? it.id;
    const g = m.get(key);
    if (g) g.items.push(it); else m.set(key, { key, source: it.source, date: it.date, title: it.session_title, items: [it] });
  }
  return [...m.values()];
}

type Api = NonNullable<ReturnType<typeof getApi>>;

function Row({ its, api, status, onReview }: { its: ExposureItem[]; api: Api | null; status: Status; onReview: (id: string, s: Status) => void }) {
  const it = its[0];
  const review = (s: Status) => its.forEach((x) => onReview(x.id, s));
  // Revealed text lives only here and is dropped on hide/unmount.
  const [found, setFound] = useState<RevealFinding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [peek, setPeek] = useState(false); // offline: show masked preview unblurred
  const li = useRef<HTMLLIElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const shown = found !== null || peek;
  const when = fmtDate(it.date);

  const hide = (refocus = false) => { setFound(null); setPeek(false); if (refocus) btn.current?.focus(); };

  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => hide(), REVEAL_MS);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(true); };
    const vis = () => { if (document.hidden) hide(); };
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => { if (!e.isIntersecting) hide(); });
    if (li.current) io?.observe(li.current);
    document.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(t); io?.disconnect(); document.removeEventListener("keydown", key); document.removeEventListener("visibilitychange", vis); };
  }, [shown]);

  const toggle = async () => {
    if (shown) return hide();
    if (!api) return setPeek(true);
    setBusy(true); setErr("");
    try { setFound(await api.reveal(it.id)); } catch { setErr("Could not load the original."); } finally { setBusy(false); }
  };

  const tog = (to: Status) => review(status === to ? "open" : to);
  return (
    <li ref={li} className={`xf1${status === "open" ? "" : " done"}`}>
      <span className="xk">{it.kinds.map((k, i) => <span key={`${i}-${k}`} className="tag" data-cat={it.category}>{name(k)}</span>)}{its.length > 1 && <span className="tag" title={`${its.length} identical findings in this session`}>×{its.length}</span>}</span>
      <div className="xm">
        {found ? (
          <div className="xbox" role="group" aria-label="Sensitive original, revealed">
            {found.map((f, i) => <p key={i}>{f.before}<mark>{f.value}</mark>{f.after}</p>)}
          </div>
        ) : it.preview ? (
          <>
            <span className={`mk${shown ? " on" : ""}`} aria-hidden={!shown}><Masked text={it.preview} /></span>
            {!shown && <span className="sr-only">Preview hidden. Use the reveal button.</span>}
          </>
        ) : <span className="xnone">No preview stored</span>}
        {peek && <p className="xnote" role="status">Run prompt-analytics serve to view originals.</p>}
        {found && <p className="sr-only" role="status">Original revealed. It hides again in 30 seconds.</p>}
        {err && <p className="xnote" role="alert">{err}</p>}
      </div>
      <span className="xa">
        <button type="button" ref={btn} className="xb" disabled={busy} aria-pressed={shown}
          aria-label={`Reveal sensitive prompt from ${when}`} onClick={toggle}>{busy ? "Loading" : "Reveal"}</button>
        <button type="button" className="xb" disabled={!api} aria-pressed={status === "reviewed"} aria-label={`Reviewed: prompt from ${when}`} onClick={() => tog("reviewed")}>Reviewed</button>
        <button type="button" className="xb" disabled={!api} aria-pressed={status === "false_positive"} aria-label={`Not sensitive: prompt from ${when}`} onClick={() => tog("false_positive")}>Not sensitive</button>
      </span>
    </li>
  );
}

export function ReviewQueue({ items, cat, onCat }: { items: ExposureItem[]; cat: "all" | Cat; onCat: (c: "all" | Cat) => void }) {
  const api = useMemo(() => getApi(), []);
  const setCat = onCat;
  const [src, setSrc] = useState<"all" | Source>("all");
  const [st, setSt] = useState<"all" | Status>("all");
  const [page, setPage] = useState(0);
  const [over, setOver] = useState<Record<string, Status>>({});
  const [msg, setMsg] = useState("");

  const present = SOURCES.filter((s) => items.some((i) => i.source === s));
  // Filter on the server snapshot status so a row doesn't vanish under its own Undo button.
  const list = items.filter((i) => (cat === "all" || i.category === cat) && (src === "all" || i.source === src) && (st === "all" || i.status === st));
  const groups = useMemo(() => groupBySession(list), [list]);
  const pages = Math.max(1, Math.ceil(groups.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = groups.slice(cur * PAGE, cur * PAGE + PAGE);
  const f = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  const review = async (id: string, status: Status) => {
    if (!api) return;
    const prev = over[id] ?? items.find((i) => i.id === id)?.status ?? "open";
    setOver((o) => ({ ...o, [id]: status })); setMsg("");
    try { await api.review(id, status); setMsg(status === "open" ? "Reopened." : `Marked ${STATUS_NAME[status].toLowerCase()}.`); }
    catch { setOver((o) => ({ ...o, [id]: prev })); setMsg("Could not save. Change reverted."); }
  };

  const markAll = (g: Group, status: Status) => g.items.forEach((i) => { if ((over[i.id] ?? i.status) === "open") void review(i.id, status); });

  const count = CATS.map((c) => items.filter((i) => i.category === c).length), total = items.length || 1;
  return (
    <div className="rq">
      <div className="xsum" role="img" aria-label={`${items.length} findings: ${CATS.map((c, i) => `${count[i]} ${CAT_NAME[c]}`).join(", ")}`}>{CATS.map((c, i) => <i key={c} data-cat={c} style={{ width: `${(count[i] / total) * 100}%` }} />)}</div>
      <p className="xl">{CATS.map((c, i) => <span key={c}><i data-cat={c} />{CAT_NAME[c]} <b>{count[i]}</b></span>)}<span>Total <b>{items.length}</b></span></p>
      <div className="xf">
        <Seg label="Kind" value={cat} onChange={f(setCat)} options={[{ id: "all", text: "All kinds" }, ...CATS.map((c) => ({ id: c, text: CAT_NAME[c] }))]} />
        <Seg label="Source" value={src} onChange={f(setSrc)} options={[{ id: "all", text: "All sources" }, ...present.map((s) => ({ id: s, text: srcLabel(s) }))]} />
        <Seg label="Status" value={st} onChange={f(setSt)} options={[{ id: "all", text: "Any status" }, ...(Object.keys(STATUS_NAME) as Status[]).map((s) => ({ id: s, text: STATUS_NAME[s] }))]} />
      </div>
      {!api && <p className="xnote">Viewing a static export. Reveal and review need <code>prompt-analytics serve</code>.</p>}
      <p className="sr-only" role="status">{msg}</p>
      {slice.length === 0 ? <p className="xe">No findings match these filters.</p> : slice.map((g) => {
        const open = g.items.filter((i) => (over[i.id] ?? i.status) === "open").length;
        return (
          <section key={g.key} className="xs" aria-label={g.title ?? "Untitled session"}>
            <div className="xh">
              <span className="tag"><ToolLogo source={g.source} size={16} />{srcLabel(g.source)}</span>
              <time className="m" dateTime={g.date}>{fmtDate(g.date)}</time>
              <span className="tt" title={g.title ?? undefined}>{g.title ?? "Untitled session"}</span>
              <span className="m">{g.items.length} {g.items.length === 1 ? "finding" : "findings"}</span>
              {open > 1 && api ? <button type="button" className="btn" aria-label={`Mark all ${open} open findings in ${g.title ?? "this session"} as reviewed`} onClick={() => markAll(g, "reviewed")}>Reviewed all</button> : null}
            </div>
            <ul className="xl1">{collapse(g.items).map((its) => {
              const sts = its.map((i) => over[i.id] ?? i.status);
              return <Row key={its[0].id} its={its} api={api} status={sts.includes("open") ? "open" : sts[0]} onReview={review} />;
            })}</ul>
          </section>
        );
      })}
      {list.length > PAGE && (
        <nav className="rq-pages" aria-label="Review queue pages">
          <button type="button" className="btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <span aria-live="polite">Page {cur + 1} of {pages}, {fmtInt(groups.length)} sessions, {fmtInt(list.length)} findings</span>
          <button type="button" className="btn" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}
