import { describe, expect, it } from "vitest";
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
    lockSpy("s-works", 30);
    expect(spyLocked()).toBe("s-works");
    await new Promise((r) => setTimeout(r, 40));
    expect(spyLocked()).toBeNull();
  });
});
