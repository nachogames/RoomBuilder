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
