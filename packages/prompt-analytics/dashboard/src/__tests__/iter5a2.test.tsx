// Iteration 5a-2: calendar touch toggle, whole-export labels, header structure.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dashboard } from "../App";
import { normalize } from "../data/load";
import sample from "../data/sample.dev.json";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null, el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = null; location.hash = ""; });
const mount = () => { el = document.createElement("div"); document.body.append(el); root = createRoot(el); act(() => root!.render(<Dashboard d={normalize(sample as never)} />)); };

describe("5a-2 UI", () => {
  it("Exposure says previews are masked, Recommendations say they ignore filters", () => {
    mount();
    expect(el.querySelector("#s-exposure")?.textContent).toMatch(/masked/);
    expect(el.querySelector("#s-next")?.textContent).toMatch(/whole export/);
  });
  it("header keeps the palette button and the toolbar row is its own sticky group", () => {
    mount();
    expect(el.querySelector(".top-tools .kbd")).toBeTruthy();
    expect(el.querySelector(".top-tools .fbtn")).toBeTruthy();
    expect(el.querySelector(".brand .glyph")).toBeTruthy();
  });
  it("3D calendar: Tap to rotate toggles Done and back", () => {
    mount();
    act(() => { [...el.querySelectorAll<HTMLButtonElement>("button.tog3")][0]?.click(); });
    const b = el.querySelector<HTMLButtonElement>(".cal-touch");
    expect(b?.textContent).toBe("Tap to rotate");
    act(() => b!.click());
    expect(el.querySelector(".cal-touch")?.textContent).toBe("Done");
    act(() => el.querySelector<HTMLButtonElement>(".cal-touch")!.click());
    expect(el.querySelector(".cal-touch")?.textContent).toBe("Tap to rotate");
  });
});
