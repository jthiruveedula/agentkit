import { useEffect, useRef } from "react";
import type { DashboardData } from "../data/types";
import { fmtCompact, fmtInt, fmtUSD } from "../lib/format";
import { useReducedMotion, useSize, useVisibleLoop } from "../lib/hooks";
import { gsap, onceAt, useGSAP, withMotion } from "../lib/motion";
import { BG, SOURCES, srcColor, srcLabel } from "../lib/palette";
import { DataTable } from "./Chart";

function Ticker({ value, fmt, label }: { value: number; fmt: (n: number) => string; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const el = root.current;
    if (!el || !num.current) return;
    return withMotion(el, () => {
      const o = { v: 0 };
      const out = num.current!;
      out.textContent = fmt(0);
      gsap.to(o, { v: value, duration: 1.6, ease: "power2.out", onUpdate: () => { out.textContent = fmt(o.v); }, scrollTrigger: onceAt(el, "top 95%") });
    });
  }, { scope: root, dependencies: [value] });
  return (
    <div className="ticker" ref={root}>
      <span className="sr-only">{fmt(value)}</span>
      <span className="ticker-n" aria-hidden="true" ref={num}>{fmt(value)}</span>
      <span className="ticker-l">{label}</span>
    </div>
  );
}

const PARTS = 520;
interface P { s: number; t: number; v: number; j: number }

/** Ambient particle field: one colored stream per source, converging right. Pauses offscreen. */
function Particles({ weights, colors }: { weights: number[]; colors: string[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const { w, h } = useSize(wrap);
  const state = useRef<{ ps: P[]; ctx: CanvasRenderingContext2D | null; dpr: number }>({ ps: [], ctx: null, dpr: 1 });

  const setup = () => {
    const c = cv.current;
    if (!c || w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const n = w < 640 ? 240 : PARTS;
    const ps: P[] = [];
    weights.forEach((wt, s) => {
      const k = Math.max(8, Math.round((wt / total) * n));
      for (let i = 0; i < k; i++) ps.push({ s, t: Math.random(), v: 0.0012 + Math.random() * 0.0016, j: (Math.random() - 0.5) * 2 });
    });
    state.current = { ps, ctx, dpr };
  };
  const step = () => {
    const { ps, ctx } = state.current;
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(11,13,18,0.16)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const n = Math.max(1, weights.length);
    const ex = w * 0.8, ey = h * 0.5;
    for (const p of ps) {
      p.t += p.v;
      if (p.t > 1) p.t -= 1;
      const sy = h * (0.18 + (0.64 * p.s) / Math.max(1, n - 1));
      const u = p.t, iu = 1 - u;
      const cx = w * 0.42;
      const x = iu * iu * 0 + 2 * iu * u * cx + u * u * ex;
      const spread = (1 - u) * 14 + 3;
      const y = iu * iu * sy + 2 * iu * u * sy + u * u * ey + p.j * spread;
      ctx.globalAlpha = 0.25 + 0.6 * Math.sin(Math.PI * u);
      ctx.fillStyle = colors[p.s] ?? "#8aa0b8";
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  };
  // (re)initialise on size change; static frame for reduced motion
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setup();
    if (reduced) for (let i = 0; i < 160; i++) step();
  }, [w, h, reduced, weights.join()]);
  useVisibleLoop(wrap, step, !reduced);
  return (
    <div className="particles" ref={wrap} aria-hidden="true">
      <canvas ref={cv} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export function Footprint({ d }: { d: DashboardData }) {
  const { totals: t, by_source: bs } = d;
  const all = SOURCES.map((s) => bs.find((b) => b.source === s)).filter(Boolean) as DashboardData["by_source"];
  const rows = all.filter((r) => r.prompts > 0);
  const idle = SOURCES.filter((s) => !rows.some((r) => r.source === s));
  const weights = rows.length ? rows.map((r) => Math.max(1, r.prompts)) : [1, 1, 1, 1, 1];
  const colors = rows.length ? rows.map((r) => srcColor(r.source)) : SOURCES.map(srcColor);
  const max = Math.max(1, ...rows.map((r) => r.prompts));
  return (
    <>
      <Particles weights={weights} colors={colors} />
      <div className="tickers" data-stagger>
        <Ticker value={t.sessions} fmt={fmtInt} label="sessions" />
        <Ticker value={t.prompts} fmt={fmtCompact} label="prompts" />
        <Ticker value={t.tokens} fmt={fmtCompact} label="tokens" />
        <Ticker value={t.cost_usd} fmt={(n) => (n >= 100 ? `$${fmtCompact(Math.round(n))}` : fmtUSD(n))} label="spent" />
        <Ticker value={t.current_streak} fmt={(n) => `${fmtInt(n)}d`} label={`streak, best ${t.longest_streak}d`} />
      </div>
      {rows.length === 0 ? (
        <p className="empty">No sources found yet</p>
      ) : (
        <figure className="orbs-fig">
          <figcaption className="sr-only"><h3>Prompts by source</h3></figcaption>
          <ul className="orbs" data-stagger role="img" aria-label={`Prompts by source: ${rows.map((r) => `${srcLabel(r.source)} ${fmtCompact(r.prompts)}`).join(", ")}`}>
            {rows.map((r) => (
              <li key={r.source} style={{ "--c": srcColor(r.source), "--d": `${Math.round(28 + 52 * Math.sqrt(r.prompts / max))}px` } as React.CSSProperties}>
                <span className="orb" />
                <span className="orb-l">{srcLabel(r.source)}</span>
                <span className="orb-n">{fmtCompact(r.prompts)}</span>
              </li>
            ))}
          </ul>
          {idle.length > 0 && <p className="orbs-idle">No prompts found for {idle.map(srcLabel).join(", ")}</p>}
          <div className="sr-only">
            <DataTable caption="Totals by source" head={["Source", "Sessions", "Prompts", "Tokens", "Cost USD", "Cost estimated"]}
              rows={rows.map((r) => [srcLabel(r.source), r.sessions, r.prompts, r.tokens, r.cost_usd, r.cost_is_estimate ? "yes" : "no"])} />
          </div>
        </figure>
      )}
      <a className="cta" href="#time">Follow the story</a>
    </>
  );
}
