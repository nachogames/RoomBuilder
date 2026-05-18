import type { Joint } from "../geometry/types";
import { hardwareForJoint } from "../joinery/registry";
import type { CutList } from "../cutlist";
import { formatInches } from "../domain/units";
import type { PocketPlanEntry } from "../pockets/plan";
import { totalPocketScrews } from "../pockets/plan";

export interface BomLine {
  category: "Sheet goods" | "Lumber" | "Hardware";
  item: string;
  qty: number;
  unit: string;
}

export interface BillOfMaterials {
  lines: BomLine[];
}

export function buildBom(
  joints: Joint[],
  cutList: CutList,
  pocketPlan: PocketPlanEntry[],
): BillOfMaterials {
  const lines: BomLine[] = [];

  for (const m of cutList.byMaterial) {
    lines.push({
      category: m.kind === "sheet" ? "Sheet goods" : "Lumber",
      item: m.materialName,
      qty: m.stockCount,
      unit: m.kind === "sheet" ? "sheet" : "board",
    });
  }

  // pocket screws by length
  for (const [len, qty] of totalPocketScrews(pocketPlan)) {
    lines.push({
      category: "Hardware",
      item: `Kreg pocket screw ${formatInches(len)} coarse`,
      qty,
      unit: "ea",
    });
  }

  // other joinery hardware, aggregated by spec
  const hw = new Map<string, number>();
  for (const j of joints) {
    for (const h of hardwareForJoint(j)) {
      hw.set(h.spec, (hw.get(h.spec) ?? 0) + h.qty);
    }
  }
  for (const [spec, qty] of hw) {
    lines.push({ category: "Hardware", item: spec, qty, unit: "ea" });
  }

  return { lines };
}
