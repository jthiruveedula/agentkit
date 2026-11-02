import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state";
import { fxOn, reducedNow } from "../lib/hooks";
import { cssVar, srcLabel } from "../lib/palette";
import { struggled } from "../lib/metrics";
import { TIERS, tierOf, type Tier } from "../lib/models";
import type { SessionRow } from "../data/types";

/** One comet: tier lane, length (tokens), outcome 0 resolved / 1 open / 2 struggled, and the two ticker lines. */
interface Ev { tier: Tier; k: number; out: 0 | 1 | 2; l1: string; l2: string; model: string }
const VERDICT = ["resolved", "unresolved", "struggled"], MARK = ["✓ ", "△ ", "↻ "];
const COUNT = 8, GAP = 800, TRAVEL = 3400, TICKER = 270, SCALE = [0.7, 0.85, 1];
const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const outcome = (s: SessionRow): 0 | 1 | 2 => (struggled(s) ? 2 : s.applied ? 0 : 1);
const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The most recent sessions that carry a known model tier. `model` is optional on rows, so older exports simply give no comets. */
export function pulseEvents(rows: SessionRow[]): Ev[] {
  const out: Ev[] = [];
  const sorted = rows.map((r, i) => [r, i] as const).sort((a, b) => (a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : b[1] - a[1]));
  for (const [s] of sorted) {
    const model = (s as { model?: string | null }).model ?? "", tier = tierOf(model);
    if (tier === null) continue;   // unknown model: no lane to put it on
    const o = outcome(s);
    out.push({ tier, k: s.tokens / 1000, out: o, model, l1: `${srcLabel(s.source)} · ${model} · ${s.title}`, l2: `${tok(s.tokens)} tokens · ${s.cost_usd === null ? "unpriced" : `$${s.cost_usd.toFixed(2)}`} · ${VERDICT[o]}` });
    if (out.length === COUNT) break;
  }
  return out;
}

/** Top-bar pulse: three provider-neutral tier lanes, a comet per recent session, and a verdict ticker. Decorative (aria-hidden). */
export function Pulse() {
  const { v } = useStore();
  const ev = useMemo(() => pulseEvents(v.rows), [v.rows]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, x = c?.getContext("2d");
    if (!c || !x) return;   // jsdom and canvas-less browsers: nothing to draw
    const dpr = Math.min(2, window.devicePixelRatio || 1), t0 = performance.now(), N = ev.length, CYC = Math.max(1, N) * GAP;
    const col = (n: string) => cssVar(n, c) || "#888";   // read once: the frame loop never touches the DOM
    const tc = [col("--s2c"), col("--accent"), col("--s3c")], oc = [col("--good"), col("--amber"), col("--bad")];
    const ink = col("--ink"), mu = col("--muted"), ln = col("--line-2"), sans = col("--sans");
    const models: string[][] = [[], [], []];
    for (const e of ev) if (!models[e.tier].includes(e.model)) models[e.tier].push(e.model);
    const moving = fxOn() && !reducedNow();

    const draw = (now: number) => {
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); x.textBaseline = "middle";
      x.font = `600 9px ${sans}`;
      let LW = 0;
      for (let k = 0; k < 3; k++) LW = Math.max(LW, x.measureText(`${TIERS[k]}  ${models[k].join(", ")}`).width);
      const T = moving ? now - t0 : TRAVEL + 200;   // static frame: the newest comet has just landed, its verdict shows
      const L = w > 420 ? Math.min(LW + 10, w * 0.3) : w > 300 ? 34 : 4, tz = w > 440 ? Math.min(TICKER, w * 0.42) : 0, fx = w - tz - 10;
      const ly = [h * 0.2, h * 0.5, h * 0.8];
      for (let k = 0; k < 3; k++) {
        x.globalAlpha = 1; x.strokeStyle = ln; x.lineWidth = SCALE[k]; x.beginPath(); x.moveTo(L, ly[k]); x.lineTo(fx, ly[k]); x.stroke();
        if (L > 4) {
          x.save(); x.beginPath(); x.rect(0, 0, L - 4, h); x.clip(); x.textAlign = "left";
          x.font = `600 9px ${sans}`; x.fillStyle = tc[k]; x.fillText(TIERS[k], 0, ly[k]);
          if (L > 40) { const lw = x.measureText(`${TIERS[k]} `).width; x.font = `9px ${sans}`; x.fillStyle = mu; x.fillText(models[k].join(", "), lw, ly[k]); }
          x.restore();
        }
      }
      let best = -1, ba = 1e9;
      for (let i = 0; i < N; i++) {
        const e = ev[i], s = SCALE[e.tier], a = (((T - i * GAP) % CYC) + CYC) % CYC, p = a / TRAVEL;
        if (a >= TRAVEL && a < ba) { ba = a; best = i; }
        if (p < 1) {
          const hx = L + (fx - L) * p, y = ly[e.tier] + (e.out === 2 ? Math.sin(p * 38) * 2.2 * s : 0), len = Math.min(hx - L, 10 + e.k * 7 * s);
          x.fillStyle = oc[e.out];
          for (let j = 0; j < 5; j++) { x.globalAlpha = cl(p * 10) * (0.15 + 0.17 * j); x.fillRect(hx - len + (j * len) / 5, y - 2.2 * s, len / 5 + 1, 4.4 * s); }
          x.globalAlpha = cl(p * 10); x.beginPath(); x.arc(hx, y, 2.6 * s, 0, 7); x.fill();
        } else if (a < TRAVEL + 450) {
          const q = (a - TRAVEL) / 450;
          x.globalAlpha = 1 - q; x.strokeStyle = oc[e.out]; x.lineWidth = 1.5; x.beginPath(); x.arc(fx, ly[e.tier], 2 + q * 9, 0, 7); x.stroke();
        }
      }
      x.globalAlpha = 1;
      if (tz && best >= 0) {
        const e = ev[best], X = fx + 14;
        x.globalAlpha = cl((ba - TRAVEL) / 250); x.strokeStyle = ln; x.lineWidth = 1; x.beginPath(); x.moveTo(X - 8, 6); x.lineTo(X - 8, h - 6); x.stroke();
        x.save(); x.beginPath(); x.rect(X, 0, tz - 4, h); x.clip(); x.textAlign = "left";
        x.font = `600 11.5px ${sans}`; x.fillStyle = oc[e.out] === oc[1] ? ink : oc[e.out]; x.fillText(MARK[e.out] + e.l1, X, h * 0.34);
        x.font = `10.5px ${sans}`; x.fillStyle = mu; x.fillText(e.l2, X, h * 0.7); x.restore(); x.globalAlpha = 1;
      }
    };

    let raf = 0;
    const loop = (n: number) => { if (!document.hidden) draw(n); raf = requestAnimationFrame(loop); };   // paused while the tab is hidden
    if (moving && N) raf = requestAnimationFrame(loop); else draw(performance.now());
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { if (!raf) draw(performance.now()); });
    ro?.observe(c);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [ev]);
  return <canvas ref={ref} className="pulse" aria-hidden="true" />;
}
