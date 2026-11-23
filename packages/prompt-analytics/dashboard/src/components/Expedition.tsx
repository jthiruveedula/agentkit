import type { Week } from "../lib/briefing";
import { fmtDate, fmtInt, fmtPct, fmtUSD } from "../lib/format";
import { Card, Empty } from "./ui";

export function Expedition({ weekly }: { weekly: Week[] }) {
  const weeks = weekly.filter((w) => w.sessions > 0).slice().reverse();
  return (
    <Card
      title="Expedition log"
      so={weeks.length ? <><b>{fmtInt(weeks.length)}</b> active weeks logged, newest first.</> : "No active weeks in this window."}
      thin={weeks.length === 0}
      meta="week by week, newest first" id="s-log" span={12}>
      {weeks.length === 0 ? (
        <Empty>No weeks with sessions yet.</Empty>
      ) : (
        <ol className="todo">
          {weeks.map((w, i) => (
            <li key={w.week}>
              <span className="num">{weeks.length - i}</span>
              <div>
                <strong>Week of {fmtDate(w.week)}</strong>
                <p>
                  {fmtInt(w.sessions)} sessions · {fmtInt(w.prompts)} prompts ·{" "}
                  {w.struggled == null ? "struggle –" : `${fmtPct(w.struggled)} struggled (n=${fmtInt(w.n)})`} ·{" "}
                  {w.spend == null ? "spend –" : `${fmtUSD(w.spend)} spend`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
