import { describe, expect, it } from "vitest";
import { boxesTouch, labelTop } from "../lib/labels";

describe("map labels", () => {
  it("caps at 8, hotspots first then by weight", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, w: i, hot: i === 0 }));
    const top = labelTop(items, 8);
    expect(top).toHaveLength(8); expect(top[0]).toBe("n0"); expect(top.slice(1)).toEqual(["n19", "n18", "n17", "n16", "n15", "n14", "n13"]);
  });
  it("is stable on ties", () => { expect(labelTop([{ id: "b", w: 1 }, { id: "a", w: 1 }], 1)).toEqual(["a"]); });
  it("touching or near boxes collide, clear ones do not", () => {
    expect(boxesTouch([0, 0, 10, 10], [10, 0, 10, 10])).toBe(false);
    expect(boxesTouch([0, 0, 10, 10], [10, 0, 10, 10], 4)).toBe(true);
    expect(boxesTouch([0, 0, 10, 10], [15, 0, 10, 10], 4)).toBe(false);
    expect(boxesTouch([0, 0, 10, 10], [5, 5, 10, 10])).toBe(true);
  });
});
