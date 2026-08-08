import type { Project, Carcass, Runner, RefBox, Person, Pt } from "../domain/types";
import { collisionWalls, rectInsideRoom } from "../domain/room";
import { snapHeight, dependentsOf, shelfSurfaceId } from "../geometry/stacking";
import { materialThickness } from "../geometry/types";
import { resolveMove } from "./dragMath";
import { findContainer, clampToInterior } from "../geometry/container";
import { translateGroup } from "../geometry/group";
import { attemptToteMove } from "../geometry/totePush";
import { personFootprint } from "../domain/person";

export type MovableKind = "carcass" | "runner" | "refBox" | "person";

/**
 * The world-space footprint of a carcass including its surface-mounted
 * back panel. The back hangs off the carcass's local -z direction by
 * `tb`, so the enlarged rect is `(width, depth + tb)` shifted from
 * `(px, pz)` by `tb/2` toward that direction in world coords.
 *
 * Convention: the Scene renders carcasses with three.js rotation
 * `-rotationDeg` (positive rotationDeg = clockwise when viewed from
 * above). Under that convention, the carcass's local -z direction (the
 * back) maps to world (sin(rotationDeg), -cos(rotationDeg)):
 *  - rotationDeg=0  → back faces world -z   ✓
 *  - rotationDeg=90 → back faces world +x   ✓
 *  - rotationDeg=180→ back faces world +z   ✓
 *  - rotationDeg=270→ back faces world -x   ✓
 */
export function carcassRoomRect(
  c: Carcass,
  project: Project,
  px: number,
  pz: number,
): { cx: number; cz: number; w: number; d: number } {
  const tb = c.hasBack
    ? materialThickness(project.catalog.materials, c.backMaterialId)
    : 0;
  const a = (c.rotationDeg * Math.PI) / 180;
  return {
    cx: px + Math.sin(a) * (tb / 2),
    cz: pz - Math.cos(a) * (tb / 2),
    w: c.width,
    d: c.depth + tb,
  };
}

export interface DropTarget {
  x: number;
  z: number;
  /** desired baseHeight; ignored for people. If omitted, snapHeight runs. */
  y?: number;
  /** desired Y rotation in degrees; if omitted, current rotation is kept. */
  rotationDeg?: number;
}

export interface DropResult {
  /** Updated project with the entity (and any cascaded entities) moved and
   *  snapped to a valid placement. */
  project: Project;
}

/** Resolve a shelf Y move inside its carcass: clamp `offsetFromBottom` to
 *  the interior range, then translate dependents resting on the shelf top
 *  by the resulting Y delta. */
export function resolveShelfDrop(
  project: Project,
  carcassId: string,
  shelfIdx: number,
  newOffsetFromBottom: number,
): DropResult {
  const c = project.carcasses.find((k) => k.id === carcassId);
  if (!c) return { project };
  const sh = c.shelves[shelfIdx];
  if (!sh) return { project };
  const carcassT = materialThickness(project.catalog.materials, c.carcassMaterialId);
  const shelfT = materialThickness(project.catalog.materials, c.shelfMaterialId);
  const interiorH = c.height - c.toeKickHeight - 2 * carcassT;
  const minOffset = 0;
  const maxOffset = Math.max(0, interiorH - shelfT);
  const clamped = Math.min(maxOffset, Math.max(minOffset, newOffsetFromBottom));
  const oldOffset = sh.offsetFromBottom;
  const dy = clamped - oldOffset;
  if (Math.abs(dy) < 1e-9) return { project };
  const supportId = shelfSurfaceId(carcassId, shelfIdx);
  const nextCarcass: Carcass = {
    ...c,
    shelves: c.shelves.map((s, i) =>
      i === shelfIdx ? { ...s, offsetFromBottom: clamped } : s,
    ),
  };
  const proj1: Project = {
    ...project,
    carcasses: project.carcasses.map((k) =>
      k.id === carcassId ? nextCarcass : k,
    ),
  };
  return { project: applyStackFollow(project, proj1, supportId, dy) };
}

/** Resolve a 3D drop for any movable entity. Mirrors the per-kind logic
 *  PlanView uses while dragging, plus snapHeight for Y. */
export function resolveDrop(
  project: Project,
  kind: MovableKind,
  id: string,
  target: DropTarget,
): DropResult {
  if (kind === "carcass") return dropCarcass(project, id, target);
  if (kind === "runner") return dropRunner(project, id, target);
  if (kind === "refBox") return dropRefBox(project, id, target);
  return dropPerson(project, id, target);
}

