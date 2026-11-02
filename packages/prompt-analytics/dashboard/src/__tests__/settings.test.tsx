import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Prefs } from "../components/Shell";
import { applySettings, loadSettings } from "../lib/settings";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const root = document.documentElement;
afterEach(() => { localStorage.clear(); root.removeAttribute("data-accent"); root.style.removeProperty("--glass"); document.body.innerHTML = ""; });

describe("display settings", () => {
  it("falls back to defaults on missing or junk storage", () => {
    expect(loadSettings()).toEqual({ accent: "blue", glass: 2 });
    localStorage.setItem("pa.settings", "{not json");
    expect(loadSettings()).toEqual({ accent: "blue", glass: 2 });
    localStorage.setItem("pa.settings", JSON.stringify({ accent: "pink", glass: 9 }));
    expect(loadSettings()).toEqual({ accent: "blue", glass: 2 });
  });

  it("applies stored settings to :root", () => {
    localStorage.setItem("pa.settings", JSON.stringify({ accent: "teal", glass: 0 }));
    applySettings(loadSettings());
    expect(root.dataset.accent).toBe("teal");
    expect(root.style.getPropertyValue("--glass")).toBe("0");
  });

  it("panel changes apply, persist, and Esc closes it", () => {
    const el = document.body.appendChild(document.createElement("div"));
    const r = createRoot(el);
    act(() => r.render(<Prefs />));
    const btn = el.querySelector<HTMLButtonElement>(".setbtn")!;
    act(() => btn.click());
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => el.querySelector<HTMLInputElement>('input[value="violet"]')!.click());
    const range = el.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(range, "0"); range.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(root.dataset.accent).toBe("violet");
    expect(root.style.getPropertyValue("--glass")).toBe("0");
    expect(JSON.parse(localStorage.getItem("pa.settings")!)).toEqual({ accent: "violet", glass: 0 });
    expect(el.querySelector("output")!.textContent).toBe("Off (solid)");
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(btn);
    act(() => r.unmount());
  });
});
