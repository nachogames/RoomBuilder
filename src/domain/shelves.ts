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

/** Set the clear opening under the `gapIndex`-th shelf (bottom-up, 0-based;
 *  gapIndex === shelfCount sets the TOP opening by moving only the top
 *  shelf). The shelf directly above the gap moves to produce the opening;
 *  every shelf above it slides by the same delta, so their own openings are
 *  preserved. Results clamp to the interior and are returned bottom-up. */
export function setOpeningClear(
  c: Carcass,
  catalog: StockCatalog,
  gapIndex: number,
  clear: number,
): ShelfSpec[] {
  const ts = catalog.materials.find((m) => m.id === c.shelfMaterialId)!
    .thickness;
  const interiorH = interiorClearHeight(c, catalog);
  const maxOff = Math.max(0, interiorH - ts);
  const sorted = [...c.shelves].sort(
    (a, b) => a.offsetFromBottom - b.offsetFromBottom,
  );
  const n = sorted.length;
  if (n === 0) return sorted;
  const offs = sorted.map((s) => s.offsetFromBottom);
  if (gapIndex >= n) {
    // top opening: bring only the top shelf to interiorH - ts - clear
    offs[n - 1] = interiorH - ts - clear;
  } else {
    const below = gapIndex === 0 ? 0 : offs[gapIndex - 1] + ts;
    const delta = below + clear - offs[gapIndex];
    for (let i = gapIndex; i < n; i++) offs[i] += delta;
  }
  // clamp into the cavity, keeping shelves from overlapping one another
  let prevTop = 0;
  for (let i = 0; i < n; i++) {
    offs[i] = Math.min(maxOff, Math.max(prevTop, offs[i]));
    prevTop = offs[i] + ts;
  }
  return sorted.map((s, i) => ({ ...s, offsetFromBottom: offs[i] }));
}

/** Recompute `target`'s shelves so each shelf TOP surface sits at the same
 *  absolute height from the floor as `source`'s — regardless of differing
 *  baseHeight (e.g. one cabinet up on the baseboard), toe kicks, heights or
 *  construction. Shelves that would land outside the target's interior are
 *  dropped. For facing cabinets carrying a shared runner. */
export function alignShelvesTo(
  target: Carcass,
  source: Carcass,
  catalog: StockCatalog,
): ShelfSpec[] {
  const thick = (id: string) =>
    catalog.materials.find((m) => m.id === id)!.thickness;
  const tSrc = thick(source.carcassMaterialId);
  const tTgt = thick(target.carcassMaterialId);
  const tsSrc = thick(source.shelfMaterialId);
  const tsTgt = thick(target.shelfMaterialId);
  const srcFloorAbs = (source.baseHeight ?? 0) + source.toeKickHeight + tSrc;
  const tgtFloorAbs = (target.baseHeight ?? 0) + target.toeKickHeight + tTgt;
  const attach =
    target.shelves[0]?.attachment ??
    source.shelves[0]?.attachment ??
    "pocket-screw";
  const interiorH = interiorClearHeight(target, catalog);
  const maxOff = Math.max(0, interiorH - tsTgt);
  return source.shelves
    .map((s) => {
      const topAbs = srcFloorAbs + s.offsetFromBottom + tsSrc;
      return {
        offsetFromBottom: topAbs - tsTgt - tgtFloorAbs,
        attachment: attach,
      };
    })
    .filter((s) => s.offsetFromBottom >= 0 && s.offsetFromBottom <= maxOff)
    .sort((a, b) => a.offsetFromBottom - b.offsetFromBottom);
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
