import type { Carcass, Project } from "../domain/types";
import { materialThickness } from "./types";

/** Item being dragged, described by its footprint and centre (world coords). */
export interface DragItem {
  id: string;
  w: number;
  d: number;
  cx: number;
  cz: number;
  /** the item's own rotation in degrees (defaults to 0) */
  rotationDeg?: number;
  /** the item's position BEFORE this drag tick (defaults to its current cx,cz).
   *  Used to gate capture to the open-front side: an item approaching from
   *  behind the back wall is not pulled in through the solid back. */
  prevPos?: { x: number; z: number };
  /** carcasses to ignore (e.g. a runner's own spanned cabinets) */
  excludeIds?: string[];
}

/** Half-extents of a w×d footprint along the carcass's local x and z axes when
 *  the item is turned by `relDeg` relative to the carcass. At relDeg 0 these are
 *  just w/2 and d/2; a 90° turn swaps them. */
function localHalfExtents(
  w: number,
  d: number,
  relDeg: number,
): { hx: number; hz: number } {
  const rad = (relDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const hw = w / 2;
  const hd = d / 2;
  return { hx: hw * c + hd * s, hz: hw * s + hd * c };
}

interface Interior {
  innerW: number;
  interiorD: number;
  /** local-z of the inner face of the back panel (back is at local −Z) */
  backInner: number;
}

function interiorOf(c: Carcass, project: Project): Interior {
  const t = materialThickness(project.catalog.materials, c.carcassMaterialId);
  // Back panel is surface-mounted on the rear so it doesn't reduce
  // interior depth; the inner face of the back lines up with the back
  // edges of the framing at z = -depth/2.
  return {
    innerW: c.width - 2 * t,
    interiorD: c.depth,
    backInner: -c.depth / 2,
  };
}

/** World → carcass-local (undo the carcass rotation about its centre). */
function toLocal(c: Carcass, x: number, z: number): [number, number] {
  const rad = (c.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - c.position.x;
  const dz = z - c.position.z;
  return [dx * cos + dz * sin, -dx * sin + dz * cos];
}

/** The bookcase whose interior should capture this item: the item's footprint
 *  fits inside the cavity and its centre is over the carcass. Null if none. */
export function findContainer(item: DragItem, project: Project): Carcass | null {
  for (const c of project.carcasses) {
    if (c.id === item.id) continue;
    if (item.excludeIds?.includes(c.id)) continue;
    const { innerW, backInner } = interiorOf(c, project);
    // the turned footprint must fit between the side walls; depth may exceed the
    // cavity (the item just sticks out the open front).
    const { hx, hz } = localHalfExtents(item.w, item.d, (item.rotationDeg ?? 0) - c.rotationDeg);
    if (2 * hx > innerW + 1e-6) continue;
    const [lx, lz] = toLocal(c, item.cx, item.cz);
    // centre must be laterally over the carcass, and the footprint must still
    // overlap it in depth (so a deep item poking out the open front isn't
    // dropped when its centre passes the back).
    if (Math.abs(lx) > c.width / 2 || Math.abs(lz) > c.depth / 2 + hz) continue;
    // capture only from the open-front side: the item's PREVIOUS centre must
    // be in front of the back inner face (lz ≥ backInner). A deep item that's
    // already inside-and-clamped passes this trivially (its centre rests at
    // backInner + hz > backInner); a tote being dragged around to behind the
    // bookcase does not.
    const prev = item.prevPos ?? { x: item.cx, z: item.cz };
    const [, lzPrev] = toLocal(c, prev.x, prev.z);
    if (lzPrev < backInner - 1e-6) continue;
    return c;
  }
  return null;
}

/** Clamp a target so the item's footprint stays within the bookcase interior:
 *  inner side walls (x) and the back (−Z), with the front (+Z) left open. */
export function clampToInterior(
  c: Carcass,
  itemW: number,
  itemD: number,
  tx: number,
  tz: number,
  project: Project,
  itemRotationDeg = 0,
): { x: number; z: number } {
  const { innerW, backInner } = interiorOf(c, project);
  const rad = (c.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // the item's footprint as seen in the carcass frame (turned by the relative
  // angle): hx faces the side walls, hz faces the front/back.
  const { hx, hz } = localHalfExtents(itemW, itemD, itemRotationDeg - c.rotationDeg);
  // world → local
  const dx = tx - c.position.x;
  const dz = tz - c.position.z;
  let lx = dx * cos + dz * sin;
  let lz = -dx * sin + dz * cos;
  // sides
  const halfX = Math.max(0, innerW / 2 - hx);
  lx = Math.max(-halfX, Math.min(halfX, lx));
  // back wall: the rear edge can't pass the back inner face. The front stays
  // open, so an item deeper than the cavity just pokes out the front (its rear
  // resting on the back wall) instead of sliding straight through.
  const minLz = backInner + hz;
  if (lz < minLz) lz = minLz;
  // local → world
  return {
    x: c.position.x + lx * cos - lz * sin,
    z: c.position.z + lx * sin + lz * cos,
  };
}
