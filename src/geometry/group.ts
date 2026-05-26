import type { Carcass, Project, Runner } from "../domain/types";
import { materialThickness } from "./types";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Carcasses the desktop owns (drag-as-group + sag bearing). */
export function ownedCarcasses(r: Runner, project: Project): Carcass[] {
  return project.carcasses.filter((c) => r.spannedCarcassIds.includes(c.id));
}

/** Corners of a rect (centre cx/cz, size w×d) rotated by `deg` about its centre. */
export function corners(
  cx: number,
  cz: number,
  w: number,
  d: number,
  deg: number,
): Array<[number, number]> {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = w / 2;
  const hd = d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([dx, dz]) => [
    cx + dx * cos - dz * sin,
    cz + dx * sin + dz * cos,
  ]);
}

/** Axis-aligned bounding box of one rotated rect. */
export function rectAABB(
  cx: number,
  cz: number,
  w: number,
  d: number,
  deg: number,
): AABB {
  const pts = corners(cx, cz, w, d, deg);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** Axis-aligned bounding box of the whole desk group: the desktop (incl.
 *  overhang, since length/depth already express it) unioned with every owned
 *  cabinet, each rotation-aware. */
export function groupAABB(r: Runner, project: Project): AABB {
  const pts: Array<[number, number]> = [
    ...corners(r.position.x, r.position.z, r.length, r.depth, r.rotationDeg),
  ];
  for (const c of ownedCarcasses(r, project)) {
    pts.push(
      ...corners(c.position.x, c.position.z, c.width, c.depth, c.rotationDeg),
    );
  }
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** World-x range of a carcass's INTERIOR (cavity) — the rectangle bounded by
 *  the two side panels' inner faces, the back panel's inner face, and the
 *  cabinet's front edge. Rotation-aware: a cabinet turned 90° presents its
 *  back-panel-inside-face as the relevant interior bound along world-x, not a
 *  side panel. */
function cavityWorldXRange(
  c: Carcass,
  project: Project,
): { minX: number; maxX: number } {
  const sideT = materialThickness(
    project.catalog.materials,
    c.carcassMaterialId,
  );
  const backT = c.hasBack
    ? materialThickness(project.catalog.materials, c.backMaterialId)
    : 0;
  const hwIn = c.width / 2 - sideT;
  const backInner = -c.depth / 2 + backT;
  const frontEdge = c.depth / 2;
  // 4 cavity corners in local coords (front edge is open; using its line as
  // the local-z bound on that side)
  const corners: Array<[number, number]> = [
    [-hwIn, backInner],
    [hwIn, backInner],
    [hwIn, frontEdge],
    [-hwIn, frontEdge],
  ];
  const rad = (c.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs = corners.map(([lx, lz]) => c.position.x + lx * cos - lz * sin);
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
}

/** Size + position a runner to span its owned cabinets.
 *  - A desk top (groupDrag) covers the cabinets: ends flush with their outer
 *    edges and the top RESTS on the cabinets (baseHeight = cabinet top).
 *  - A shelf (not groupDrag) runs INSIDE the outermost cabinets, from the
 *    leftmost cabinet's cavity −x bound to the rightmost cabinet's cavity +x
 *    bound — a long board that threads through them all. The end bounds are
 *    rotation-aware: a cabinet turned to face along the shelf direction stops
 *    the board at its back-panel inside face. The shelf's vertical position is
 *    the user's job (use "Snap to surface below"), so Span does NOT touch
 *    baseHeight.
 *  Returns {} if it owns no cabinets. */
export function fitRunnerToCarcasses(
  r: Runner,
  project: Project,
): Partial<Runner> {
  const owned = ownedCarcasses(r, project);
  if (owned.length === 0) return {};
  const avgZ = owned.reduce((s, c) => s + c.position.z, 0) / owned.length;

  let left: number;
  let right: number;
  if (r.groupDrag) {
    // desk top: cover the cabinets, flush with their outer edges
    left = Math.min(...owned.map((c) => c.position.x - c.width / 2));
    right = Math.max(...owned.map((c) => c.position.x + c.width / 2));
  } else {
    // shelf: cavity −x bound of the leftmost cabinet → cavity +x bound of the
    // rightmost cabinet (single cabinet → its own cavity x-range)
    const sorted = [...owned].sort((a, b) => a.position.x - b.position.x);
    const leftCab = sorted[0];
    const rightCab = sorted[sorted.length - 1];
    left = cavityWorldXRange(leftCab, project).minX;
    right = cavityWorldXRange(rightCab, project).maxX;
  }
  const patch: Partial<Runner> = {
    length: right - left,
    position: { x: (left + right) / 2, z: avgZ },
  };
  if (r.groupDrag) {
    patch.baseHeight = Math.max(
      ...owned.map((c) => (c.baseHeight ?? 0) + c.height),
    );
  }
  return patch;
}

export interface GroupTranslation {
  runner: Runner;
  /** new positions for owned cabinets, keyed by carcass id */
  carcassPos: Record<string, { x: number; z: number }>;
}

/** Shift the desktop and all owned cabinets by the same delta. Pure. */
export function translateGroup(
  r: Runner,
  project: Project,
  dx: number,
  dz: number,
): GroupTranslation {
  const carcassPos: Record<string, { x: number; z: number }> = {};
  for (const c of ownedCarcasses(r, project)) {
    carcassPos[c.id] = { x: c.position.x + dx, z: c.position.z + dz };
  }
  return {
    runner: {
      ...r,
      position: { x: r.position.x + dx, z: r.position.z + dz },
    },
    carcassPos,
  };
}
