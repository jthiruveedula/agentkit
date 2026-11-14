import { useStore } from "../state";
import { fmtInt } from "../lib/format";
import { Card, Empty, Section } from "./ui";
import { ReviewQueue } from "./ReviewQueue";

export function Exposure() {
  const { d, ids, exCat, setExCat } = useStore();
  const ex = d.exposure;
  if (ex.sessions === 0 && ex.items.length === 0) {
    return <Section id="s-exposure" title="Exposure" q="What sensitive data did you paste?"><Card so="Nothing flagged in this window." thin title="Review queue" src="exposure.sessions · local only" span={12}><p className="note">No sensitive data detected.</p></Card></Section>;
  }
  // With a filter active the queue narrows to the matching sessions (items carry a session id).
  const items = ids ? ex.items.filter((i) => i.session !== undefined && ids.has(i.session)) : ex.items;
  const open = items.filter((i) => i.status === "open");
  const tally = new Map<string, number>(); for (const i of open) tally.set(i.category, (tally.get(i.category) ?? 0) + 1);
  const kind = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  const so = open.length ? <><b>{fmtInt(open.length)}</b> open finding{open.length === 1 ? "" : "s"} in {fmtInt(new Set(open.map((i) => i.session ?? i.id)).size)} sessions; {{ secret: "secrets", pii: "PII", phi: "PHI" }[kind as "secret"] ?? kind} {tally.size > 1 ? "is most common" : "only"}.</> : <>Nothing flagged in this window.</>;
  return (
    <Section id="s-exposure" title="Exposure" q="What sensitive data did you paste?">
      <Card so={so} thin={!open.length} title="Review queue" src="exposure.sessions · local only" meta="grouped by session, newest first. Previews are masked and stay local" span={12}>
        {items.length === 0 ? <Empty>No findings in this selection</Empty> : <ReviewQueue items={items} cat={exCat} onCat={setExCat} />}
      </Card>
    </Section>
  );
}
