import type { Carcass, Project, RefBox, Runner } from "../domain/types";
import { materialThickness } from "./types";
import { rectAABB, type AABB } from "./group";

type Placed = { id: string };

/** Footprint (centre + size + rotation) of any placed object. */
function footprint(
  obj: Placed,
  project: Project,
): { cx: number; cz: number; w: number; d: number; deg: number } | null {
  const r = project.runners.find((x) => x.id === obj.id);
  if (r)
    return {
      cx: r.position.x,
      cz: r.position.z,
      w: r.length,
      d: r.depth,
      deg: r.rotationDeg,
    };
  const c = project.carcasses.find((x) => x.id === obj.id);
  if (c)
    return {
      cx: c.position.x,
      cz: c.position.z,
      w: c.width,
      d: c.depth,
      deg: c.rotationDeg,
    };
  const b = project.refBoxes.find((x) => x.id === obj.id);
  if (b)
    return {
      cx: b.position.x,
      cz: b.position.z,
      w: b.width,
      d: b.depth,
      deg: b.rotationDeg,
    };
  return null;
}

/** Absolute height of an object's top surface (baseHeight + its own height). */
export function objectTop(obj: Placed, project: Project): number {
  const r = project.runners.find((x) => x.id === obj.id);
  if (r)
    return (
      (r.baseHeight ?? 0) +
      materialThickness(project.catalog.materials, r.boardMaterialId)
    );
  const c = project.carcasses.find((x) => x.id === obj.id);
  if (c) return (c.baseHeight ?? 0) + c.height;
  const b = project.refBoxes.find((x) => x.id === obj.id);
  if (b) return (b.baseHeight ?? 0) + b.height;
  return 0;
}

function overlaps(a: AABB, b: AABB): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

/** The Y a target should sit at to rest on whatever it overlaps: the highest
 *  top surface among all other objects whose footprint overlaps the target.
 *  0 (floor) when nothing is under it. */
export function snapHeight(target: Placed, project: Project): number {
  const f = footprint(target, project);
  if (!f) return 0;
  const box = rectAABB(f.cx, f.cz, f.w, f.d, f.deg);

  const others: Array<Carcass | Runner | RefBox> = [
    ...project.carcasses,
    ...project.runners,
    ...project.refBoxes,
  ];
  let best = 0;
  let found = false;
  for (const o of others) {
    if (o.id === target.id) continue;
    const of = footprint(o, project);
    if (!of) continue;
    if (!overlaps(box, rectAABB(of.cx, of.cz, of.w, of.d, of.deg))) continue;
    const t = objectTop(o, project);
    if (!found || t > best) {
      best = t;
      found = true;
    }
  }
  return found ? best : 0;
}
