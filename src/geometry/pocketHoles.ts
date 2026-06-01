import type { StockCatalog } from "../domain/types";
import type { DrilledEdge, Joint, Part } from "./types";
import { holePositions } from "../pockets/kreg";

export interface PocketHoleMark {
  jointId: string;
  partId: string;
  /** carcass-local position of the entrance face center for this hole */
  center: { x: number; y: number; z: number };
  /** Unit outward normal of the drilled face (the face the drill enters
   *  from). The drill axis is `-normal` tilted by `angleDeg` toward the
   *  mating part. */
  normal: { x: number; y: number; z: number };
  /** Kreg drill angle measured from the face surface (~15°), i.e. ~75°
   *  from the face normal. */
  angleDeg: number;
  /** entrance oval long-axis length (~1/2") */
  entranceLong: number;
  /** entrance oval short-axis length (~3/8") */
  entranceShort: number;
  /** how far the cylinder visually extends into the part */
  depth: number;
}

const ENTRANCE_LONG = 0.5;
const ENTRANCE_SHORT = 0.375;
const ANGLE_DEG = 15;

export function pocketHoleMarks(
  parts: Part[],
  joints: Joint[],
  _catalog: StockCatalog,
): PocketHoleMark[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: PocketHoleMark[] = [];
  for (const j of joints) {
    if (j.method !== "pocket-screw") continue;
    if (!j.drilledPartId || !j.drilledEdge) continue;
    const part = byId.get(j.drilledPartId);
    if (!part) continue;
    const positions = holePositions(j.edgeLength);
    for (const pos of positions) {
      out.push(markForPosition(part, j.id, j.drilledEdge, pos));
    }
  }
  return out;
}

function markForPosition(
  part: Part,
  jointId: string,
  _edge: DrilledEdge,
  _posAlongEdge: number,
): PocketHoleMark {
  // Placeholder: all geometry zeros — face mapping comes in the next task.
  return {
    jointId,
    partId: part.id,
    center: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 0 },
    angleDeg: ANGLE_DEG,
    entranceLong: ENTRANCE_LONG,
    entranceShort: ENTRANCE_SHORT,
    // Visualised cylinder extends 90% into the part, capped at the typical
    // Kreg drill-collar travel of 1".
    depth: Math.min(part.thickness * 0.9, 1.0),
  };
}
