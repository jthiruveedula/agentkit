import { describe, expect, it, vi } from "vitest";
import { NAV } from "../components/Shell";
import { SECTIONS } from "../lib/hash";

describe("nav order", () => {
  it("puts the mind map last, in its own Explore group", () => {
    expect(NAV.at(-1)).toEqual({ group: "Explore", items: [{ id: "s-map", text: "Mind map" }] });
    expect(SECTIONS.at(-1)).toBe("s-map");
  });
});

describe("scroll-spy lock", () => {
  it("goto pins the spy to the clicked section until the lock expires", async () => {
    const { lockSpy, spyLocked } = await import("../lib/hash");
    // Fake clock: a real 30 ms window races GC/thread stalls under the full parallel suite.
    vi.useFakeTimers();
    try {
      lockSpy("s-works", 30);
      expect(spyLocked()).toBe("s-works");
      vi.advanceTimersByTime(29);
      expect(spyLocked()).toBe("s-works");
      vi.advanceTimersByTime(11);
      expect(spyLocked()).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
