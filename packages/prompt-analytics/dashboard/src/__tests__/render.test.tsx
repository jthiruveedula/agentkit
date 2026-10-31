import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { StoreProvider } from "../state";
import { Overview } from "../components/Overview";
import { Tools } from "../components/Tools";
import { Time } from "../components/Time";
import { Funnel } from "../components/Funnel";
import { Friction } from "../components/Friction";
import { Works } from "../components/Works";
import { Exposure } from "../components/Exposure";
import { Recommend } from "../components/Recommend";
import { Sessions } from "../components/Sessions";

// Empty data: every section must render without throwing and show an empty state, not marks.
const d = normalize({ schema: "1.0" });
describe("empty data", () => {
  for (const [name, C] of Object.entries({ Overview, Tools, Time, Funnel, Friction, Works, Exposure, Recommend, Sessions })) {
    it(`${name} renders`, () => {
      const html = renderToStaticMarkup(<StoreProvider d={d}><C /></StoreProvider>);
      expect(html.length).toBeGreaterThan(0);
    });
  }
  it("Exposure shows a clean state", () => {
    expect(renderToStaticMarkup(<StoreProvider d={d}><Exposure /></StoreProvider>)).toMatch(/No sensitive data detected/);
  });
});
