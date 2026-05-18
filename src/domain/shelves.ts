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
