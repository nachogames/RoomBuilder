import type { Inches } from "../domain/units";
import type { Part } from "../geometry/types";

export interface BoardCut {
  partId: string;
  label: string;
  length: Inches;
}
export interface BoardBin {
  nominal: string;
  stockLength: Inches;
  cuts: BoardCut[];
  used: Inches;
  leftover: Inches;
}

/**
 * 1D first-fit-decreasing board cut plan. Parts are cut along board length;
 * `kerf` is consumed between successive cuts on the same board.
 */
export function packBoards(
  parts: Part[],
  stockLength: Inches,
  nominal: string,
  kerf: Inches,
): { bins: BoardBin[]; oversize: Part[] } {
  const oversize = parts.filter((p) => p.length > stockLength);
  const fit = parts
    .filter((p) => p.length <= stockLength)
    .sort((a, b) => b.length - a.length);

  const bins: BoardBin[] = [];
  for (const p of fit) {
    let placed = false;
    for (const bin of bins) {
      const need = (bin.cuts.length ? kerf : 0) + p.length;
      if (bin.used + need <= stockLength + 1e-9) {
        bin.used += need;
        bin.cuts.push({ partId: p.id, label: p.label, length: p.length });
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push({
        nominal,
        stockLength,
        cuts: [{ partId: p.id, label: p.label, length: p.length }],
        used: p.length,
        leftover: 0,
      });
    }
  }
  for (const b of bins) b.leftover = stockLength - b.used;
  return { bins, oversize };
}
