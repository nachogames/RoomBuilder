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

/** Size + position a runner to span its owned cabinets, ending flush with the
 *  INNER side walls of the outermost cabinets (touches the inside), centred on
 *  them and resting on top. Returns {} if it owns no cabinets. */
export function fitRunnerToCarcasses(
  r: Runner,
  project: Project,
): Partial<Runner> {
  const owned = ownedCarcasses(r, project);
  if (owned.length === 0) return {};
  const sideT = (c: Carcass) =>
    materialThickness(project.catalog.materials, c.carcassMaterialId);
  const innerLefts = owned.map((c) => c.position.x - c.width / 2 + sideT(c));
  const innerRights = owned.map((c) => c.position.x + c.width / 2 - sideT(c));
  const left = Math.min(...innerLefts);
  const right = Math.max(...innerRights);
  const avgZ = owned.reduce((s, c) => s + c.position.z, 0) / owned.length;
  const top = Math.max(...owned.map((c) => (c.baseHeight ?? 0) + c.height));
  return {
    length: right - left,
    position: { x: (left + right) / 2, z: avgZ },
    baseHeight: top,
  };
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
