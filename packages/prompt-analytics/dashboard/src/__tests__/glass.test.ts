import { afterEach, describe, expect, it, vi } from "vitest";
import { initFx, initGlass } from "../lib/hooks";

// html.glass is its own flag: on in a real browser unless the OS asks for solid surfaces; reduced motion only turns motion (html.fx) off.
const cls = document.documentElement.classList;
const ua = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), "userAgent")!;
/** A real browser with these media queries matching; returns a setter that flips one live and fires its change listeners. */
function browser(on: string[]) {
  const hits = new Set(on), subs = new Map<string, (() => void)[]>();
  Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Safari", configurable: true });
  vi.stubGlobal("IntersectionObserver", class {});
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() { return hits.has(q); },
    addEventListener: (_: string, f: () => void) => subs.set(q, [...(subs.get(q) ?? []), f]),
    removeEventListener: () => {},
  }));
  return (q: string, m: boolean) => { if (m) hits.add(q); else hits.delete(q); subs.get(q)?.forEach((f) => f()); };
}
afterEach(() => { vi.unstubAllGlobals(); delete (navigator as { userAgent?: string }).userAgent; Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", ua); cls.remove("glass", "fx"); });

describe("html.glass flag", () => {
  it("is on with no preference, alongside motion", () => {
    browser([]); initFx(); initGlass();
    expect(cls.contains("glass")).toBe(true); expect(cls.contains("fx")).toBe(true);
  });
  it("reduced motion alone keeps glass and turns motion off", () => {
    browser(["(prefers-reduced-motion: reduce)"]); initFx(); initGlass();
    expect(cls.contains("glass")).toBe(true); expect(cls.contains("fx")).toBe(false);
  });
  it.each(["(prefers-reduced-transparency: reduce)", "(prefers-contrast: more)", "(forced-colors: active)"])("%s turns it off", (q) => {
    browser([q]); initGlass();
    expect(cls.contains("glass")).toBe(false);
  });
  it("follows a preference change live", () => {
    const flip = browser([]); initGlass();
    flip("(prefers-contrast: more)", true); expect(cls.contains("glass")).toBe(false);
    flip("(prefers-contrast: more)", false); expect(cls.contains("glass")).toBe(true);
  });
  it("never turns on in jsdom", () => {
    initGlass();
    expect(cls.contains("glass")).toBe(false);
  });
});
