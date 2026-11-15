// Overview hero, right: the hour-by-weekday prompts as a small, non-interactive 3D terrain (the Time view's Bars3D, same lazy chunk), 2D cells
// without WebGL or under 481px. The whole card is one button to the Time view's Hour by weekday card; the plot inside is inert.
import { lazy, Suspense, useMemo } from "react";
import { useStore } from "../state";
import { fmtInt } from "../lib/format";
import { hasWebGL } from "../lib/hooks";
import { useWide } from "./Time";
import type { B3Cell } from "./Bars3D";

const Bars3D = lazy(() => import("./Bars3D"));
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourTick = (h: number) => (h % 6 === 0 ? `${h}h` : "");
const none = () => "";

export function Rhythm() {
  const { d, goto } = useStore();
  const wide = useWide(), gl = useMemo(hasWebGL, []);
  const { cells, peak, best } = useMemo(() => {
    const g = new Map(d.hour_week.map((h) => [`${h.dow}:${h.hour}`, h.prompts]));
    const peak = Math.max(1, ...d.hour_week.map((h) => h.prompts));
    const best = d.hour_week.reduce((a, b) => (b.prompts > a.prompts ? b : a), { dow: 0, hour: 0, prompts: 0 });
    const cells: B3Cell[] = [];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 24; c++) { const v = g.get(`${r}:${c}`) ?? 0; cells.push({ c, r, v, mix: v / peak, tip: "", mark: v === best.prompts && v > 0 }); }
    return { cells, peak, best };
  }, [d.hour_week]);
  if (!d.hour_week.length) return null;
  const slot = `${DOW[best.dow]} ${best.hour}:00`;
  const flat = (
    <div className="rh-2d" aria-hidden="true">
      {cells.map((x) => <i key={`${x.r}:${x.c}`} data-top={x.mark || undefined} style={{ "--v": x.mix } as React.CSSProperties} />)}
    </div>
  );
  return (
    <div className="card rhythm" role="group" aria-label="Your rhythm at a glance">
      <header className="card-h"><h3>Your rhythm at a glance</h3><span className="meta">prompts by hour × weekday</span></header>
      <div className="rh-plot" inert>
        {wide && gl ? <Suspense fallback={flat}><Bars3D cells={cells} cols={24} rows={7} rowLabels={DOW} colLabel={hourTick} summary="" max={peak} zLabel={none} hMin={260} hMax={340} ratio={1.4} deep={1.4} /></Suspense> : flat}
      </div>
      <p className="so rh-cap"><span>Peak <b>{slot}</b>, {fmtInt(best.prompts)} prompts</span><span className="rh-go" aria-hidden="true">Open Time →</span></p>
      <button type="button" className="rh-hit" onClick={() => goto("s-golden")}
        aria-label={`Your rhythm at a glance: most prompts land ${slot}, ${fmtInt(best.prompts)} prompts. Open Hour by weekday in the Time view`} />
    </div>
  );
}
