import { describe, it, expect } from "vitest";
import { packSheetsFrom } from "./sheet";
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

/** Two 95 1/2" x 14" bookcases: 4 sides, 12 horizontals, 2 toe kicks. */
function twoBookcases(): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < 4; i++) out.push(part(`side${i}`, 95.5, 14));
  for (let i = 0; i < 12; i++) out.push(part(`panel${i}`, 19.25, 14));
  for (let i = 0; i < 2; i++) out.push(part(`rail${i}`, 19.25, 3));
  return out;
}

const FULL = [{ width: 48, length: 96 }];

describe("project-level grain toggle", () => {
  it("needs three sheets when grain is locked", () => {
    const r = packSheetsFrom(twoBookcases(), FULL, { kerf: 0.125, grainMatters: true });
    expect(r.unplaced).toHaveLength(0);
    expect(r.oversize).toHaveLength(0);
    expect(r.bins).toHaveLength(3);
    expect(r.bins.every((b) => b.placements.every((p) => !p.rotated))).toBe(true);
  });

  it("drops to two sheets when grain is free to rotate", () => {
    // The hand-checked optimum: one sheet per bookcase — two 14" side rips
    // plus a 19 1/4" column holding six rotated horizontals and a toe kick.
    // 14 + 14 + 19.25 + 3 kerfs = 47.625 of 48.
    const r = packSheetsFrom(twoBookcases(), FULL, { kerf: 0.125, grainMatters: false });
    expect(r.unplaced).toHaveLength(0);
    expect(r.bins).toHaveLength(2);
    for (const b of r.bins) {
      expect(b.placements).toHaveLength(9);
      expect(b.usedArea / (b.sheetWidth * b.sheetLength)).toBeGreaterThan(0.94);
    }
  });

  it("overrides a part's own grainMatters flag rather than reading it", () => {
    // Part is 20 long x 30 wide on a 24x96 sheet: only fits rotated.
    const p = [part("plate", 20, 30, true)];
    expect(
      packSheetsFrom(p, [{ width: 24, length: 96 }], { kerf: 0.125 }).oversize,
    ).toHaveLength(1);
    const free = packSheetsFrom(p, [{ width: 24, length: 96 }], {
      kerf: 0.125,
      grainMatters: false,
    });
    expect(free.oversize).toHaveLength(0);
    expect(free.bins[0].placements[0].rotated).toBe(true);
  });
});

describe("finite sheet inventory", () => {
  it("stops at the quantity on hand and reports the rest as unplaced", () => {
    const r = packSheetsFrom(twoBookcases(), [{ width: 48, length: 96, qty: 1 }], {
      kerf: 0.125,
      grainMatters: false,
    });
    expect(r.bins).toHaveLength(1);
    expect(r.unplaced.length).toBeGreaterThan(0);
    expect(r.oversize).toHaveLength(0); // they fit — you just ran out
  });

  it("never exceeds the stated quantity of a size", () => {
    const stock = [
      { width: 48, length: 96, qty: 1, label: "full sheet" },
      { width: 24, length: 48, qty: 2, label: "offcut" },
    ];
    const parts = Array.from({ length: 9 }, (_, i) => part(`p${i}`, 23, 23, false));
    const r = packSheetsFrom(parts, stock, { kerf: 0.125 });
    const byLabel = new Map<string, number>();
    for (const b of r.bins) {
      byLabel.set(b.stockLabel!, (byLabel.get(b.stockLabel!) ?? 0) + 1);
    }
    expect(byLabel.get("full sheet") ?? 0).toBeLessThanOrEqual(1);
    expect(byLabel.get("offcut") ?? 0).toBeLessThanOrEqual(2);
  });

  it("spends an on-hand offcut before a sheet it would have to buy", () => {
    const stock = [
      { width: 48, length: 96 },
      { width: 24, length: 48, qty: 1, label: "offcut" },
    ];
    const r = packSheetsFrom([part("small", 20, 20, false)], stock, { kerf: 0.125 });
    expect(r.bins).toHaveLength(1);
    expect(r.bins[0].stockLabel).toBe("offcut");
    expect(r.bins[0].fromInventory).toBe(true);
  });

  it("treats an omitted qty as buy-as-many-as-needed", () => {
    const r = packSheetsFrom(twoBookcases(), FULL, { kerf: 0.125, grainMatters: true });
    expect(r.unplaced).toHaveLength(0);
    expect(r.bins.every((b) => b.fromInventory === false)).toBe(true);
  });
});

