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
