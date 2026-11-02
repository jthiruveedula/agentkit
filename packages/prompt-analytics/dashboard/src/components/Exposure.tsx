import { useStore } from "../state";
import { Card, Empty, Section } from "./ui";
import { ReviewQueue } from "./ReviewQueue";

export function Exposure() {
  const { d, ids, exCat, setExCat } = useStore();
  const ex = d.exposure;
  if (ex.sessions === 0 && ex.items.length === 0) {
    return <Section id="s-exposure" title="Exposure" q="What sensitive data did you paste?"><Card title="Review queue" src="exposure.sessions · local only" span={12}><p className="note">No sensitive data detected.</p></Card></Section>;
  }
  // With a filter active the queue narrows to the matching sessions (items carry a session id).
  const items = ids ? ex.items.filter((i) => i.session !== undefined && ids.has(i.session)) : ex.items;
  return (
    <Section id="s-exposure" title="Exposure" q="What sensitive data did you paste?">
      <Card title="Review queue" src="exposure.sessions · local only" meta="grouped by session, newest first. Previews are masked and stay local" span={12}>
        {items.length === 0 ? <Empty>No findings in this selection</Empty> : <ReviewQueue items={items} cat={exCat} onCat={setExCat} />}
      </Card>
    </Section>
  );
}
