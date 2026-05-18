import type { StockCatalog } from "../domain/types";
import type { Joint, Part } from "../geometry/types";
import { materialThickness } from "../geometry/types";
import { holePositions, kregForThickness, type KregSetting } from "./kreg";

export interface PocketPlanEntry {
  jointId: string;
  label: string;
  drilledPartLabel: string;
  holes: number;
  holePositions: number[];
  setting: KregSetting;
}

/**
 * Build the pocket-hole drilling schedule for every pocket-screw joint.
 * The drilled member's thickness drives the Kreg setting.
 */
export function buildPocketPlan(
  joints: Joint[],
  parts: Part[],
  catalog: StockCatalog,
): PocketPlanEntry[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: PocketPlanEntry[] = [];
  for (const j of joints) {
    if (j.method !== "pocket-screw" || !j.drilledPartId) continue;
    const drilled = byId.get(j.drilledPartId);
    if (!drilled) continue;
    const t = materialThickness(catalog.materials, drilled.materialId);
    const positions = holePositions(j.edgeLength).map(
      (p) => Math.round(p * 16) / 16,
    );
    out.push({
      jointId: j.id,
      label: j.label,
      drilledPartLabel: drilled.label,
      holes: positions.length,
      holePositions: positions,
      setting: kregForThickness(t),
    });
  }
  return out;
}

export function totalPocketScrews(plan: PocketPlanEntry[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of plan) {
    m.set(
      e.setting.screwLength,
      (m.get(e.setting.screwLength) ?? 0) + e.holes,
    );
  }
  return m;
}
