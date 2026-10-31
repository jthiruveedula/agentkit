import { useEffect, useState } from "react";
import type { DashboardData } from "../data/types";
import { fmtInt } from "../lib/format";
import { srcColor, srcLabel } from "../lib/palette";
import { CHAPTERS } from "./Section";

export function ChapterNav() {
  const [active, setActive] = useState("footprint");
  useEffect(() => {
    const els = CHAPTERS.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setActive(e.target.id); }, { rootMargin: "-45% 0px -45% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="nav" aria-label="Chapters">
      <ol>
        {CHAPTERS.map((c) => (
          <li key={c.id}>
            <a href={`#${c.id}`} aria-current={active === c.id ? "location" : undefined} aria-label={c.name}>
              <span className="nav-l" aria-hidden="true">{c.name}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const STATUS = { ok: "ok", degraded: "partial", missing: "not found", unsupported: "unsupported" } as const;

export function SourceHealth({ d }: { d: DashboardData }) {
  if (d.sources.length === 0) return null;
  return (
    <aside className="health" aria-label="Source health">
      <div className="wrap">
        <ul data-stagger>
          {d.sources.map((s) => (
            <li key={s.source} style={{ "--c": srcColor(s.source) } as React.CSSProperties}>
              <b><span className="sw" aria-hidden="true" />{srcLabel(s.source)}</b>
              <span className="st">{STATUS[s.status] ?? s.status}, {fmtInt(s.sessions)} sessions</span>
              {s.note && s.status !== "ok" ? <span className="note">{s.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
