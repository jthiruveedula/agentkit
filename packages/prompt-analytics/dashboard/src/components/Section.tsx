import type { ReactNode } from "react";
import type { Chapter, Insight } from "../data/types";
import { InsightTrace } from "./Trace";
import { clampWords } from "../lib/format";

export const CHAPTERS: { id: Chapter; name: string; fallback: string }[] = [
  { id: "footprint", name: "Your AI footprint", fallback: "Your AI footprint" },
  { id: "time", name: "Where time goes", fallback: "Where your time and money go" },
  { id: "funnel", name: "The funnel", fallback: "From intent to shipped code" },
  { id: "friction", name: "Friction hotspots", fallback: "Where prompts hit friction" },
  { id: "works", name: "What works best", fallback: "What makes prompts work" },
  { id: "recommend", name: "Recommendations", fallback: "What to change next" },
];

/** A chapter: number + name, one headline (rank-1 insight), then visuals. */
export function Section({ id, index, insight, method, children, hero }: { id: Chapter; index: number; insight?: Insight; method?: string; children: ReactNode; hero?: boolean }) {
  const meta = CHAPTERS[index];
  const text = insight ? clampWords(insight.claim) : meta.fallback;
  const tr = insight ? <InsightTrace i={insight} /> : null;
  return (
    <section id={id} className={`chapter ${hero ? "hero" : ""}`} aria-labelledby={`${id}-h`} data-chapter={id}>
      <div className="wrap">
        <header className="chapter-head" data-reveal={hero ? undefined : ""}>
          <p className="chapter-no">{String(index + 1).padStart(2, "0")} {meta.name}</p>
          {hero ? (
            <>
              <h1 id={`${id}-h`} className="display">{meta.name}</h1>
              <p className="lede">{text}{tr}</p>
            </>
          ) : (
            <h2 id={`${id}-h`} className="display">{text}{tr}</h2>
          )}
        </header>
        {method && <p className="method"><span>Method</span> {method}</p>}
        {children}
      </div>
    </section>
  );
}
