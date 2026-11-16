// Lit, orbitable 3D bars (ECharts GL bar3D) for the activity calendar and the hour-by-weekday card. Lazy-loaded: only mounted once 3D is on
// and WebGL exists, so the 2D path never builds it. Orthographic, so equal values are equal pixel heights at any depth. Bar height is value from zero.
// Drag = orbit (beta +-50), arrows rotate 10 degrees, + / - zoom, 0 / Escape reset. The 2D grid and the DataTable stay the accessible views.
// Colours are the --accent / --sunk / --line / --muted / --amber tokens as sRGB hex (zrender cannot parse oklch); design spec c9-fable.
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { Bar3DChart, Line3DChart } from "echarts-gl/charts";
import { Grid3DComponent } from "echarts-gl/components";
import { reducedNow, useSize } from "../lib/hooks";
import { clamp } from "../lib/math";
import { RELIEF, useTheme } from "../lib/theme";

// CanvasRenderer: echarts-gl paints axis labels through a 2D zrender canvas; without a registered painter no label text draws
echarts.use([CanvasRenderer, TooltipComponent, Bar3DChart, Line3DChart, Grid3DComponent]);

/** One bar: grid position, value, colour strength 0..1, hover text. mark = best hour (amber), off = outside the date window (flat grey plate), sel = selected day. */
export interface B3Cell { c: number; r: number; v: number; mix: number; tip: string; mark?: boolean; off?: boolean; sel?: boolean }
interface Props {
  cells: B3Cell[]; cols: number; rows: number; colLabel: (c: number) => string; rowLabels: string[]; summary: string;
  max: number; zLabel: (v: number) => string; chips?: { color: string; text: string }[];
  /** canvas height is clamp(hMin, width / ratio, hMax) */ hMin: number; hMax: number; ratio: number; onPick?: (i: number, shift: boolean) => void;
  /** the selected window, drawn as a 1px accent outline on the floor around columns c0..c1 */ frame?: { c0: number; c1: number; label: string };
  /** row depth as a multiple of the column width (default 1): deeper rows keep seven 11px row labels apart on a wide, shallow grid */ deep?: number;
  /** widget size: no axis labels, no orbit, out of the tab order; after the grow the camera drifts slowly and the marked bar pulses twice (not under reduced motion) */ mini?: boolean;
}

const CELL = 8, ALPHA = 36, BETA = -16, T = 420, TC = 900, SWING = 14;
const ramp = (st: [number, string][], t: number) => {
  t = Math.min(1, Math.max(0, t));
  let i = 1; while (i < st.length - 1 && t > st[i][0]) i++;
  const [a, ca] = st[i - 1], [b, cb] = st[i], f = (t - a) / (b - a || 1);
  const ch = (h: string, k: number) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16);
  return "#" + [0, 1, 2].map((k) => Math.round(ch(ca, k) + (ch(cb, k) - ch(ca, k)) * f).toString(16).padStart(2, "0")).join("");
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tipHtml = (s: string) => { const m = /^(.*?)(?:: |, )(.*)$/.exec(s); return m ? `<b style="font-weight:600">${esc(m[1])}</b><br>${esc(m[2])}` : `<b style="font-weight:600">${esc(s)}</b>`; };
/** Orthographic size that fits the rotated box with 12% margin across, and 24px above and below (hpx = canvas height) so the axis labels under the front edge are never cut.
 *  `tight` (mini, no labels): 4% across, 4px above and below. */
const fit = (bw: number, bd: number, bh: number, a: number, b: number, aspect: number, hpx: number, tight = false) => {
  const A = (a * Math.PI) / 180, B = (Math.abs(b) * Math.PI) / 180;
  const W = bw * Math.cos(B) + bd * Math.sin(B), H = (bw * Math.sin(B) + bd * Math.cos(B)) * Math.sin(A) + bh * Math.cos(A);
  return Math.max(H / Math.max(0.5, 1 - (tight ? 8 : 48) / hpx), W / aspect / (tight ? 0.82 : 0.88));
};