function dropCarcass(project: Project, id: string, t: DropTarget): DropResult {
  const c = project.carcasses.find((k) => k.id === id);
  if (!c) return { project };
  const oldY = c.baseHeight ?? 0;
  // Apply the new rotation (if any) BEFORE the wall-clamp so the rect we
  // check is oriented correctly.
  const rotated: Carcass = t.rotationDeg !== undefined
    ? { ...c, rotationDeg: t.rotationDeg }
    : c;
  const cWalls = collisionWalls(project.room, c.baseHeight ?? 0);
  const ok = (px: number, pz: number) => {
    const r = carcassRoomRect(rotated, project, px, pz);
    return rectInsideRoom(cWalls, r.cx, r.cz, r.w, r.d, rotated.rotationDeg);
  };
  const pos = resolveMove(ok, t.x, t.z, c.position, false);
  const next: Carcass = { ...rotated, position: pos };
  const proj1: Project = {
    ...project,
    carcasses: project.carcasses.map((k) => (k.id === id ? next : k)),
  };
  const desiredY = t.y;
  const probe: Carcass = { ...next, baseHeight: desiredY ?? next.baseHeight };
  const baseHeight = clampY(snapHeight(probe, proj1), desiredY);
  const proj2: Project = {
    ...proj1,
    carcasses: proj1.carcasses.map((k) =>
      k.id === id ? { ...k, baseHeight } : k,
    ),
  };
  return { project: applyStackFollow(project, proj2, id, baseHeight - oldY) };
}

function dropRunner(project: Project, id: string, t: DropTarget): DropResult {
  const rOrig = project.runners.find((k) => k.id === id);
  if (!rOrig) return { project };
  // Apply rotation (if provided) before everything else.
  const r: Runner = t.rotationDeg !== undefined
    ? { ...rOrig, rotationDeg: t.rotationDeg }
    : rOrig;
  const container = findContainer(
    {
      id: r.id,
      w: r.length,
      d: r.depth,
      cx: t.x,
      cz: t.z,
      rotationDeg: r.rotationDeg,
      prevPos: r.position,
      excludeIds: r.spannedCarcassIds,
    },
    project,
  );
  const ok = (px: number, pz: number) =>
    rectInsideRoom(
      collisionWalls(project.room, r.baseHeight ?? 0),
      px,
      pz,
      r.length,
      r.depth,
      r.rotationDeg,
    );
  const pos = container
    ? clampToInterior(container, r.length, r.depth, t.x, t.z, project, r.rotationDeg)
    : resolveMove(ok, t.x, t.z, r.position, true);

  let proj1: Project;
  if (r.groupDrag && !container) {
    const t2 = translateGroup(r, project, pos.x - r.position.x, pos.z - r.position.z);
    proj1 = {
      ...project,
      runners: project.runners.map((k) =>
        k.id === r.id ? { ...t2.runner, rotationDeg: r.rotationDeg } : k,
      ),
      carcasses: project.carcasses.map((k) =>
        t2.carcassPos[k.id] ? { ...k, position: t2.carcassPos[k.id] } : k,
      ),
    };
  } else {
    proj1 = {
      ...project,
      runners: project.runners.map((k) =>
        k.id === r.id ? { ...k, position: pos, rotationDeg: r.rotationDeg } : k,
      ),
    };
  }
  const moved = proj1.runners.find((k) => k.id === id) as Runner;
  const desiredY = t.y;
  const probe: Runner = { ...moved, baseHeight: desiredY ?? moved.baseHeight };
  const baseHeight = clampY(snapHeight(probe, proj1), desiredY);
  const oldY = r.baseHeight ?? 0;
  const proj2: Project = {
    ...proj1,
    runners: proj1.runners.map((k) =>
      k.id === id ? { ...k, baseHeight } : k,
    ),
  };
  return { project: applyStackFollow(project, proj2, id, baseHeight - oldY) };
}

