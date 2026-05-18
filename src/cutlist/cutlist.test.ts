import { describe, it, expect } from "vitest";
import { packBoards } from "./board";
import { packSheets } from "./sheet";
import { buildCutList } from "./index";
import { buildCarcass } from "../geometry/carcass";
import { defaultBookcase, defaultCatalog, PINE_1x12 } from "../domain/defaults";
import type { Part } from "../geometry/types";

function part(id: string, length: number, width: number, grain = true): Part {
  return {
    id,
    carcassId: "c",
    role: "shelf",
    label: id,
    materialId: "m",
    thickness: 0.75,
    length,
    width,
    grainMatters: grain,
    box: { x: length, y: 0.75, z: width },
    center: { x: 0, y: 0, z: 0 },
  };
}

describe("packBoards (1D, kerf-aware)", () => {
  it("packs three 30\" parts into one 96\" board accounting for kerf", () => {
    const { bins, oversize } = packBoards(
      [part("a", 30, 6), part("b", 30, 6), part("c", 30, 6)],
      96,
      "1x12",
      0.125,
    );
    expect(oversize).toHaveLength(0);
    expect(bins).toHaveLength(1);
    expect(bins[0].used).toBeCloseTo(30 * 3 + 0.125 * 2, 6);
  });
  it("flags parts longer than the board as oversize", () => {
    const { oversize } = packBoards([part("x", 120, 6)], 96, "1x12", 0.125);
    expect(oversize.map((p) => p.id)).toEqual(["x"]);
  });
});

describe("packSheets (2D shelf nesting)", () => {
  it("fits four quarter panels on one sheet", () => {
    const parts = [
      part("a", 47, 23),
      part("b", 47, 23),
      part("c", 47, 23),
      part("d", 47, 23),
    ];
    const { bins, oversize } = packSheets(parts, 48, 96, 0.125);
    expect(oversize).toHaveLength(0);
    expect(bins).toHaveLength(1);
    expect(bins[0].placements).toHaveLength(4);
  });
});

describe("buildCutList (default bookcase, mixed materials)", () => {
  it("routes plywood to sheets and (if used) lumber to boards", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const cl = buildCutList(g.parts, cat);
    const plyList = cl.byMaterial.find((m) => m.kind === "sheet");
    expect(plyList).toBeDefined();
    expect(plyList!.stockCount).toBeGreaterThanOrEqual(1);
    expect(cl.totalStock).toBeGreaterThanOrEqual(1);
  });

  it("handles a lumber shelf via the board packer", () => {
    const c = defaultBookcase();
    c.shelfMaterialId = PINE_1x12;
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const cl = buildCutList(g.parts, cat);
    expect(cl.byMaterial.some((m) => m.kind === "board")).toBe(true);
  });
});
