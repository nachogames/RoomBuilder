import type { StockCatalog } from "../domain/types";
import type { DrilledEdge, Joint, Part, PartRole } from "./types";
import { holePositions } from "../pockets/kreg";

export interface PocketHoleMark {
  jointId: string;
  partId: string;
  /** carcass-local position of the entrance ellipse center on the drilled face */
  center: { x: number; y: number; z: number };
  /** Unit outward normal of the drilled face (points OUT of the part along
   *  the face the drill enters from). */
  normal: { x: number; y: number; z: number };
  /** Unit vector pointing from the entrance toward the part's interior,
   *  along the drill axis. Already accounts for the ~15° tilt away from
   *  `-normal` toward the mating end of the part. */
  drillAxis: { x: number; y: number; z: number };
  /** entrance oval long-axis length (~1/2") */
  entranceLong: number;
  /** entrance oval short-axis length (~3/8") */
  entranceShort: number;
  /** Unit vector along the entrance ellipse's long axis (which lies on
   *  the drilled face). */
  longAxis: { x: number; y: number; z: number };
  /** how far the cylinder visually extends into the part */
  depth: number;
}

const ENTRANCE_LONG = 0.5;
const ENTRANCE_SHORT = 0.375;
const ANGLE_DEG = 15;
/** Inset of the pocket entrance from the part's end, in inches. */
const END_INSET = 1.5;

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
      const mark = markForPosition(part, j.id, j.drilledEdge, pos);
      if (mark) out.push(mark);
    }
  }
  return out;
}

/**
 * Which face of a horizontal/rail part should the pocket entrance sit on?
 *
 * Real woodworking convention: drill pocket screws from the **inside-of-
 * carcass** face so the heads are hidden when the carcass is assembled.
 *  - Top panel: pockets on the underside (-y).
 *  - Bottom panel: pockets on the topside (+y).
 *  - Shelf: pockets on the underside (-y) — heads hidden from above.
 *  - Toe-kick rail: pockets on the back-facing face. The toe-kick part
 *    sits at the front of the carcass with `box.z = thickness`, so its
 *    back face is `+z`.
 *
 * Returns the outward normal of that face (a unit vector). Returns null
 * for roles we don't support pocket-drilling on (sides, back, etc.) —
 * those should never reach this code path in the first place since
 * carcass.ts only sets `drilledPartId` on horizontal members.
 */
function entranceFaceNormal(role: PartRole): { x: number; y: number; z: number } | null {
  switch (role) {
    case "top":
      return { x: 0, y: -1, z: 0 };
    case "bottom":
      return { x: 0, y: 1, z: 0 };
    case "shelf":
      return { x: 0, y: -1, z: 0 };
    case "toe-kick":
      return { x: 0, y: 0, z: 1 };
    default:
      return null;
  }
}

/** Direction (unit vec) from the entrance toward the END of the part that
 *  this joint targets. The drill axis tilts toward this direction. */
function endDirection(edge: DrilledEdge): { x: number; y: number; z: number } {
  switch (edge) {
    case "left":        return { x: -1, y: 0, z: 0 };
    case "right":       return { x: 1, y: 0, z: 0 };
    case "bottom-edge": return { x: 0, y: 0, z: -1 };
    case "top-edge":    return { x: 0, y: 0, z: 1 };
  }
}

function markForPosition(
  part: Part,
  jointId: string,
  edge: DrilledEdge,
  posAlongEdge: number,
): PocketHoleMark | null {
  const normal = entranceFaceNormal(part.role);
  if (!normal) return null;

  // Position the entrance:
  //  - Pin it to the part's drilled face (normal direction): for a -y face,
  //    that's at `center.y - thickness/2`.
  //  - Inset by END_INSET from the targeted end along the end-direction
  //    axis. (The jig sits inboard from the very end.)
  //  - Spread the rest of the positions along the perpendicular in-face axis
  //    starting from one end (matching the existing 2D pocket-plan).
  const endDir = endDirection(edge);
  const cx = part.center.x;
  const cy = part.center.y;
  const cz = part.center.z;
  const hx = part.box.x / 2;
  const hy = part.box.y / 2;
  const hz = part.box.z / 2;

  // Project the part center onto the entrance face: subtract half the
  // thickness in the +normal direction.
  let fx = cx + normal.x * hy;  // for y-normal faces hy is the panel thickness
  let fy = cy + normal.y * hy;
  let fz = cz + normal.z * hy;
  // The above uses hy only because for top/bottom/shelf the thickness is
  // along y. For the toe-kick (z-normal face) the thickness is along z,
  // so we override:
  if (Math.abs(normal.z) > 0) {
    fx = cx + normal.x * hz;
    fy = cy + normal.y * hz;
    fz = cz + normal.z * hz;
  }

  // Inset toward the end: for an end at (cx + endDir.x * hx) etc., the
  // entrance sits END_INSET inboard from that end. The position spread
  // (`posAlongEdge`) runs along the perpendicular in-face axis.
  // For left/right edges (endDir along x): the entrance x is
  // (cx + endDir.x * (hx - END_INSET)). Spread along z from (cz - hz).
  // For bottom/top edges (endDir along z): entrance z is
  // (cz + endDir.z * (hz - END_INSET)). Spread along x from (cx - hx).
  let center: { x: number; y: number; z: number };
  let longAxis: { x: number; y: number; z: number };
  if (Math.abs(endDir.x) > 0) {
    center = {
      x: cx + endDir.x * (hx - END_INSET),
      y: fy,
      z: cz - hz + posAlongEdge,
    };
    longAxis = { x: 0, y: 0, z: 1 };
  } else {
    center = {
      x: cx - hx + posAlongEdge,
      y: fy,
      z: cz + endDir.z * (hz - END_INSET),
    };
    longAxis = { x: 1, y: 0, z: 0 };
  }
  // Override the face-projected coord onto the actual entrance face:
  if (Math.abs(normal.x) > 0) center.x = fx;
  if (Math.abs(normal.y) > 0) center.y = fy;
  if (Math.abs(normal.z) > 0) center.z = fz;

  // Drill axis: starts as -normal (straight into the part), tilted by
  // ANGLE_DEG toward the end direction. We rotate around the axis
  // perpendicular to both normal and endDir.
  const drillAxis = tilt(neg(normal), endDir, ANGLE_DEG);

  return {
    jointId,
    partId: part.id,
    center,
    normal,
    drillAxis,
    longAxis,
    entranceLong: ENTRANCE_LONG,
    entranceShort: ENTRANCE_SHORT,
    // Visualised cylinder extends 90% into the part, capped at the typical
    // Kreg drill-collar travel of 1".
    depth: Math.min(part.thickness * 0.9, 1.0),
  };
}

type V3 = { x: number; y: number; z: number };
function neg(v: V3): V3 { return { x: -v.x, y: -v.y, z: -v.z }; }

/** Tilt `from` by `deg` degrees toward `target`, both unit vectors. The
 *  result lies in the plane spanned by `from` and `target`. */
function tilt(from: V3, target: V3, deg: number): V3 {
  // Component of target perpendicular to from:
  const dot = from.x * target.x + from.y * target.y + from.z * target.z;
  const perp = {
    x: target.x - dot * from.x,
    y: target.y - dot * from.y,
    z: target.z - dot * from.z,
  };
  const plen = Math.hypot(perp.x, perp.y, perp.z);
  if (plen < 1e-9) return from;
  perp.x /= plen; perp.y /= plen; perp.z /= plen;
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  return {
    x: c * from.x + s * perp.x,
    y: c * from.y + s * perp.y,
    z: c * from.z + s * perp.z,
  };
}
