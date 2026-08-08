import type { StockCatalog } from "../domain/types";
import type { Part } from "../geometry/types";
import { packBoards, type BoardBin } from "./board";
import { packSheetsFrom, type SheetBin, type StockSheet } from "./sheet";

export interface MaterialCutList {
  materialId: string;
  materialName: string;
  kind: "sheet" | "board";
  sheetBins: SheetBin[];
  boardBins: BoardBin[];
  /** too big for any stock you listed */
  oversize: Part[];
  /** would fit, but your on-hand quantities ran out */
  unplaced: Part[];
  /** count of stock pieces required for this material */
  stockCount: number;
}

export interface CutList {
  byMaterial: MaterialCutList[];
  /** total stock pieces across all materials */
  totalStock: number;
  /** stock pieces that must still be bought (i.e. not drawn from inventory) */
  totalToBuy: number;
  /** true when any material ran out of on-hand stock */
  shortfall: boolean;
}

export function buildCutList(parts: Part[], catalog: StockCatalog): CutList {
  const groups = new Map<string, Part[]>();
  for (const p of parts) {
    const arr = groups.get(p.materialId) ?? [];
    arr.push(p);
    groups.set(p.materialId, arr);
  }

  const byMaterial: MaterialCutList[] = [];
  for (const [materialId, gParts] of groups) {
    const mat = catalog.materials.find((m) => m.id === materialId);
    if (!mat) continue;
    if (mat.kind === "sheet") {
      const entries = catalog.sheets.filter((s) => s.materialId === materialId);
      const stock: StockSheet[] = entries.length
        ? entries.map((s) => ({
            width: s.width,
            length: s.length,
            ...(s.qty !== undefined ? { qty: s.qty } : {}),
            ...(s.label !== undefined ? { label: s.label } : {}),
          }))
        : [{ width: 48, length: 96 }];
      const { bins, oversize, unplaced } = packSheetsFrom(gParts, stock, {
        kerf: catalog.kerf,
        grainMatters: catalog.grainMatters,
        trimAllowance: catalog.trimAllowance,
      });
      byMaterial.push({
        materialId,
        materialName: mat.name,
        kind: "sheet",
        sheetBins: bins,
        boardBins: [],
        oversize,
        unplaced,
        stockCount: bins.length,
      });
    } else {
      const stock = catalog.boards.find((b) => b.materialId === materialId);
      const sl = stock?.length ?? 96;
      const nominal = stock?.nominal ?? mat.name;
      const { bins, oversize } = packBoards(
        gParts,
        sl,
        nominal,
        catalog.kerf,
      );
      byMaterial.push({
        materialId,
        materialName: mat.name,
        kind: "board",
        sheetBins: [],
        boardBins: bins,
        oversize,
        unplaced: [],
        stockCount: bins.length,
      });
    }
  }

  return {
    byMaterial,
    totalStock: byMaterial.reduce((n, m) => n + m.stockCount, 0),
    totalToBuy: byMaterial.reduce(
      (n, m) => n + m.sheetBins.filter((b) => !b.fromInventory).length + m.boardBins.length,
      0,
    ),
    shortfall: byMaterial.some((m) => m.unplaced.length > 0),
  };
}
