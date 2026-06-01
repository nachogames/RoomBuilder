import { describe, expect, it } from "vitest";
import { defaultBookcase, defaultCatalog } from "../domain/defaults";
import { buildCarcass } from "../geometry/carcass";
import { explodeOffset } from "./explode";

describe("explodeOffset", () => {
  it("returns zero displacement at t=0 for every part role", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    for (let i = 0; i < g.parts.length; i++) {
      const p = g.parts[i];
      const shelfCount = g.parts.filter((x) => x.role === "shelf").length;
      const shelfIdx = p.role === "shelf"
        ? g.parts.filter((x) => x.role === "shelf").indexOf(p)
        : undefined;
      const off = explodeOffset(p, c, shelfIdx, shelfCount, 0);
      expect(off.x).toBe(0);
      expect(off.y).toBe(0);
      expect(off.z).toBe(0);
    }
  });
});

describe("explodeOffset per role at t=1", () => {
  const c = defaultBookcase();
  const cat = defaultCatalog();
  const g = buildCarcass(c, cat);
  const shelfCount = g.parts.filter((p) => p.role === "shelf").length;
  const findRole = (role: string) =>
    g.parts.find((p) => p.role === role)!;

  it("top moves +y", () => {
    const off = explodeOffset(findRole("top"), c, undefined, shelfCount, 1);
    expect(off.y).toBeGreaterThan(0);
    expect(off.x).toBe(0);
    expect(off.z).toBe(0);
  });

  it("bottom moves -y", () => {
    const off = explodeOffset(findRole("bottom"), c, undefined, shelfCount, 1);
    expect(off.y).toBeLessThan(0);
  });

  it("left side moves -x, right side moves +x", () => {
    const sides = g.parts.filter((p) => p.role === "side");
    const left = sides.find((s) => s.center.x < 0)!;
    const right = sides.find((s) => s.center.x > 0)!;
    expect(explodeOffset(left, c, undefined, shelfCount, 1).x).toBeLessThan(0);
    expect(explodeOffset(right, c, undefined, shelfCount, 1).x).toBeGreaterThan(0);
  });

  it("back moves -z", () => {
    const back = g.parts.find((p) => p.role === "back");
    if (back) {
      const off = explodeOffset(back, c, undefined, shelfCount, 1);
      expect(off.z).toBeLessThan(0);
    }
  });

  it("higher-index shelves move farther up than lower ones", () => {
    const shelves = g.parts.filter((p) => p.role === "shelf");
    if (shelves.length >= 2) {
      const offLo = explodeOffset(shelves[0], c, 0, shelves.length, 1);
      const offHi = explodeOffset(shelves[shelves.length - 1], c, shelves.length - 1, shelves.length, 1);
      expect(offHi.y).toBeGreaterThan(offLo.y);
      // Shelves also move forward (+z)
      expect(offLo.z).toBeGreaterThan(0);
    }
  });

  it("scales linearly with t (t=0.5 is half of t=1)", () => {
    const top = findRole("top");
    const half = explodeOffset(top, c, undefined, shelfCount, 0.5);
    const full = explodeOffset(top, c, undefined, shelfCount, 1);
    expect(half.y).toBeCloseTo(full.y / 2, 6);
  });
});
