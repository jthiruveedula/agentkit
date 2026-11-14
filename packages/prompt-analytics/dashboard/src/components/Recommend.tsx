import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state";
import { fmtInt } from "../lib/format";
import { THRESHOLDS } from "../lib/attention";
import { attribute } from "../lib/attribute";
import { basis, verdict } from "../lib/brief";
import { applyFilter, openExposure } from "../lib/filter";
import { struggledRate } from "../lib/metrics";
import { nextActions, type Row } from "../lib/next";
import { Card, Empty } from "./ui";
import { titleOf } from "./Shell";
import "./govern.css";

/** The page computes the list once (App provides it, so the why-tags and the card agree); a lone component computes its own. */
export const NextCtx = createContext<Row[] | null>(null);

/** The Do-next rows: the Brief driver (same basis the Brief compares on) lets a matching recommendation lead its tier. */
export function useNext(): Row[] {
  const c = useContext(NextCtx), { d, v, f, ids, prior, win, cmp } = useStore();
  const own = useMemo(() => {
    if (c) return [];
    const bs = basis(v.rows, prior, win, cmp), vd = verdict(struggledRate(bs.cur), bs.base ? struggledRate(bs.base) : null);
    const drv = (vd.kind === "clear" || vd.kind === "early") && bs.base ? attribute(bs.cur, bs.base, "project+intent").headline : null;
    return nextActions(d, v, f, ids, drv);
  }, [c, d, v, f, ids, prior, win, cmp]);
  return c ?? own;
}

const sess = (n: number) => `${fmtInt(n)} session${n === 1 ? "" : "s"}`;

/** What a row can do under the current filters: open its sessions (only when some match) and jump to its evidence section. */
export function useRowOps() {
  const { d, f, secs, capsAll, apply, goto, setExCat } = useStore();
  const ex = useMemo(() => openExposure(d), [d]);
  return {
    count: (r: Row) => (r.filter ? applyFilter(d.sessions, { ...f, ...r.filter }, ex).length : 0),
    open: (r: Row) => r.filter && apply(r.filter, { list: true }),
    sec: (r: Row) => (r.evidence && secs.has(r.evidence.sec) ? { id: r.evidence.sec, title: titleOf(r.evidence.sec, capsAll.multiTool) } : null),
    see: (r: Row) => { if (!r.evidence) return; if (r.evidence.exCat) setExCat(r.evidence.exCat); goto(r.evidence.sec); },
  };
}

const SHOWN = 3;

/** One ordered list: risks first, then habits. Each row names what to do, what it is worth, and where the proof is. */
export function Recommend() {
  const rows = useNext(), ops = useRowOps(), [all, setAll] = useState(false), ol = useRef<HTMLOListElement>(null);
  const k = rows.length, shown = all ? rows : rows.slice(0, SHOWN);
  useEffect(() => {   // expanding moves focus to the first newly shown row
    if (all) ol.current?.querySelector<HTMLElement>(`li:nth-child(${SHOWN + 1}) :is(button, summary)`)?.focus();
  }, [all]);
  return (
    <Card id="s-next" title="Do next, in order" meta="risks first, then habits; recommendations use the whole export" src="insights + recommendations + flags" span={12} thin={!k}
      so={k === 0 ? "Nothing flagged in this window." : k === 1 ? <><b>1</b> action open: {rows[0].impact}.</> : <><b>{k}</b> actions open. Start with #1: {rows[0].impact}.</>}>
      {k === 0 ? <Empty>No actions. Checked: {THRESHOLDS}.</Empty> : (
        <>
          <ol className="todo" ref={ol}>
            {shown.map((r, i) => {
              const n = ops.count(r), sec = ops.sec(r);
              return (
                <li key={r.id} data-next={r.id}>
                  <b className="num" aria-hidden="true">{i + 1}</b>
                  <div className="act"><h4>{r.action}</h4>{r.detail && <p>{r.detail}</p>}</div>
                  <span className={`tag ${r.tone}`}>{r.impact}</span>
                  <span className="go">
                    {sec && <button type="button" className="link" aria-label={`See ${sec.title}: evidence for ${r.action}`} onClick={() => ops.see(r)}>See {sec.title}</button>}
                    {r.filter && n > 0 && <button type="button" className={i ? "btn" : "btn primary"} aria-label={`Open ${sess(n)} behind: ${r.action}`} onClick={() => ops.open(r)}>Open {sess(n)}</button>}
                  </span>
                  {r.why && <details><summary>Why this</summary><p>{r.why}</p></details>}
                </li>
              );
            })}
          </ol>
          {k > SHOWN && <button type="button" className="link more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all (${k})`}</button>}
        </>
      )}
    </Card>
  );
}
