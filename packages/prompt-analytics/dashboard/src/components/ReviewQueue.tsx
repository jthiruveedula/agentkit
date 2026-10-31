import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { getApi } from "../data/api";
import type { ExposureItem, RevealFinding, Source } from "../data/types";
import { fmtDate, fmtInt } from "../lib/format";
import { SOURCES, srcColor, srcLabel } from "../lib/palette";
import { Segmented } from "./Chart";

type Status = ExposureItem["status"];
type Cat = ExposureItem["category"];
const PAGE = 20;
const REVEAL_MS = 30_000;
const CAT_NAME: Record<Cat, string> = { secret: "Secrets", pii: "PII", phi: "PHI" };
const STATUS_NAME: Record<Status, string> = { open: "Open", reviewed: "Reviewed", false_positive: "Not sensitive" };
const name = (s: string) => s.replace(/_/g, " ");

/** Renders a masked preview, turning ⟦kind⟧ tokens into chips. Text nodes only. */
function Masked({ text }: { text: string }) {
  const parts = text.split(/⟦([^⟧]*)⟧/);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="chip">{name(p)}</span> : <Fragment key={i}>{p}</Fragment>))}</>;
}

type Api = NonNullable<ReturnType<typeof getApi>>;

function Row({ it, api, status, onReview }: { it: ExposureItem; api: Api | null; status: Status; onReview: (id: string, s: Status) => void }) {
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
    const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) hide(); });
    if (li.current) io.observe(li.current);
    document.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(t); io.disconnect(); document.removeEventListener("keydown", key); document.removeEventListener("visibilitychange", vis); };
  }, [shown]);

  const toggle = async () => {
    if (shown) return hide();
    if (!api) return setPeek(true);
    setBusy(true); setErr("");
    try { setFound(await api.reveal(it.id)); } catch { setErr("Could not load the original."); } finally { setBusy(false); }
  };

  return (
    <li ref={li} className="rq-row" data-status={status} style={{ "--c": srcColor(it.source) } as React.CSSProperties}>
      <div className="rq-meta">
        <span className="rq-src"><span className="sw" aria-hidden="true" />{srcLabel(it.source)}</span>
        <time dateTime={it.date}>{when}</time>
        <span className="rq-title">{it.session_title ?? "Untitled session"}</span>
        <span className="rq-kinds">{it.kinds.map((k) => <span key={k} className="chip" data-cat={it.category}>{name(k)}</span>)}</span>
      </div>
      {found ? (
        <div className="rq-box" role="group" aria-label="Sensitive original, revealed">
          {found.map((f, i) => <p key={i}>{f.before}<mark>{f.value}</mark>{f.after}</p>)}
        </div>
      ) : it.preview ? (
        <>
          <p className={`rq-prev ${shown ? "" : "blur"}`} aria-hidden={!shown}><Masked text={it.preview} /></p>
          {!shown && <span className="sr-only">Preview hidden. Use the reveal button.</span>}
        </>
      ) : <p className="rq-prev rq-none">No preview stored</p>}
      {peek && <p className="rq-note" role="status">Run prompt-analytics serve to view originals.</p>}
      {found && <p className="sr-only" role="status">Original revealed. It hides again in 30 seconds.</p>}
      {err && <p className="rq-note" role="alert">{err}</p>}
      <div className="rq-acts">
        <button type="button" ref={btn} className="btn" disabled={busy} aria-expanded={shown}
          aria-label={`${shown ? "Hide" : "Reveal"} sensitive prompt from ${when}`} onClick={toggle}>{busy ? "Loading" : shown ? "Hide" : "Reveal"}</button>
        {status === "open" ? (
          <>
            <button type="button" className="btn" disabled={!api} aria-label={`Mark prompt from ${when} as reviewed`} onClick={() => onReview(it.id, "reviewed")}>Reviewed</button>
            <button type="button" className="btn" disabled={!api} aria-label={`Mark prompt from ${when} as not sensitive`} onClick={() => onReview(it.id, "false_positive")}>Not sensitive</button>
          </>
        ) : (
          <>
            <span className="chip status">{STATUS_NAME[status]}</span>
            <button type="button" className="btn" disabled={!api} aria-label={`Undo, reopen prompt from ${when}`} onClick={() => onReview(it.id, "open")}>Undo</button>
          </>
        )}
      </div>
    </li>
  );
}

export function ReviewQueue({ items }: { items: ExposureItem[] }) {
  const api = useMemo(() => getApi(), []);
  const [cat, setCat] = useState<"all" | Cat>("all");
  const [src, setSrc] = useState<"all" | Source>("all");
  const [st, setSt] = useState<"all" | Status>("all");
  const [page, setPage] = useState(0);
  const [over, setOver] = useState<Record<string, Status>>({});
  const [msg, setMsg] = useState("");

  const present = SOURCES.filter((s) => items.some((i) => i.source === s));
  // Filter on the server snapshot status so a row doesn't vanish under its own Undo button.
  const list = items.filter((i) => (cat === "all" || i.category === cat) && (src === "all" || i.source === src) && (st === "all" || i.status === st));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = list.slice(cur * PAGE, cur * PAGE + PAGE);
  const f = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  const review = async (id: string, status: Status) => {
    if (!api) return;
    const prev = over[id] ?? items.find((i) => i.id === id)?.status ?? "open";
    setOver((o) => ({ ...o, [id]: status })); setMsg("");
    try { await api.review(id, status); setMsg(status === "open" ? "Reopened." : `Marked ${STATUS_NAME[status].toLowerCase()}.`); }
    catch { setOver((o) => ({ ...o, [id]: prev })); setMsg("Could not save. Change reverted."); }
  };

  return (
    <div className="rq">
      <h4 className="rq-h">Review queue</h4>
      <div className="rq-filters">
        <Segmented label="Category" value={cat} onChange={f(setCat)} options={[{ id: "all", text: "All kinds" }, ...(["secret", "pii", "phi"] as Cat[]).map((c) => ({ id: c, text: CAT_NAME[c] }))]} />
        <Segmented label="Source" value={src} onChange={f(setSrc)} options={[{ id: "all", text: "All sources" }, ...present.map((s) => ({ id: s, text: srcLabel(s) }))]} />
        <Segmented label="Status" value={st} onChange={f(setSt)} options={[{ id: "all", text: "Any status" }, ...(Object.keys(STATUS_NAME) as Status[]).map((s) => ({ id: s, text: STATUS_NAME[s] }))]} />
      </div>
      {!api && <p className="rq-note">Viewing a static export. Reveal and review need <code>prompt-analytics serve</code>.</p>}
      <p className="sr-only" role="status">{msg}</p>
      {slice.length === 0 ? <p className="empty">Nothing matches these filters</p> : (
        <ul className="rq-list">{slice.map((it) => <Row key={it.id} it={it} api={api} status={over[it.id] ?? it.status} onReview={review} />)}</ul>
      )}
      {list.length > PAGE && (
        <nav className="rq-pages" aria-label="Review queue pages">
          <button type="button" className="btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <span aria-live="polite">Page {cur + 1} of {pages}, {fmtInt(list.length)} findings</span>
          <button type="button" className="btn" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}
