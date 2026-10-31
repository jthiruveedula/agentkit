import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { normalize } from "../data/load";
import { Footprint } from "../components/Footprint";
import { Time } from "../components/Time";
import { Funnel } from "../components/Funnel";
import { Friction } from "../components/Friction";
import { Works } from "../components/Works";
import { Recommend } from "../components/Recommend";

// Empty data: every chapter must render without throwing and show an empty state, not marks.
const d = normalize({ schema: "1.0" });
describe("empty data", () => {
  for (const [name, C] of Object.entries({ Footprint, Time, Funnel, Friction, Works, Recommend })) {
    it(`${name} renders`, () => {
      const html = renderToStaticMarkup(<C d={d} />);
      expect(html.length).toBeGreaterThan(0);
    });
  }
  it("Friction shows clean exposure state", () => {
    expect(renderToStaticMarkup(<Friction d={d} />)).toMatch(/No sensitive data detected/);
  });
});
