import { describe, it, expect } from "vitest";
import { evenlySpacedShelves, interiorClearHeight } from "./shelves";
import { defaultBookcase, defaultCatalog } from "./defaults";

describe("evenlySpacedShelves", () => {
  const c = defaultBookcase();
  const cat = defaultCatalog();

  it("creates equal clear openings between shelves, floor and top", () => {
    const shelves = evenlySpacedShelves(c, cat, 3, "pocket-screw");
    const ts = cat.materials.find((m) => m.id === c.shelfMaterialId)!.thickness;
    const H = interiorClearHeight(c, cat);

    // gap below shelf 1, between consecutive shelves, above last shelf
    const gaps: number[] = [];
    gaps.push(shelves[0].offsetFromBottom); // floor -> shelf1 bottom
    for (let i = 1; i < shelves.length; i++) {
      gaps.push(
        shelves[i].offsetFromBottom -
          (shelves[i - 1].offsetFromBottom + ts),
      );
    }
    gaps.push(
      H - (shelves[shelves.length - 1].offsetFromBottom + ts),
    );

    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 1);
  });

  it("returns nothing for zero shelves and stays within the carcass", () => {
    expect(evenlySpacedShelves(c, cat, 0, "pocket-screw")).toHaveLength(0);
    const many = evenlySpacedShelves(c, cat, 5, "pocket-screw");
    const H = interiorClearHeight(c, cat);
    for (const s of many) {
      expect(s.offsetFromBottom).toBeGreaterThan(0);
      expect(s.offsetFromBottom).toBeLessThan(H);
    }
  });
});
