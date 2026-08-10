import { describe, expect, it } from "vitest";
import { defaultBookcase, defaultCatalog } from "./defaults";
import {
  alignShelvesTo,
  interiorClearHeight,
  setOpeningClear,
} from "./shelves";

const catalog = defaultCatalog();
const ts = catalog.materials.find(
  (m) => m.id === defaultBookcase().shelfMaterialId,
)!.thickness;

const withShelves = (offsets: number[], extra: Partial<ReturnType<typeof defaultBookcase>> = {}) => ({
  ...defaultBookcase(),
  ...extra,
  shelves: offsets.map((o) => ({
    offsetFromBottom: o,
    attachment: "pocket-screw" as const,
  })),
});

describe("setOpeningClear", () => {
  it("sets the bottom gap and slides the whole stack, preserving gaps above", () => {
    const c = withShelves([12, 26, 40]);
    const next = setOpeningClear(c, catalog, 0, 8);
    expect(next.map((s) => s.offsetFromBottom)).toEqual([8, 22, 36]);
  });

  it("sets a middle gap, moving only the shelves above it", () => {
    const c = withShelves([12, 26, 40]);
    // gap 1 = clear between shelf1 top (12+ts) and shelf2 bottom
    const next = setOpeningClear(c, catalog, 1, 10);
    expect(next[0].offsetFromBottom).toBe(12);
    expect(next[1].offsetFromBottom).toBeCloseTo(12 + ts + 10, 10);
    // shelf above keeps ITS opening (was 40-26=14 minus ts... same delta)
    expect(next[2].offsetFromBottom - next[1].offsetFromBottom).toBeCloseTo(14, 10);
  });

  it("sets the top opening by moving only the top shelf", () => {
    const c = withShelves([12, 26, 40]);
    const interiorH = interiorClearHeight(c, catalog);
    const next = setOpeningClear(c, catalog, 3, 6);
    expect(next[0].offsetFromBottom).toBe(12);
    expect(next[1].offsetFromBottom).toBe(26);
    expect(next[2].offsetFromBottom).toBeCloseTo(interiorH - ts - 6, 10);
  });

  it("clamps so shelves stay inside the interior", () => {
    const c = withShelves([12, 26, 40]);
    const interiorH = interiorClearHeight(c, catalog);
    const next = setOpeningClear(c, catalog, 0, 1000);
    for (const s of next) {
      expect(s.offsetFromBottom).toBeGreaterThanOrEqual(0);
      expect(s.offsetFromBottom).toBeLessThanOrEqual(interiorH - ts);
    }
  });
});

describe("alignShelvesTo", () => {
  it("puts shelf TOP faces at the same absolute floor height", () => {
    // source: tall case on the floor; target: shorter case raised on the
    // baseboard with a different toe kick and capped construction
    const src = withShelves([12, 26, 40], { baseHeight: 0, toeKickHeight: 3 });
    const tgt = {
      ...withShelves([], {
        toeKickHeight: 0,
        construction: "capped" as const,
        height: 60,
      }),
      baseHeight: 5.125,
    };
    const aligned = alignShelvesTo(tgt, src, catalog);
    const t = catalog.materials.find((m) => m.id === src.carcassMaterialId)!.thickness;
    for (const [i, s] of aligned.entries()) {
      const srcTopAbs = 0 + 3 + t + src.shelves[i].offsetFromBottom + ts;
      const tgtTopAbs = 5.125 + 0 + t + s.offsetFromBottom + ts;
      expect(tgtTopAbs).toBeCloseTo(srcTopAbs, 10);
    }
  });

  it("drops shelves that fall outside the target's interior", () => {
    const src = withShelves([12, 26, 40, 60]); // 72" tall source
    const tgt = { ...withShelves([], { height: 40 }), baseHeight: 0 };
    const aligned = alignShelvesTo(tgt, src, catalog);
    const interiorH = interiorClearHeight(tgt, catalog);
    expect(aligned.length).toBeLessThan(4);
    for (const s of aligned) {
      expect(s.offsetFromBottom).toBeGreaterThanOrEqual(0);
      expect(s.offsetFromBottom).toBeLessThanOrEqual(interiorH - ts);
    }
  });
});
