import { describe, it, expect } from "vitest";
import { buildCarcass } from "./carcass";
import { defaultBookcase, defaultCatalog } from "../domain/defaults";

describe("buildCarcass (default 20.75\" bookcase, 3 shelves, toe kick, back)", () => {
  const g = buildCarcass(defaultBookcase(), defaultCatalog());

  it("produces 9 parts", () => {
    expect(g.parts).toHaveLength(9);
    const roles = g.parts.map((p) => p.role).sort();
    expect(roles).toEqual(
      [
        "back",
        "bottom",
        "shelf",
        "shelf",
        "shelf",
        "side",
        "side",
        "toe-kick",
        "top",
      ].sort(),
    );
  });

  it("produces 13 joints, carcass ones pocket-screw", () => {
    expect(g.joints).toHaveLength(13);
    const pockets = g.joints.filter((j) => j.method === "pocket-screw");
    // 2 top + 2 bottom + 2 toekick + 6 shelf = 12
    expect(pockets).toHaveLength(12);
    expect(g.joints.filter((j) => j.method === "screw-through")).toHaveLength(1);
  });

  it("computes side, top, back, shelf dimensions correctly", () => {
    const side = g.parts.find((p) => p.role === "side")!;
    expect(side.length).toBe(72);
    expect(side.width).toBe(11.25);

    const top = g.parts.find((p) => p.role === "top")!;
    expect(top.length).toBeCloseTo(19.25, 6);
    expect(top.width).toBeCloseTo(11.25, 6);

    const back = g.parts.find((p) => p.role === "back")!;
    expect(back.length).toBe(69);
    expect(back.width).toBe(20.75);
    expect(back.thickness).toBe(0.25);

    const shelf = g.parts.find((p) => p.role === "shelf")!;
    expect(shelf.length).toBeCloseTo(19.25, 6);
    expect(shelf.width).toBeCloseTo(11.0, 6);
  });

  it("keeps every part inside the carcass envelope", () => {
    const c = defaultBookcase();
    for (const p of g.parts) {
      expect(p.center.y - p.box.y / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(p.center.y + p.box.y / 2).toBeLessThanOrEqual(c.height + 1e-6);
      expect(Math.abs(p.center.x) + p.box.x / 2).toBeLessThanOrEqual(
        c.width / 2 + 1e-6,
      );
    }
  });
});
