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

describe("packSheets (2D MaxRects nesting)", () => {
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

  it("doesn't trap small pieces in the shelf of a tall piece", () => {
    // Regression: the prior shelf-guillotine packer would lock a full
    // sheet height to the first 96"-tall piece, leaving the area below
    // adjacent shorter pieces unusable. MaxRects fills those gaps.
    const parts = [
      part("Side", 96, 14, true),
      part("Tk1", 19.25, 3, true),
      part("Tk2", 19.25, 3, true),
      part("Tk3", 19.25, 3, true),
      part("Tk4", 19.25, 3, true),
    ];
    const { bins } = packSheets(parts, 48, 96, 0.125);
    expect(bins).toHaveLength(1);
    // All four toe-kick rails must land on the same sheet as the side.
    expect(bins[0].placements).toHaveLength(5);
  });

  it("doesn't grow the sheet count beyond the area-bound minimum", () => {
    // Total area below leaves exactly one sheet of headroom on two 48x96
    // sheets — the packer must achieve that.
    const parts = [
      part("Big1", 96, 24, true),
      part("Big2", 48, 24, true),
      part("Med1", 48, 12, true),
      part("Med2", 24, 24, true),
      part("Sm1", 24, 12, true),
      part("Sm2", 24, 12, true),
      part("Sm3", 24, 12, true),
      part("Sm4", 24, 12, true),
    ];
    const { bins, oversize } = packSheets(parts, 48, 96, 0.125);
    expect(oversize).toHaveLength(0);
    expect(bins.length).toBeLessThanOrEqual(2);
  });

  it("never places two pieces overlapping each other", () => {
    const parts = [
      part("a", 30, 20, true),
      part("b", 24, 18, true),
      part("c", 36, 12, true),
      part("d", 30, 20, true),
      part("e", 24, 18, true),
      part("f", 12, 12, true),
    ];
    const { bins } = packSheets(parts, 48, 96, 0.125);
    for (const b of bins) {
      const placements = b.placements;
      for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
          const a = placements[i];
          const c = placements[j];
          const overlapX = a.x < c.x + c.w && c.x < a.x + a.w;
          const overlapY = a.y < c.y + c.h && c.y < a.y + a.h;
          expect(overlapX && overlapY).toBe(false);
        }
      }
    }
  });

  it("rotates a non-grain part when that's the only way it fits", () => {
    // Part is 60" long × 20" wide. Sheet is 24" wide × 48" long: too short
    // for 60" with-grain (60 > 48) but fits rotated as 20-long × 60-wide
    // ... wait that's wider than 24. So a true rotation-only case needs
    // a tall narrow sheet: 24 wide × 96 long, part 90" long × 30" wide:
    // - non-rotated: 30 width > 24 sheet width → no
    // - rotated:    30 length ≤ 96, 90 width > 24 → no either
    // Use a small enough part: 20 long × 30 wide; sheet 24×96.
    // - non-rotated: width 30 > 24 → no
    // - rotated:    length 30 ≤ 96, width 20 ≤ 24 → yes
    const parts = [part("plate", 20, 30, false)];
    const { bins, oversize } = packSheets(parts, 24, 96, 0.125);
    expect(oversize).toHaveLength(0);
    expect(bins).toHaveLength(1);
    expect(bins[0].placements[0].rotated).toBe(true);
  });

  it("does NOT rotate a grain-mattering part even if rotation would fit", () => {
    // Same dims as above, but grain matters: rotation is disallowed.
    const parts = [part("planks", 20, 30, true)];
    const { oversize } = packSheets(parts, 24, 96, 0.125);
    expect(oversize.map((p) => p.id)).toEqual(["planks"]);
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

  it("includes the 72\" side panels (regression: long parts not dropped)", () => {
    const cat = defaultCatalog();
    const g = buildCarcass(defaultBookcase(), cat);
    const cl = buildCutList(g.parts, cat);
    for (const m of cl.byMaterial) expect(m.oversize).toHaveLength(0);
    const placed = cl.byMaterial
      .flatMap((m) => m.sheetBins)
      .flatMap((b) => b.placements.map((p) => p.label));
    expect(placed.filter((l) => l.includes("side"))).toHaveLength(2);
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
