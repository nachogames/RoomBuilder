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

/** Place one pocket hole on the drilled face of `part`.
 *  `posAlongEdge` is the offset along the in-face axis (z for left/right
 *  edges, x for top/bottom edges) starting from the lower-coord end of
 *  that axis. */
function markForPosition(
  part: Part,
  jointId: string,
  edge: DrilledEdge,
  posAlongEdge: number,
): PocketHoleMark {
  const cx = part.center.x;
  const cy = part.center.y;
  const cz = part.center.z;
  const hx = part.box.x / 2;
  const hz = part.box.z / 2;

  let center = { x: cx, y: cy, z: cz };
  let normal = { x: 0, y: 0, z: 0 };

  if (edge === "left") {
    // -x face; holes spread along z from (cz - hz) to (cz + hz)
    center = { x: cx - hx, y: cy, z: cz - hz + posAlongEdge };
    normal = { x: -1, y: 0, z: 0 };
  } else if (edge === "right") {
    center = { x: cx + hx, y: cy, z: cz - hz + posAlongEdge };
    normal = { x: 1, y: 0, z: 0 };
  } else if (edge === "bottom-edge") {
    // -z face; holes spread along x
    center = { x: cx - hx + posAlongEdge, y: cy, z: cz - hz };
    normal = { x: 0, y: 0, z: -1 };
  } else {
    // top-edge: +z face
    center = { x: cx - hx + posAlongEdge, y: cy, z: cz + hz };
    normal = { x: 0, y: 0, z: 1 };
  }

  return {
    jointId,
    partId: part.id,
    center,
    normal,
    angleDeg: ANGLE_DEG,
    entranceLong: ENTRANCE_LONG,
    entranceShort: ENTRANCE_SHORT,
    // Visualised cylinder extends 90% into the part, capped at the typical
    // Kreg drill-collar travel of 1".
    depth: Math.min(part.thickness * 0.9, 1.0),
  };
}
