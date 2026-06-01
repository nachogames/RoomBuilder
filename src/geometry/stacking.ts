import type { Project } from "../domain/types";
import { materialThickness } from "./types";
import { rectAABB, type AABB } from "./group";
import { personFootprint, personTopY } from "../domain/person";

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
  const pn = project.people.find((x) => x.id === obj.id);
  if (pn) {
    const fp = personFootprint(pn);
    return {
      cx: pn.position.x,
      cz: pn.position.z,
      w: fp.width,
      d: fp.depth,
      deg: pn.rotationDeg,
    };
  }
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
  const pn = project.people.find((x) => x.id === obj.id);
  if (pn) return (pn.baseHeight ?? 0) + personTopY(pn);
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
    // cavity floor (top of the bottom panel, above the toe kick) so a runner
    // or tote placed inside an empty cabinet can snap to the floor too.
    out.push({ top: (c.baseHeight ?? 0) + interior, foot });
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
  for (const pn of project.people) {
    if (pn.id === target.id) continue;
    const fp = personFootprint(pn);
    out.push({
      top: (pn.baseHeight ?? 0) + personTopY(pn),
      foot: rectAABB(
        pn.position.x,
        pn.position.z,
        fp.width,
        fp.depth,
        pn.rotationDeg,
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
      project.people.find((pn) => pn.id === target.id)?.baseHeight ??
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

/** Synthetic id for a shelf surface inside a carcass. Lets `dependentsOf`
 *  and related helpers refer to a shelf top by a single string without
 *  changing the entity selection model. Real entity ids never contain ":". */
export function shelfSurfaceId(carcassId: string, shelfIdx: number): string {
  return `sh:${carcassId}:${shelfIdx}`;
}

/** Inverse of `shelfSurfaceId`; null when the input isn't a shelf surface id. */
export function parseShelfSurfaceId(
  id: string,
): { carcassId: string; shelfIdx: number } | null {
  if (!id.startsWith("sh:")) return null;
  const rest = id.slice(3);
  const cut = rest.lastIndexOf(":");
  if (cut < 0) return null;
  const idx = Number(rest.slice(cut + 1));
  if (!Number.isFinite(idx) || idx < 0) return null;
  return { carcassId: rest.slice(0, cut), shelfIdx: idx };
}

/** Absolute Y of a shelf's top surface (the face things rest on), or null
 *  when the carcass / shelf doesn't exist. */
export function shelfTopAbsoluteY(
  project: Project,
  carcassId: string,
  shelfIdx: number,
): number | null {
  const c = project.carcasses.find((x) => x.id === carcassId);
  if (!c) return null;
  const sh = c.shelves[shelfIdx];
  if (!sh) return null;
  const carcassT = materialThickness(project.catalog.materials, c.carcassMaterialId);
  const shelfT = materialThickness(project.catalog.materials, c.shelfMaterialId);
  const interiorFloor = (c.baseHeight ?? 0) + c.toeKickHeight + carcassT;
  return interiorFloor + sh.offsetFromBottom + shelfT;
}

/** Footprint AABB of a support surface, or null. For real entities the
 *  footprint is the entity's own; for shelf surfaces it's the parent
 *  carcass's footprint. */
function supportFootprint(project: Project, id: string): AABB | null {
  const shelf = parseShelfSurfaceId(id);
  if (shelf) {
    const c = project.carcasses.find((x) => x.id === shelf.carcassId);
    if (!c) return null;
    return rectAABB(c.position.x, c.position.z, c.width, c.depth, c.rotationDeg);
  }
  const f = footprint({ id }, project);
  if (!f) return null;
  return rectAABB(f.cx, f.cz, f.w, f.d, f.deg);
}

/** Top-surface Y of an arbitrary support id (real entity or shelf surface).
 *  Returns null when the id resolves to no support. */
export function supportTopY(project: Project, id: string): number | null {
  const shelf = parseShelfSurfaceId(id);
  if (shelf) return shelfTopAbsoluteY(project, shelf.carcassId, shelf.shelfIdx);
  if (project.carcasses.some((c) => c.id === id))
    return objectTop({ id }, project);
  if (project.runners.some((r) => r.id === id))
    return objectTop({ id }, project);
  if (project.refBoxes.some((b) => b.id === id))
    return objectTop({ id }, project);
  if (project.people.some((p) => p.id === id))
    return objectTop({ id }, project);
  return null;
}

interface PlacedEntity {
  id: string;
  baseHeight: number;
  foot: AABB;
}

function gatherPlaced(project: Project, excludeIds: Set<string>): PlacedEntity[] {
  const out: PlacedEntity[] = [];
  for (const c of project.carcasses) {
    if (excludeIds.has(c.id)) continue;
    out.push({
      id: c.id,
      baseHeight: c.baseHeight ?? 0,
      foot: rectAABB(c.position.x, c.position.z, c.width, c.depth, c.rotationDeg),
    });
  }
  for (const r of project.runners) {
    if (excludeIds.has(r.id)) continue;
    out.push({
      id: r.id,
      baseHeight: r.baseHeight ?? 0,
      foot: rectAABB(r.position.x, r.position.z, r.length, r.depth, r.rotationDeg),
    });
  }
  for (const b of project.refBoxes) {
    if (excludeIds.has(b.id)) continue;
    out.push({
      id: b.id,
      baseHeight: b.baseHeight ?? 0,
      foot: rectAABB(b.position.x, b.position.z, b.width, b.depth, b.rotationDeg),
    });
  }
  for (const pn of project.people) {
    if (excludeIds.has(pn.id)) continue;
    const fp = personFootprint(pn);
    out.push({
      id: pn.id,
      baseHeight: pn.baseHeight ?? 0,
      foot: rectAABB(pn.position.x, pn.position.z, fp.width, fp.depth, pn.rotationDeg),
    });
  }
  return out;
}

/** Direct dependents of a support: placed entities whose `baseHeight` sits
 *  on `supportTop` (within DEP_EPS) AND whose footprint overlaps the
 *  support's footprint. Does NOT recurse. */
const DEP_EPS = 1 / 64;
function directDependents(
  project: Project,
  supportId: string,
  excludeIds: Set<string>,
): string[] {
  const top = supportTopY(project, supportId);
  if (top == null) return [];
  const foot = supportFootprint(project, supportId);
  if (!foot) return [];
  const out: string[] = [];
  for (const p of gatherPlaced(project, excludeIds)) {
    if (Math.abs(p.baseHeight - top) > DEP_EPS) continue;
    if (!overlaps(p.foot, foot)) continue;
    out.push(p.id);
  }
  return out;
}

/** Transitive set of placed entities resting on `supportId` (directly or
 *  through a chain of supports). The support itself is NOT included. Cycle
 *  guard prevents pathological projects from looping. */
export function dependentsOf(project: Project, supportId: string): string[] {
  const visited = new Set<string>();
  visited.add(supportId);
  // Carcass shelves are also "in" the visited set when the support is a
  // carcass — moving a carcass moves its shelves implicitly, so a tote on
  // shelf 2 only gets caught once even though both shelf-2 AND the carcass
  // top are valid supports for it.
  const carcassSubsurfaces = (carcassId: string): string[] => {
    const c = project.carcasses.find((x) => x.id === carcassId);
    if (!c) return [];
    return c.shelves.map((_, i) => shelfSurfaceId(carcassId, i));
  };
  const seedShelves = !parseShelfSurfaceId(supportId)
    ? carcassSubsurfaces(supportId)
    : [];
  for (const s of seedShelves) visited.add(s);

  const queue: string[] = [supportId, ...seedShelves];
  const found: string[] = [];
  while (queue.length > 0) {
    const here = queue.shift()!;
    const deps = directDependents(project, here, visited);
    for (const id of deps) {
      if (visited.has(id)) continue;
      visited.add(id);
      found.push(id);
      queue.push(id);
      // also enqueue this entity's own shelves so a tote-on-shelf-on-carcass
      // chain is reachable
      for (const s of carcassSubsurfaces(id)) {
        if (!visited.has(s)) {
          visited.add(s);
          queue.push(s);
        }
      }
    }
  }
  return found;
}

/** Highest horizontal surface Y at world point (x, z) that's at or below maxY.
 *  Used to size a runner's leg support — it spans from the runner's underside
 *  down to whatever's directly below it (floor when nothing else is there).
 *  `excludeId` lets a runner ignore its own surfaces. */
export function surfaceUnderPoint(
  x: number,
  z: number,
  maxY: number,
  project: Project,
  excludeId?: string,
): number {
  const eps = 1e-6;
  let best = 0;
  for (const s of gatherSurfaces({ id: excludeId ?? "__none__" }, project)) {
    if (s.top > maxY + eps) continue;
    if (x < s.foot.minX - eps || x > s.foot.maxX + eps) continue;
    if (z < s.foot.minZ - eps || z > s.foot.maxZ + eps) continue;
    if (s.top > best) best = s.top;
  }
  return best;
}