export default function Bars3D({ cells, cols, rows, colLabel, rowLabels, summary, max, zLabel, chips = [], hMin, hMax, ratio, onPick, frame, deep = 1, mini = false }: Props) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLDivElement>(null), live = useRef<HTMLParagraphElement>(null);
  const chart = useRef<echarts.ECharts | null>(null), raf = useRef(0), grown = useRef(false), seen = useRef(true);
  const P = useRef({ cells, onPick }); P.current = { cells, onPick };
  const wrapSize = useSize(box);
  const height = clamp(wrapSize.w / ratio, hMin, hMax);
  const bw = cols * CELL, bd = rows * CELL * deep, bh = 28;
  const S = useRef(1); S.current = wrapSize.w > 0 ? fit(bw, bd, bh, ALPHA, BETA, wrapSize.w / height, height, mini) : 1;
  const reduced = () => reducedNow();
  const pal = RELIEF[useTheme()];

  const cam = () => {   // the live camera after a drag, else the defaults
    const v = (chart.current?.getOption() as { grid3D?: { viewControl?: { alpha?: number; beta?: number; orthographicSize?: number } }[] } | undefined)?.grid3D?.[0]?.viewControl;
    return { alpha: v?.alpha ?? ALPHA, beta: v?.beta ?? BETA, size: v?.orthographicSize ?? S.current };
  };
  const set = (v: { alpha?: number; beta?: number; orthographicSize?: number }, say: string) => { chart.current?.setOption({ grid3D: { viewControl: v } }); if (live.current) live.current.textContent = say; };

  const items = useMemo(() => cells.map((x, i) => ({
    c: x.c, r: x.r, z: x.off ? 0 : x.v, i, tip: x.tip,
    mark: !x.sel && !x.off && !!x.mark,
    color: x.sel ? pal.sel : x.off ? ramp(pal.off, x.mix) : x.mark ? pal.mark : x.v > 0 ? ramp(pal.ramp, x.mix) : pal.zero,
  })), [cells, pal]);
  // y is reversed: row 0 (Mon) is farthest, the last row nearest
  const data = (t: number) => items.map((x) => ({ value: [x.c, rows - 1 - x.r, x.z * t], i: x.i, tip: x.tip, itemStyle: { color: x.color } }));

  useEffect(() => {
    const el = cv.current, bx = box.current; if (!el || !bx) return;
    const c = echarts.init(el, null, { devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) }); chart.current = c;
    c.on("click", (p) => { const i = (p.data as { i?: number } | null)?.i; if (i !== undefined) P.current.onPick?.(i, !!(p.event?.event as MouseEvent | undefined)?.shiftKey); });
    // the wheel scrolls the page: it never reaches the chart
    const wheel = (e: WheelEvent) => e.stopPropagation();
    bx.addEventListener("wheel", wheel, { capture: true });
    const io = new IntersectionObserver(([e]) => { seen.current = e.isIntersecting; }); io.observe(bx);
    return () => { io.disconnect(); cancelAnimationFrame(raf.current); bx.removeEventListener("wheel", wheel, { capture: true }); c.dispose(); chart.current = null; grown.current = false; };
  }, []);

  useEffect(() => { const c = chart.current; if (!c) return; c.resize(); if (grown.current) c.setOption({ grid3D: { viewControl: { orthographicSize: S.current, minOrthographicSize: 0.6 * S.current, maxOrthographicSize: 1.2 * S.current } } }); }, [wrapSize.w, height]);

  useEffect(() => {
    const c = chart.current; if (!c) return;
    const rd = reduced(), muted = pal.muted, axisLine = { lineStyle: { color: pal.axis, width: 1 } };
    const names = (n: number) => Array.from({ length: n }, (_, i) => String(i));
    const axis = (n: number, label: (i: number) => string) => ({ type: "category" as const, name: "", data: names(n), axisLabel: { show: !mini, interval: 0, color: muted, fontSize: 11, margin: 10, formatter: (v: string) => label(+v) }, axisLine, axisTick: { show: false }, splitLine: { show: false }, splitArea: { show: false } });
    const first = !grown.current;
    const f0 = frame ? frame.c0 - 0.5 : 0, f1 = frame ? frame.c1 + 0.5 : 0, y0 = -0.5, y1 = rows - 0.5;
    c.setOption({
      animation: false,
      tooltip: { confine: true, backgroundColor: pal.tipBg, borderColor: pal.tipLine, borderWidth: 1, padding: [8, 10], transitionDuration: rd ? 0 : 0.12, textStyle: { color: pal.tipInk, fontSize: 12, lineHeight: 16 }, extraCssText: pal.tipCss + " max-width: 240px; white-space: normal;", formatter: (p: { data?: { tip: string } }) => tipHtml(p.data?.tip ?? "") },
      xAxis3D: axis(cols, colLabel), yAxis3D: axis(rows, (i) => rowLabels[rows - 1 - i] ?? ""),
      zAxis3D: { type: "value", name: "", min: 0, max, splitNumber: 3, axisLabel: { show: !mini, color: muted, fontSize: 11, margin: 16, formatter: (v: number) => zLabel(v) }, axisLine, axisTick: { show: false }, splitLine: { lineStyle: { color: mini ? pal.splitMini : pal.split, width: 1 } }, splitArea: { show: false } },
      grid3D: {
        boxWidth: bw, boxDepth: bd, boxHeight: bh,
        light: pal.light,
        axisPointer: { show: false }, postEffect: { enable: false }, temporalSuperSampling: { enable: false },
        viewControl: {
          projection: "orthographic", ...cam(), orthographicSize: cam().size, minAlpha: 12, maxAlpha: 85, minBeta: -50, maxBeta: 50, distance: 200, minDistance: 200, maxDistance: 200,
          minOrthographicSize: 0.6 * S.current, maxOrthographicSize: 1.2 * S.current, panMouseButton: null, panSensitivity: 0, zoomSensitivity: 0, rotateSensitivity: mini ? 0 : 1,
          autoRotate: false, damping: rd ? 0 : 0.8, animationDurationUpdate: rd ? 0 : 300, animationEasingUpdate: "cubicOut",
        },
      },
      series: [{ type: "bar3D", shading: "lambert", barSize: [CELL * 0.8, CELL * 0.8 * deep], bevelSize: pal.bevel, bevelSmoothness: 2, minHeight: 0.4, emphasis: { itemStyle: { color: pal.hover }, label: { show: false } }, data: data(first && !rd ? 0 : 1) },
        ...(frame ? [{ type: "line3D", silent: true, lineStyle: { color: pal.frame, width: 1, opacity: 1 }, data: [[f0, y0, 0], [f1, y0, 0], [f1, y1, 0], [f0, y1, 0], [f0, y0, 0]] }] : [])],
    }, { replaceMerge: ["series"] });
    grown.current = true;
    if (first && !rd) {   // grow from the floor, cubic-out; the z scale stays fixed. The camera settles from SWING degrees off over TC ms: the parallax tells rows (depth) from columns
      cancelAnimationFrame(raf.current);
      const t0 = performance.now(), out = (t: number) => 1 - (1 - t) ** 3; let up = false;
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / T), tc = Math.min(1, (now - t0) / TC);
        c.setOption({ grid3D: { viewControl: { beta: BETA - SWING * (1 - out(tc)), animationDurationUpdate: tc < 1 ? 0 : 300 } }, ...(up ? {} : { series: [{ data: data(out(t)) }] }) });
        up = t >= 1;
        if (tc < 1) raf.current = requestAnimationFrame(tick);
        else if (mini) raf.current = requestAnimationFrame(idle);
      };
      // idle: the camera sways +-6 degrees over 14s (paused off-screen or in a hidden tab); the marked bar pulses twice over the first 1.6s
      const t1 = t0 + TC, hot = items.map((x) => x.mark);
      const idle = (now: number) => {
        const s = (now - t1) / 1000;
        if (seen.current && !document.hidden) {
          const pulse = s < 1.6 ? Math.sin((s / 0.8) * Math.PI) ** 2 : 0;
          c.setOption({ grid3D: { viewControl: { beta: BETA + 6 * Math.sin((s / 14) * 2 * Math.PI), animationDurationUpdate: 0 } },
            ...(s < 1.7 ? { series: [{ data: data(1).map((d, i) => (hot[i] ? { ...d, value: [d.value[0], d.value[1], (d.value[2] as number) * (1 + 0.18 * pulse)], itemStyle: { color: pulse > 0.5 ? pal.pulse : pal.mark } } : d)) }] } : {}) });
        }
        raf.current = requestAnimationFrame(idle);
      };
      tick(t0);
    }
  }, [items, cols, rows, colLabel, rowLabels, max, zLabel, frame?.c0, frame?.c1]);   // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => set({ alpha: ALPHA, beta: BETA, orthographicSize: S.current }, "View reset");
  const key = (e: React.KeyboardEvent) => {
    const v = cam(), turn = (a: number, b: number) => set({ alpha: clamp(v.alpha + a, 12, 85), beta: clamp(v.beta + b, -50, 50) }, "View rotated");
    const zoom = (d: number) => set({ orthographicSize: clamp(v.size + d * S.current, 0.6 * S.current, 1.2 * S.current) }, "View zoomed");
    const k = e.key;
    if (k === "ArrowLeft") turn(0, -10); else if (k === "ArrowRight") turn(0, 10); else if (k === "ArrowUp") turn(10, 0); else if (k === "ArrowDown") turn(-10, 0);
    else if (k === "+" || k === "=") zoom(-0.1); else if (k === "-") zoom(0.1);
    else if (k === "0" || k === "Escape") reset();
    else return;
    e.preventDefault();
  };

  return (
    <div className="b3d" ref={box} tabIndex={mini ? -1 : 0} role="group" onKeyDown={mini ? undefined : key} aria-hidden={mini || undefined}
      aria-label={`3D bars. ${summary} Drag to orbit. Arrow keys rotate, plus and minus zoom, 0 or Escape resets. The table below has every value.`}>
      <div className="b3d-bar">
        <span className="note">Bar height: 0 to {zLabel(max)}</span><i className="b3d-ramp" aria-hidden="true" />
        {frame && <span className="b3d-chip note"><i style={{ boxShadow: `inset 0 0 0 1px ${pal.frame}` }} aria-hidden="true" />{frame.label}</span>}
        {chips.map((x) => <span key={x.text} className="b3d-chip note"><i style={{ background: x.color }} aria-hidden="true" />{x.text}</span>)}
        <button type="button" className="btn b3d-reset" onClick={reset}>Reset view</button>
      </div>
      <div className="b3d-cv" ref={cv} style={{ height }} />
      <p className="note b3d-hint">Drag to orbit. Arrows rotate, + and - zoom, 0 resets.</p>
      <p className="sr-only" aria-live="polite" ref={live}>{summary}</p>
    </div>
  );
}