function dropRefBox(project: Project, id: string, t: DropTarget): DropResult {
  const bxOrig = project.refBoxes.find((k) => k.id === id);
  if (!bxOrig) return { project };
  const bx: RefBox = t.rotationDeg !== undefined
    ? { ...bxOrig, rotationDeg: t.rotationDeg }
    : bxOrig;
  const bw = Math.max(bx.width, bx.topWidth ?? bx.width);
  const bd = Math.max(bx.depth, bx.topDepth ?? bx.depth);
  const container = findContainer(
    { id: bx.id, w: bw, d: bd, cx: t.x, cz: t.z, rotationDeg: bx.rotationDeg, prevPos: bx.position },
    project,
  );
  const okFn = (px: number, pz: number) =>
    rectInsideRoom(
      collisionWalls(project.room, bx.baseHeight ?? 0),
      px,
      pz,
      bw,
      bd,
      bx.rotationDeg,
    );
  const clampTarget: Pt = container
    ? clampToInterior(container, bw, bd, t.x, t.z, project, bx.rotationDeg)
    : resolveMove(okFn, t.x, t.z, bx.position, false);

  const cascade = attemptToteMove(project, bx.id, clampTarget.x, clampTarget.z);
  let proj1: Project = project;
  if (cascade.ok && cascade.moverPos) {
    const updates = { ...cascade.updates, [bx.id]: cascade.moverPos };
    proj1 = {
      ...project,
      refBoxes: project.refBoxes.map((k) => {
        if (k.id === bx.id) {
          return { ...k, position: cascade.moverPos!, rotationDeg: bx.rotationDeg };
        }
        return updates[k.id] ? { ...k, position: updates[k.id] } : k;
      }),
    };
  }
  const moved = proj1.refBoxes.find((k) => k.id === id) as RefBox;
  const desiredY = t.y;
  const probe: RefBox = { ...moved, baseHeight: desiredY ?? moved.baseHeight };
  const baseHeight = clampY(snapHeight(probe, proj1), desiredY);
  const oldY = bx.baseHeight ?? 0;
  const proj2: Project = {
    ...proj1,
    refBoxes: proj1.refBoxes.map((k) =>
      k.id === id ? { ...k, baseHeight } : k,
    ),
  };
  return { project: applyStackFollow(project, proj2, id, baseHeight - oldY) };
}

function dropPerson(project: Project, id: string, t: DropTarget): DropResult {
  const pnOrig = project.people.find((k) => k.id === id);
  if (!pnOrig) return { project };
  const pn: Person = t.rotationDeg !== undefined
    ? { ...pnOrig, rotationDeg: t.rotationDeg }
    : pnOrig;
  const fp = personFootprint(pn);
  const ok = (px: number, pz: number) =>
    rectInsideRoom(
      collisionWalls(project.room, pn.baseHeight ?? 0),
      px,
      pz,
      fp.width,
      fp.depth,
      pn.rotationDeg,
    );
  const pos = resolveMove(ok, t.x, t.z, pn.position, false);
  const next: Person = { ...pn, position: pos };
  return {
    project: {
      ...project,
      people: project.people.map((k) => (k.id === id ? next : k)),
    },
  };
}

/** When the user drags the Y handle upward (above any surface), snapHeight
 *  would pull them back down. Honor an explicit raise — keep the desired Y
 *  if it's strictly higher than what snap would return. */
function clampY(snapped: number, desired: number | undefined): number {
  if (desired == null) return snapped;
  return Math.max(snapped, Math.max(0, desired));
}

/** Translate every entity's `baseHeight` field by `dy`, restricted to the
 *  set of ids that were resting on the moving support before the move. Used
 *  by stack-follow so a stack of items rides with a raised shelf/runner/carcass. */
function translateBaseHeights(
  project: Project,
  ids: Set<string>,
  dy: number,
): Project {
  if (ids.size === 0 || dy === 0) return project;
  return {
    ...project,
    carcasses: project.carcasses.map((c) =>
      ids.has(c.id) ? { ...c, baseHeight: (c.baseHeight ?? 0) + dy } : c,
    ),
    runners: project.runners.map((r) =>
      ids.has(r.id) ? { ...r, baseHeight: (r.baseHeight ?? 0) + dy } : r,
    ),
    refBoxes: project.refBoxes.map((b) =>
      ids.has(b.id) ? { ...b, baseHeight: (b.baseHeight ?? 0) + dy } : b,
    ),
    people: project.people.map((p) =>
      ids.has(p.id) ? { ...p, baseHeight: (p.baseHeight ?? 0) + dy } : p,
    ),
  };
}

/** Apply Y-only stack-follow: capture dependents of `supportId` BEFORE the
 *  Y change is observed in the project tree, then translate them by `dy`
 *  in the post-move project. */
export function applyStackFollow(
  prevProject: Project,
  nextProject: Project,
  supportId: string,
  dy: number,
): Project {
  if (Math.abs(dy) < 1e-9) return nextProject;
  const deps = dependentsOf(prevProject, supportId);
  if (deps.length === 0) return nextProject;
  return translateBaseHeights(nextProject, new Set(deps), dy);
}
