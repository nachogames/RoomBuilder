import type { Carcass, ShelfAttachment, ShelfSpec, StockCatalog } from "./types";

/** Clear interior height between the top of the bottom panel and the
 *  underside of the top panel (must match geometry/carcass.ts). */
export function interiorClearHeight(
  c: Pick<
    Carcass,
    "height" | "toeKickHeight" | "carcassMaterialId"
  >,
  catalog: StockCatalog,
): number {
  const t = catalog.materials.find((m) => m.id === c.carcassMaterialId)!
    .thickness;
  return c.height - c.toeKickHeight - 2 * t;
}

export interface ShelfMark {
  /** 1-based number matching the inspector / part labels ("Shelf 2") */
  shelfNumber: number;
  attachment: ShelfAttachment;
  /** the layout line: distance from the BOTTOM EDGE of the side panel up to
   *  the shelf's BOTTOM face — where you hold the tape on the side */
  markFromSideBottom: number;
  /** shelf bottom face above the unit's floor (includes toe kick) */
  fromFloor: number;
  /** clear opening under this shelf (to the shelf below, or the cavity floor) */
  clearBelow: number;
}

/** Assembly layout marks for a carcass's shelves, sorted bottom-up. The
 *  datum follows the construction: tall sides run to the floor so the mark
 *  includes toe kick + bottom panel; capped sides stand ON the bottom panel
 *  so the mark equals the shelf offset. `topClear` is the opening between
 *  the top shelf and the underside of the top panel. */
export function shelfMarks(
  c: Carcass,
  catalog: StockCatalog,
): { marks: ShelfMark[]; topClear: number } {
  const t = catalog.materials.find((m) => m.id === c.carcassMaterialId)!
    .thickness;
  const ts = catalog.materials.find((m) => m.id === c.shelfMaterialId)!
    .thickness;
  const interiorFloor = c.toeKickHeight + t;
  const sideBottom = c.construction === "capped" ? interiorFloor : 0;
  const sorted = c.shelves
    .map((s, i) => ({ s, n: i + 1 }))
    .sort((a, b) => a.s.offsetFromBottom - b.s.offsetFromBottom);
  const marks: ShelfMark[] = sorted.map(({ s, n }, i) => {
    const below = i === 0 ? 0 : sorted[i - 1].s.offsetFromBottom + ts;
    return {
      shelfNumber: n,
      attachment: s.attachment,
      markFromSideBottom: interiorFloor + s.offsetFromBottom - sideBottom,
      fromFloor: interiorFloor + s.offsetFromBottom,
      clearBelow: s.offsetFromBottom - below,
    };
  });
  const interiorH = interiorClearHeight(c, catalog);
  const last = sorted[sorted.length - 1];
  const topClear =
    last === undefined ? interiorH : interiorH - (last.s.offsetFromBottom + ts);
  return { marks, topClear };
}

/** True iff the shelves are positioned as `evenlySpacedShelves` would
 *  produce for the same count and carcass — i.e. the user hasn't customized
 *  any positions. Compared with a 1/64" tolerance (the inspector grid). */
export function isEvenlySpaced(
  c: Carcass,
  catalog: StockCatalog,
): boolean {
  const n = c.shelves.length;
  if (n === 0) return true;
  const attachment = c.shelves[0]?.attachment ?? "pocket-screw";
  const expected = evenlySpacedShelves(c, catalog, n, attachment);
  const tol = 1 / 64;
  for (let i = 0; i < n; i++) {
    if (Math.abs(c.shelves[i].offsetFromBottom - expected[i].offsetFromBottom) > tol)
      return false;
  }
  return true;
}

/**
 * N shelves with EQUAL clear openings, accounting for shelf thickness.
 * `offsetFromBottom` is the shelf's bottom face distance from the interior
 * floor — the same datum geometry/carcass.ts uses.
 */
export function evenlySpacedShelves(
  c: Carcass,
  catalog: StockCatalog,
  count: number,
  attachment: ShelfAttachment,
): ShelfSpec[] {
  const n = Math.max(0, Math.min(20, Math.round(count)));
  if (n === 0) return [];
  const ts = catalog.materials.find((m) => m.id === c.shelfMaterialId)!
    .thickness;
  const H = interiorClearHeight(c, catalog);
  const gap = (H - n * ts) / (n + 1);
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return {
      offsetFromBottom: Math.round((i * gap + (i - 1) * ts) * 16) / 16,
      attachment,
    };
  });
}
