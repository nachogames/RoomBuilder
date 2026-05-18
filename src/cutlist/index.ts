import type { StockCatalog } from "../domain/types";
import type { Part } from "../geometry/types";
import { packBoards, type BoardBin } from "./board";
import { packSheets, type SheetBin } from "./sheet";

export interface MaterialCutList {
  materialId: string;
  materialName: string;
  kind: "sheet" | "board";
  sheetBins: SheetBin[];
  boardBins: BoardBin[];
  oversize: Part[];
  /** count of stock pieces required for this material */
  stockCount: number;
}

export interface CutList {
  byMaterial: MaterialCutList[];
  /** total stock pieces across all materials */
  totalStock: number;
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
      const stock = catalog.sheets.find((s) => s.materialId === materialId);
      const sw = stock?.width ?? 48;
      const sl = stock?.length ?? 96;
      const { bins, oversize } = packSheets(gParts, sw, sl, catalog.kerf);
      byMaterial.push({
        materialId,
        materialName: mat.name,
        kind: "sheet",
        sheetBins: bins,
        boardBins: [],
        oversize,
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
        stockCount: bins.length,
      });
    }
  }

  return {
    byMaterial,
    totalStock: byMaterial.reduce((n, m) => n + m.stockCount, 0),
  };
}
