import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { StoreProvider } from "../state";
import { Recommend } from "../components/Recommend";
import { fromHash } from "../lib/hash";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const d = normalize(sample);
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const mount = () => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={d} />)); };

describe("Do next card", () => {
  it("sits under the Brief with Drivers after it, and replaces the retired sections", () => {
    mount();
    const kids = [...el.querySelectorAll("#s-overview .grid > *")].map((c) => c.id || c.className);
    expect(kids[0]).toMatch(/brief/);
    expect(kids[1]).toBe("s-next");
    expect(kids[2]).toBe("s-driver");
    expect(el.querySelector("#s-attention, #s-recs")).toBeNull();
    expect(el.querySelector("#main")?.textContent).not.toMatch(/Needs attention|Recommendations/);
  });
  it("shows three rows and one toggle that shows all of them", () => {
    mount();
    expect(el.querySelectorAll("#s-next li[data-next]")).toHaveLength(3);
    const more = el.querySelector<HTMLButtonElement>("#s-next .more")!, k = +/\((\d+)\)/.exec(more.textContent!)![1];
    expect(more.getAttribute("aria-expanded")).toBe("false");
    act(() => more.click());
    expect(el.querySelectorAll("#s-next li[data-next]")).toHaveLength(k);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(more.textContent).toBe("Show fewer");
    expect(document.activeElement?.closest("li")?.getAttribute("data-next")).toBe(el.querySelectorAll("#s-next li")[3].getAttribute("data-next"));
  });
  it("every why-tag names the row that proves the section after it", () => {
    mount();
    const tags = [...el.querySelectorAll("p.why-tag")];
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) expect(t.textContent).toMatch(/^#\d+ \S/);
  });
  it("empty data says nothing is flagged and offers no toggle", () => {
    const html = renderToStaticMarkup(<StoreProvider d={normalize({ schema: "1.0" })}><Recommend /></StoreProvider>);
    expect(html).toMatch(/Nothing flagged in this window\./);
    expect(html).toMatch(/No actions\. Checked: /);
    expect(html).not.toMatch(/Show all/);
  });
  it("old section links land on the card", () => {
    expect(fromHash("#s-recs").sec).toBe("s-next");
    expect(fromHash("#/s-attention").sec).toBe("s-next");
  });
});
