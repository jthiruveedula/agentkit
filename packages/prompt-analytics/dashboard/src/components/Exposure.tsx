import { useStore } from "../state";
import { fmtInt, fmtPct } from "../lib/format";
import { srcLabel, SOURCES } from "../lib/palette";
import { Cols, Empty, Panel } from "./ui";
import { ReviewQueue } from "./ReviewQueue";

type Cat = "secret" | "pii" | "phi";
const CATS: { id: Cat; name: string; color: string }[] = [
  { id: "secret", name: "Secrets", color: "var(--warn-secret)" },
  { id: "pii", name: "PII", color: "var(--warn-pii)" },
  { id: "phi", name: "PHI", color: "var(--warn-phi)" },
];
const name = (s: string) => s.replace(/_/g, " ");

export function Exposure() {
  const { d, ids } = useStore();
  const ex = d.exposure;
  if (ex.sessions === 0 && ex.items.length === 0) {
    return <Panel title="Sensitive data" meta="pasted into prompts" span={12}><p className="note">No sensitive data detected.</p></Panel>;
  }
  // With a filter active the review queue and tiles narrow to the matching sessions (items carry a session id).
  const items = ids ? ex.items.filter((i) => i.session !== undefined && ids.has(i.session)) : ex.items;
  const live = items.filter((i) => i.status !== "false_positive");
  const per = (c: Cat) => (ids ? new Set(live.filter((i) => i.category === c).map((i) => i.session ?? i.id)).size : ex.by_category.find((x) => x.category === c)?.sessions ?? 0);
  const total = ids ? new Set(live.map((i) => i.session ?? i.id)).size : ex.sessions;
  const srcs = SOURCES.filter((s) => ex.by_kind.some((k) => (k.by_source[s] ?? 0) > 0));
  const weekly = ex.weekly;
  return (
    <>
      <Panel title="Sensitive data you pasted" meta={ids ? `${fmtInt(total)} sessions in this selection` : `${fmtInt(ex.sessions)} sessions, ${fmtPct(ex.share, 1)} of all`} span={5}>
        <ul className="tiles">
          {CATS.map((c) => (
            <li key={c.id} className="tile" style={{ "--c": c.color } as React.CSSProperties}>
              <b>{fmtInt(per(c.id))}</b><span>{c.name}</span>
              <small>{ex.by_category.find((x) => x.category === c.id)?.advice ?? ""}</small>
            </li>
          ))}
        </ul>
        {weekly.length > 0 && (
          <>
            <Cols height={64} label="Sessions with findings per week, stacked by category" cols={weekly.map((w) => ({
              key: w.date, label: w.date, segs: CATS.map((c) => ({ v: w[c.id], color: c.color })),
              aria: `Week of ${w.date}: ${w.secret} secrets, ${w.pii} PII, ${w.phi} PHI`,
            }))} />
            <ul className="legend">{CATS.map((c) => <li key={c.id} style={{ "--c": c.color } as React.CSSProperties}>{c.name}</li>)}</ul>
          </>
        )}
        {ex.by_kind.length > 0 && (
          <div className="tbl-wrap" role="region" aria-label="Findings by kind and source" tabIndex={0}>
            <table className="tbl">
              <thead><tr><th scope="col">Kind</th>{srcs.map((s) => <th key={s} scope="col">{srcLabel(s)}</th>)}<th scope="col">Sessions</th></tr></thead>
              <tbody>{ex.by_kind.map((k) => (
                <tr key={k.kind}>
                  <th scope="row"><span className="chip" data-cat={k.category}>{name(k.kind)}</span></th>
                  {srcs.map((s) => <td key={s}>{k.by_source[s] ? fmtInt(k.by_source[s] as number) : "-"}</td>)}
                  <td>{fmtInt(k.sessions)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Review queue" meta="grouped by session, newest first" span={7}>
        {items.length === 0 ? <Empty>No findings in this selection</Empty> : <ReviewQueue items={items} />}
      </Panel>
    </>
  );
}
