import { useId, useMemo, useState } from "react";
import { useStore } from "../state";
import { fmtCompact, fmtInt, fmtUSD } from "../lib/format";
import { cleanSlug, draftCommand, repeatCost, shownRepeats, uniqueSlugs } from "../lib/repeats";
import { repeatSpend } from "../lib/insights";
import { findSecrets, secretReason } from "../lib/secrets";
import { toast } from "../lib/toast";
import { Card, Segmented } from "./ui";
import "./polish.css";

const SHOW = 3;
type Rep = ReturnType<typeof shownRepeats>[number];

function Row({ r, slug, cost }: { r: Rep; slug: string; cost: ReturnType<typeof repeatCost> }) {
  const { openSession } = useStore();
  const [open, setOpen] = useState(false), [name, setName] = useState(slug);
  const [text, setText] = useState(() => draftCommand(r, slug).text);   // editable; the secret scan re-runs on every change
  const id = useId(), bad = findSecrets(text), why = bad.length ? secretReason(bad) : "", file = cleanSlug(name);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast("Slash command draft copied"); } catch { toast("Clipboard blocked: select the draft and copy it by hand"); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" })), a = document.createElement("a");
    a.href = url; a.download = `${file}.md`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <li className="rep">
      <p className="rep-n"><b>{fmtInt(r.count)}</b><span>times typed, whole export</span></p>
      <div className="rep-b">
        <p className="rep-h meta">Across {fmtInt(r.sessions.length)} session{r.sessions.length === 1 ? "" : "s"}</p>
        <blockquote className="rep-q">{r.exemplar}</blockquote>
        <p className="meta">~{fmtCompact(cost.tokens)} tokens{cost.cost !== null ? ` / ${fmtUSD(cost.cost)}${cost.priced < r.sessions.length ? ` (${fmtInt(cost.priced)} priced)` : ""}` : ""} across these sessions</p>
        <div className="rep-a">
          <button type="button" className="btn primary" aria-expanded={open} aria-controls={id} aria-label={`${open ? "Hide" : "Turn into"} slash command /${slug}, typed ${r.count} times`} onClick={() => setOpen(!open)}>{open ? "Hide draft" : "Turn into a slash command"}</button>
          <button type="button" className="link" aria-label={`Open latest session where /${slug} was typed`} onClick={() => openSession(r.sessions[0])}>Open latest session</button>
        </div>
        {open && (
          <div className="rep-d" id={id}>
            <label className="rep-f"><span className="meta">Command name</span><input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(file)} spellCheck={false} aria-describedby={`${id}-p`} /></label>
            <p className="meta" id={`${id}-p`}>Save as <code>.claude/commands/{file}.md</code></p>
            <textarea className="rep-pre" value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} aria-label={`Slash command draft for /${slug}`} aria-describedby={`${id}-p`} aria-invalid={!!why} />
            <div className="rep-a">
              <button type="button" className="btn" disabled={!!why} onClick={copy}>Copy draft</button>
              <button type="button" className="btn" disabled={!!why} onClick={download}>Download .md</button>
              {why && <span className="note" role="status">{why}</span>}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** Hidden when the export predates `repeats` or holds no sessions. Ignores filters: repeats are found across the whole export. */
export function Repeats() {
  const { d } = useStore();
  const [sort, setSort] = useState<"count" | "cost">("count"), [all, setAll] = useState(false);
  const data = useMemo(() => {
    const byId = new Map(d.sessions.map((s) => [s.id, s]));
    const base = shownRepeats(d.repeats, new Set(byId.keys()), new Map(d.sessions.map((s) => [s.id, s.date])));
    const slugs = uniqueSlugs(base.map((r) => r.exemplar));   // slugs follow the default order, so a name never changes when the sort does
    const xs = base.map((r, i) => ({ r, slug: slugs[i], cost: repeatCost(r.sessions, byId) }));
    const priced = xs.some((x) => x.cost.cost !== null), val = (x: (typeof xs)[number]) => (priced ? x.cost.cost ?? 0 : x.cost.tokens);
    return { xs: sort === "cost" ? [...xs].sort((a, b) => val(b) - val(a) || b.r.count - a.r.count) : xs, spend: repeatSpend(base, byId) };
  }, [d, sort]);
  const { xs: rows, spend } = data;
  if (d.repeats === undefined || d.sessions.length === 0) return null;
  const shown = all ? rows : rows.slice(0, SHOW);
  const top = rows.reduce<(typeof rows)[number] | null>((a, b) => (!a || b.r.count > a.r.count ? b : a), null);
  const words = top ? top.r.exemplar.trim().split(/\s+/) : [];
  const so = top ? <>You typed &ldquo;{words.slice(0, 5).join(" ")}{words.length > 5 ? "..." : ""}&rdquo; <b>{fmtInt(top.r.count)}</b> times: make it a slash command.</> : <>Nothing flagged in this window.</>;
  return (
    <Card so={so} thin={!top} title="Repeated prompts" meta="ignores filters" span={12}
      actions={<><span className="chip">Whole export</span>{rows.length > 1 && <Segmented quiet label="Sort repeated prompts" value={sort} onChange={setSort} options={[{ id: "count", text: "Most typed" }, { id: "cost", text: "Most spend" }]} />}</>}>
      {rows.length === 0 ? <p className="note">No prompt came up three or more times across sessions. Nothing to turn into a command yet.</p> : (
        <>
          <ul className="reps">{shown.map((x) => <Row key={x.r.cluster + x.r.exemplar} {...x} />)}</ul>
          {rows.length > SHOW && <button type="button" className="link rep-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show ${rows.length - SHOW} more`}</button>}
          <p className="note">{spend.cost !== null ? `Together they cost ${fmtUSD(spend.cost)} across ${fmtInt(spend.sessions)} sessions.` : `Together they used ~${fmtCompact(spend.tokens)} tokens across ${fmtInt(spend.sessions)} sessions.`} Drafts are checked for secrets before they can be copied or downloaded. Cost is the whole of those sessions, not only the repeated prompt.</p>
        </>
      )}
    </Card>
  );
}
