import type { Project } from "../domain/types";
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

/** A horizontal surface candidate the target could rest on. */
interface Surface {
  top: number;
  foot: AABB;
}

function gatherSurfaces(target: Placed, project: Project): Surface[] {
  const out: Surface[] = [];
  for (const c of project.carcasses) {
    if (c.id === target.id) continue;
    const foot = rectAABB(
      c.position.x,
      c.position.z,
      c.width,
      c.depth,
      c.rotationDeg,
    );
    out.push({ top: (c.baseHeight ?? 0) + c.height, foot });
    const carcassT = materialThickness(
      project.catalog.materials,
      c.carcassMaterialId,
    );
    const shelfT = materialThickness(
      project.catalog.materials,
      c.shelfMaterialId,
    );
    const interior = c.toeKickHeight + carcassT;
    for (const sh of c.shelves) {
      out.push({
        top: (c.baseHeight ?? 0) + interior + sh.offsetFromBottom + shelfT,
        foot,
      });
    }
  }
  for (const r of project.runners) {
    if (r.id === target.id) continue;
    out.push({
      top:
        (r.baseHeight ?? 0) +
        materialThickness(project.catalog.materials, r.boardMaterialId),
      foot: rectAABB(
        r.position.x,
        r.position.z,
        r.length,
        r.depth,
        r.rotationDeg,
      ),
    });
  }
  for (const b of project.refBoxes) {
    if (b.id === target.id) continue;
    out.push({
      top: (b.baseHeight ?? 0) + b.height,
      foot: rectAABB(
        b.position.x,
        b.position.z,
        b.width,
        b.depth,
        b.rotationDeg,
      ),
    });
  }
  return out;
}

/** The Y a target should drop to: the highest horizontal surface (cabinet/
 *  runner/tote top OR a carcass shelf) that overlaps the target's footprint
 *  AND sits at or below its current Pos Y. Floor (0) when nothing qualifies. */
export function snapHeight(target: Placed, project: Project): number {
  const f = footprint(target, project);
  if (!f) return 0;
  const box = rectAABB(f.cx, f.cz, f.w, f.d, f.deg);
  const currentY =
    (target as { baseHeight?: number }).baseHeight ??
    // fall back to a fresh lookup so callers can pass a stale ref
    (project.carcasses.find((c) => c.id === target.id)?.baseHeight ??
      project.runners.find((r) => r.id === target.id)?.baseHeight ??
      project.refBoxes.find((b) => b.id === target.id)?.baseHeight ??
      0);
  const eps = 1e-6;

  let best = 0;
  let found = false;
  for (const s of gatherSurfaces(target, project)) {
    if (s.top > currentY + eps) continue;
    if (!overlaps(box, s.foot)) continue;
    if (!found || s.top > best) {
      best = s.top;
      found = true;
    }
  }
  return found ? best : 0;
}
