// Overview strip: the hour-by-weekday prompts twice. Heat: a 24 x 7 viridis grid. Rhythm: a small 3D terrain (the Time view's Bars3D, same lazy
// chunk; 2D cells without WebGL or under 481px). The terrain's caption is a button to the Time view's Hour by weekday card; a click on the plot goes there too.
import { lazy, Suspense, useMemo } from "react";
import { useStore } from "../state";
import { fmtInt } from "../lib/format";
import { hasWebGL } from "../lib/hooks";
import { useWide } from "./Time";
import { W } from "./ui";
import { viridis } from "./charts";
import type { B3Cell } from "./Bars3D";

const Bars3D = lazy(() => import("./Bars3D"));
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const none = () => "";
const nP = (n: number) => `${fmtInt(n)} prompt${n === 1 ? "" : "s"}`;

function useGrid() {
  const { d } = useStore();
  return useMemo(() => {
    const g = new Map(d.hour_week.map((h) => [`${h.dow}:${h.hour}`, h.prompts]));
    const peak = Math.max(1, ...d.hour_week.map((h) => h.prompts));
    const best = d.hour_week.reduce((a, b) => (b.prompts > a.prompts ? b : a), { dow: 0, hour: 0, prompts: 0 });
    const cells: B3Cell[] = [];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 24; c++) { const v = g.get(`${r}:${c}`) ?? 0; cells.push({ c, r, v, mix: v / peak, tip: `${DOW[r]} ${c}:00: ${nP(v)}`, mark: v === best.prompts && v > 0 }); }
    // the busiest 3-hour block across the week
    const hr = Array.from({ length: 24 }, (_, h) => cells.reduce((s, x) => s + (x.c === h ? x.v : 0), 0));
    const h0 = hr.reduce((b, _, h) => (h <= 21 && hr[h] + hr[h + 1] + hr[h + 2] > hr[b] + hr[b + 1] + hr[b + 2] ? h : b), 0);
    return { cells, peak, best, h0, n: d.hour_week.length };
  }, [d.hour_week]);
}

export function Heat() {
  const { cells, peak, best, h0, n } = useGrid();
  if (!n) return null;
  return (
    <W n={3} ic="heat" t="Rhythm heatmap" className="heat" cap={<span className="hm-k">quiet <i aria-hidden="true" /> busy</span>}
      label={`Prompts by hour and weekday, purple quiet to yellow busy. Busiest block ${h0}:00 to ${h0 + 3}:00`}>
      <p className="w-v"><b className="w-n">{h0}–{h0 + 3}h</b><span className="w-u">busiest</span></p>
      <div className="hm" role="img" aria-label={`Busiest slot ${DOW[best.dow]} ${best.hour}:00, ${nP(best.prompts)}`}>
        {cells.map((x) => <i key={`${x.r}:${x.c}`} title={x.tip} style={{ "--day": x.r, ...(x.v ? { background: viridis(x.v / peak) } : {}) } as React.CSSProperties} />)}
      </div>
    </W>
  );
}

export function Rhythm() {
  const { goto } = useStore();
  const wide = useWide(), gl = useMemo(hasWebGL, []);
  const { cells, peak, best, n } = useGrid();
  if (!n) return null;
  const slot = `${DOW[best.dow]} ${best.hour}:00`;
  const flat = (
    <div className="rh-2d" aria-hidden="true">
      {cells.map((x) => <i key={`${x.r}:${x.c}`} data-top={x.mark || undefined} style={{ "--v": x.mix } as React.CSSProperties} />)}
    </div>
  );
  return (
    <W n={6} ic="terrain" t="Rhythm terrain" className="rhythm"
      cap={<button type="button" className="rh-go" onClick={() => goto("s-golden")}
        aria-label={`Rhythm terrain: most prompts land ${slot}, ${nP(best.prompts)}. Open Hour by weekday in the Time view`}>Peak <b>{slot}</b>, {nP(best.prompts)}</button>}>
      <div className="rh-plot" aria-hidden="true" onClick={() => goto("s-golden")}>
        {wide && gl ? <Suspense fallback={flat}><Bars3D mini cells={cells} cols={24} rows={7} rowLabels={DOW} colLabel={none} summary="" max={peak} zLabel={none} hMin={88} hMax={96} ratio={2} deep={1.4} /></Suspense> : flat}
      </div>
    </W>
  );
}
