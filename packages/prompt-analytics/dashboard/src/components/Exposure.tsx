import { useStore } from "../state";
import { fmtInt, fmtPct } from "../lib/format";
import { srcColor, srcLabel, SOURCES } from "../lib/palette";
import { Card, Count, Cols, DataTable, Empty, Section } from "./ui";
import { ReviewQueue } from "./ReviewQueue";

type Cat = "secret" | "pii" | "phi";
const CATS: { id: Cat; name: string; color: string }[] = [
  { id: "secret", name: "Secrets", color: "var(--warn-secret)" },
  { id: "pii", name: "PII", color: "var(--warn-pii)" },
  { id: "phi", name: "PHI", color: "var(--warn-phi)" },
];
const name = (s: string) => s.replace(/_/g, " ");

export function Exposure() {
  const { d, ids, exCat, setExCat } = useStore();
  const ex = d.exposure;
  if (ex.sessions === 0 && ex.items.length === 0) {
    return <Section id="s-exposure" title="Exposure" q="What sensitive data did you paste?"><Card title="Sensitive data" span={12}><p className="note">No sensitive data detected.</p></Card></Section>;
  }
  // With a filter active, tiles and the queue narrow to the matching sessions (items carry a session id).
  const items = ids ? ex.items.filter((i) => i.session !== undefined && ids.has(i.session)) : ex.items;
  const live = items.filter((i) => i.status !== "false_positive");
  const per = (c: Cat) => (ids ? new Set(live.filter((i) => i.category === c).map((i) => i.session ?? i.id)).size : ex.by_category.find((x) => x.category === c)?.sessions ?? 0);
  const total = ids ? new Set(live.map((i) => i.session ?? i.id)).size : ex.sessions;
  const srcs = SOURCES.filter((s) => ex.by_kind.some((k) => (k.by_source[s] ?? 0) > 0));
  const peak = Math.max(...ex.by_kind.flatMap((k) => srcs.map((s) => k.by_source[s] ?? 0)), 1);
  return (
    <Section id="s-exposure" title="Exposure" q="What sensitive data did you paste?">
      <Card title="Findings by category" meta={ids ? `${fmtInt(total)} sessions in this selection` : `${fmtInt(ex.sessions)} sessions, ${fmtPct(ex.share, 1)} of all`} span={7}>
        <ul className="tiles" data-sel={exCat !== "all" || undefined}>
          {CATS.map((c) => (
            <li key={c.id}>
              <button type="button" className="tile" aria-pressed={exCat === c.id} style={{ "--c": c.color } as React.CSSProperties} onClick={() => setExCat(exCat === c.id ? "all" : c.id)}
                aria-label={`${c.name}: ${per(c.id)} sessions. Show only ${c.name} in the review queue`}>
                <Count as="b" text={fmtInt(per(c.id))} /><span>{c.name}</span><small>{ex.by_category.find((x) => x.category === c.id)?.advice ?? ""}</small>
              </button>
            </li>
          ))}
        </ul>
        {ex.weekly.length > 0 && (
          <>
            <Cols height={64} label="Sessions with findings per week, stacked by category. Aggregate" cols={ex.weekly.map((w) => ({
              key: w.date, label: w.date, segs: CATS.map((c) => ({ v: w[c.id], color: c.color })), aria: `Week of ${w.date}: ${w.secret} secrets, ${w.pii} PII, ${w.phi} PHI`,
            }))} />
            <ul className="legend">{CATS.map((c) => <li key={c.id} style={{ "--c": c.color } as React.CSSProperties}>{c.name}</li>)}</ul>
          </>
        )}
        <DataTable caption="Findings per week" head={["Week", "Secrets", "PII", "PHI"]} rows={ex.weekly.map((w) => [w.date, w.secret, w.pii, w.phi])} />
      </Card>
      <Card title="Kinds by tool" meta="sessions, all sessions" span={5}>
        {ex.by_kind.length === 0 ? <Empty /> : (
          <ul className="kinds">
            {ex.by_kind.map((k) => (
              <li key={`${k.category}-${k.kind}`}>
                <span className="chip" data-cat={k.category}>{name(k.kind)}</span>
                <span className="kn">{fmtInt(k.sessions)}</span>
                <span className="micro" role="img" aria-label={srcs.filter((s) => k.by_source[s]).map((s) => `${srcLabel(s)} ${k.by_source[s]}`).join(", ")}>
                  {srcs.map((s) => <i key={s} style={{ height: `${((k.by_source[s] ?? 0) / peak) * 100}%`, "--c": srcColor(s) } as React.CSSProperties} title={`${srcLabel(s)}: ${k.by_source[s] ?? 0}`} />)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DataTable caption="Findings by kind and tool" head={["Kind", ...srcs.map(srcLabel), "Sessions"]} rows={ex.by_kind.map((k) => [name(k.kind), ...srcs.map((s) => k.by_source[s] ?? 0), k.sessions])} />
      </Card>
      <Card title="Review queue" meta="grouped by session, newest first. Previews are masked" span={12}>
        {items.length === 0 ? <Empty>No findings in this selection</Empty> : <ReviewQueue items={items} cat={exCat} onCat={setExCat} />}
      </Card>
    </Section>
  );
}
