import type { CutList } from "../cutlist";
import type { BillOfMaterials } from "../bom/aggregate";
import type { PocketPlanEntry } from "../pockets/plan";
import { formatInches } from "../domain/units";

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export function cutListCsv(cl: CutList): string {
  const rows: (string | number)[][] = [
    ["Material", "Stock #", "Part", "Length (in)", "Width (in)"],
  ];
  for (const m of cl.byMaterial) {
    m.sheetBins.forEach((b, i) => {
      for (const pl of b.placements)
        rows.push([m.materialName, `sheet ${i + 1}`, pl.label, pl.w, pl.h]);
    });
    m.boardBins.forEach((b, i) => {
      for (const c of b.cuts)
        rows.push([m.materialName, `${b.nominal} #${i + 1}`, c.label, c.length, ""]);
    });
  }
  return csv(rows);
}

export function bomCsv(bom: BillOfMaterials): string {
  const rows: (string | number)[][] = [["Category", "Item", "Qty", "Unit"]];
  for (const l of bom.lines)
    rows.push([l.category, l.item, l.qty, l.unit]);
  return csv(rows);
}

export function pocketCsv(plan: PocketPlanEntry[]): string {
  const rows: (string | number)[][] = [
    ["Joint", "Drilled part", "Holes", "Jig setting", "Collar depth", "Screw"],
  ];
  for (const e of plan)
    rows.push([
      e.label,
      e.drilledPartLabel,
      e.holes,
      e.setting.guideSetting,
      formatInches(e.setting.collarDepth),
      `${formatInches(e.setting.screwLength)} ${e.setting.screwType}`,
    ]);
  return csv(rows);
}

export function downloadText(name: string, text: string, type = "text/csv") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
