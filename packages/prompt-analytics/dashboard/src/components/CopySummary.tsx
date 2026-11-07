import { useEffect, useRef, useState } from "react";
import { useStore } from "../state";
import { summarize } from "../lib/summary";
import { saveFile } from "../lib/export";
import { basis as basisOf } from "../lib/brief";
import { toast } from "../lib/toast";

/** Copies the Markdown summary; when the clipboard is blocked, downloads it as .md instead. `done` is true for ~1.5 s after a copy. */
export function useCopySummary(onDone?: () => void) {
  const { d, f, v, win, caps, prior, cmp } = useStore();
  return async () => {
    const b = basisOf([], prior, win, cmp);  // label depends on the window only, so no rows needed
    const md = summarize(d, { f, v, win, caps, prior, cmp, basis: b.mode === "split" ? b.label : undefined });
    try {
      await navigator.clipboard.writeText(md);
      toast("Summary copied as Markdown"); onDone?.();
    } catch {
      try { saveFile(`prompt-analytics-summary-${new Date().toISOString().slice(0, 10)}.md`, md, "text/markdown;charset=utf-8"); toast("Clipboard blocked: downloaded summary.md instead"); }
      catch { toast("Could not copy or download the summary"); }
    }
  };
}

export function CopySummary() {
  const [done, setDone] = useState(false), t = useRef(0);
  const copy = useCopySummary(() => { setDone(true); clearTimeout(t.current); t.current = window.setTimeout(() => setDone(false), 1500); });
  const { caps } = useStore();
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <>
      <button type="button" className="btn" data-done={done || undefined} disabled={caps.empty} onClick={copy}>{done ? "Copied" : "Copy as Markdown"}</button>
      <span className="sr-only" role="status" aria-live="polite">{done ? "Summary copied as Markdown" : ""}</span>
    </>
  );
}
