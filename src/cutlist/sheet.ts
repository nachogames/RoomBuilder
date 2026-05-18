import type { Inches } from "../domain/units";
import type { Part } from "../geometry/types";

export interface SheetPlacement {
  partId: string;
  label: string;
  x: Inches;
  y: Inches;
  w: Inches;
  h: Inches;
  rotated: boolean;
}
export interface SheetBin {
  sheetWidth: Inches;
  sheetLength: Inches;
  placements: SheetPlacement[];
  usedArea: Inches;
}

/**
 * 2D shelf-guillotine nesting. Sheet is `sheetWidth` (x) by `sheetLength` (y).
 * Parts may rotate 90° only when grain does not matter. Kerf is consumed
 * between adjacent parts and between shelves.
 */
export function packSheets(
  parts: Part[],
  sheetWidth: Inches,
  sheetLength: Inches,
  kerf: Inches,
): { bins: SheetBin[]; oversize: Part[] } {
  const oversize: Part[] = [];
  type Piece = { p: Part; w: number; h: number; rotated: boolean };
  const pieces: Piece[] = [];
  // Sheet length (y axis) is the grain direction; a part's `length` is its
  // with-grain dimension and must run along the sheet length when grain
  // matters. When grain is irrelevant either orientation is allowed.
  for (const p of parts) {
    const grainFit = p.length <= sheetLength && p.width <= sheetWidth;
    const crossFit = p.width <= sheetLength && p.length <= sheetWidth;
    if (grainFit) {
      pieces.push({ p, w: p.width, h: p.length, rotated: false });
    } else if (!p.grainMatters && crossFit) {
      pieces.push({ p, w: p.length, h: p.width, rotated: true });
    } else {
      oversize.push(p);
    }
  }
  pieces.sort((a, b) => b.h - a.h || b.w - a.w);

  const bins: SheetBin[] = [];
  const newBin = (): SheetBin => ({
    sheetWidth,
    sheetLength,
    placements: [],
    usedArea: 0,
  });

  for (const piece of pieces) {
    let placed = false;
    for (const bin of bins) {
      if (tryPlace(bin, piece, sheetWidth, sheetLength, kerf)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      const bin = newBin();
      tryPlace(bin, piece, sheetWidth, sheetLength, kerf);
      bins.push(bin);
    }
  }
  return { bins, oversize };
}

function tryPlace(
  bin: SheetBin,
  piece: { p: Part; w: number; h: number; rotated: boolean },
  sheetW: number,
  sheetL: number,
  kerf: number,
): boolean {
  // reconstruct shelves from existing placements
  type Shelf = { y: number; height: number; cursorX: number };
  const shelves: Shelf[] = [];
  for (const pl of bin.placements) {
    let s = shelves.find((sh) => Math.abs(sh.y - pl.y) < 1e-6);
    if (!s) {
      s = { y: pl.y, height: pl.h, cursorX: 0 };
      shelves.push(s);
    }
    s.height = Math.max(s.height, pl.h);
    s.cursorX = Math.max(s.cursorX, pl.x + pl.w + kerf);
  }
  shelves.sort((a, b) => a.y - b.y);

  for (const s of shelves) {
    if (piece.w <= sheetW - s.cursorX + 1e-9 && piece.h <= s.height + 1e-9) {
      bin.placements.push({
        partId: piece.p.id,
        label: piece.p.label,
        x: s.cursorX,
        y: s.y,
        w: piece.w,
        h: piece.h,
        rotated: piece.rotated,
      });
      bin.usedArea += piece.w * piece.h;
      return true;
    }
  }
  // start a new shelf
  const topY = shelves.reduce((m, s) => Math.max(m, s.y + s.height + kerf), 0);
  if (piece.h <= sheetL - topY + 1e-9 && piece.w <= sheetW + 1e-9) {
    bin.placements.push({
      partId: piece.p.id,
      label: piece.p.label,
      x: 0,
      y: topY,
      w: piece.w,
      h: piece.h,
      rotated: piece.rotated,
    });
    bin.usedArea += piece.w * piece.h;
    return true;
  }
  return false;
}
