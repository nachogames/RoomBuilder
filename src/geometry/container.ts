import type { Carcass, Project } from "../domain/types";
import { materialThickness } from "./types";

/** Item being dragged, described by its footprint and centre (world coords). */
export interface DragItem {
  id: string;
  w: number;
  d: number;
  cx: number;
  cz: number;
  /** carcasses to ignore (e.g. a runner's own spanned cabinets) */
  excludeIds?: string[];
}

interface Interior {
  innerW: number;
  interiorD: number;
  /** local-z of the inner face of the back panel (back is at local −Z) */
  backInner: number;
}

function interiorOf(c: Carcass, project: Project): Interior {
  const t = materialThickness(project.catalog.materials, c.carcassMaterialId);
  const backT = c.hasBack
    ? materialThickness(project.catalog.materials, c.backMaterialId)
    : 0;
  return {
    innerW: c.width - 2 * t,
    interiorD: c.depth - backT,
    backInner: -c.depth / 2 + backT,
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
    const { innerW } = interiorOf(c, project);
    // width must fit between the side walls; depth may exceed the cavity since
    // the front is open (the item just sticks out the front).
    if (item.w > innerW + 1e-6) continue;
    const [lx, lz] = toLocal(c, item.cx, item.cz);
    if (Math.abs(lx) <= c.width / 2 && Math.abs(lz) <= c.depth / 2) return c;
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
): { x: number; z: number } {
  const { innerW, backInner } = interiorOf(c, project);
  const rad = (c.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // world → local
  const dx = tx - c.position.x;
  const dz = tz - c.position.z;
  let lx = dx * cos + dz * sin;
  let lz = -dx * sin + dz * cos;
  // sides
  const halfX = Math.max(0, innerW / 2 - itemW / 2);
  lx = Math.max(-halfX, Math.min(halfX, lx));
  // back wall; front open
  const minLz = backInner + itemD / 2;
  if (lz < minLz) lz = minLz;
  // local → world
  return {
    x: c.position.x + lx * cos - lz * sin,
    z: c.position.z + lx * sin + lz * cos,
  };
}