describe("trim allowance", () => {
  it("reserves extra material and reports the finished size", () => {
    const r = packSheetsFrom([part("side", 95.5, 14)], FULL, {
      kerf: 0.125,
      trimAllowance: 0.5,
    });
    const pl = r.bins[0].placements[0];
    expect(pl.h).toBeCloseTo(96, 6); // 95.5 rough-cut at 96
    expect(pl.w).toBeCloseTo(14.5, 6);
    expect(pl.finishedH).toBeCloseTo(95.5, 6);
    expect(pl.finishedW).toBeCloseTo(14, 6);
  });

  it("flags a part that only fits by trusting an untrimmed factory edge", () => {
    // A 96" part off a 96" sheet: fine with no allowance, impossible if you
    // want to square both ends.
    expect(packSheetsFrom([part("side", 96, 14)], FULL, { kerf: 0.125 }).oversize)
      .toHaveLength(0);
    expect(
      packSheetsFrom([part("side", 96, 14)], FULL, { kerf: 0.125, trimAllowance: 0.5 })
        .oversize,
    ).toHaveLength(1);
  });
});

describe("packer invariants", () => {
  it("is deterministic", () => {
    const a = packSheetsFrom(twoBookcases(), FULL, { kerf: 0.125, grainMatters: false });
    const b = packSheetsFrom(twoBookcases(), FULL, { kerf: 0.125, grainMatters: false });
    expect(JSON.stringify(a.bins)).toEqual(JSON.stringify(b.bins));
  });

  it("never overlaps two placements, with rotation and mixed stock", () => {
    const stock = [
      { width: 48, length: 96 },
      { width: 30, length: 60, qty: 2, label: "offcut" },
    ];
    const parts = [
      part("a", 30, 20, false),
      part("b", 24, 18, false),
      part("c", 36, 12, true),
      part("d", 30, 20, false),
      part("e", 24, 18, true),
      part("f", 12, 12, false),
      part("g", 44, 22, false),
    ];
    const r = packSheetsFrom(parts, stock, { kerf: 0.125, trimAllowance: 0.25 });
    for (const b of r.bins) {
      for (let i = 0; i < b.placements.length; i++) {
        const p = b.placements[i];
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(b.sheetWidth + 1e-9);
        expect(p.y + p.h).toBeLessThanOrEqual(b.sheetLength + 1e-9);
        for (let j = i + 1; j < b.placements.length; j++) {
          const q = b.placements[j];
          const ox = p.x < q.x + q.w - 1e-9 && q.x < p.x + p.w - 1e-9;
          const oy = p.y < q.y + q.h - 1e-9 && q.y < p.y + p.h - 1e-9;
          expect(ox && oy).toBe(false);
        }
      }
    }
  });

  it("places every part somewhere: bins + oversize + unplaced is total", () => {
    const parts = twoBookcases();
    const r = packSheetsFrom(parts, FULL, { kerf: 0.125, grainMatters: false });
    const placed = r.bins.reduce((n, b) => n + b.placements.length, 0);
    expect(placed + r.oversize.length + r.unplaced.length).toBe(parts.length);
  });

  it("handles an empty stock list without throwing", () => {
    const r = packSheetsFrom(twoBookcases(), [], { kerf: 0.125 });
    expect(r.bins).toHaveLength(0);
    expect(r.oversize).toHaveLength(18);
  });

  it("stays fast enough to run on every render", () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      packSheetsFrom(twoBookcases(), FULL, { kerf: 0.125, grainMatters: false });
    }
    expect((performance.now() - t0) / 20).toBeLessThan(25);
  });
});
