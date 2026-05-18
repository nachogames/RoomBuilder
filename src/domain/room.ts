import type { Pt, Room } from "./types";

export interface RefSlab {
  id: string;
  kind: "wall" | "baseboard";
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  /** rotation about the Y (up) axis, radians */
  rotY: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);

/** Closed-polygon edges as [from, to] pairs. */
export function wallEdges(walls: Pt[]): Array<[Pt, Pt]> {
  return walls.map((p, i) => [p, walls[(i + 1) % walls.length]]);
}

export function polygonPerimeterInches(walls: Pt[]): number {
  return wallEdges(walls).reduce((s, [a, b]) => s + dist(a, b), 0);
}

/** Baseboard run = wall perimeter. Reference only — never in the cut list. */
export function baseboardLengthInches(room: Room): number {
  return polygonPerimeterInches(room.walls);
}

export function centroid(walls: Pt[]): Pt {
  const n = walls.length;
  return {
    x: walls.reduce((s, p) => s + p.x, 0) / n,
    z: walls.reduce((s, p) => s + p.z, 0) / n,
  };
}

/**
 * Move corner `i+1` along the current edge direction so edge `i` becomes
 * `newLen` long, keeping corner `i` fixed. Pure.
 */
export function setWallLength(
  walls: Pt[],
  edgeIndex: number,
  newLen: number,
): Pt[] {
  const a = walls[edgeIndex];
  const b = walls[(edgeIndex + 1) % walls.length];
  const len = dist(a, b) || 1;
  const ux = (b.x - a.x) / len;
  const uz = (b.z - a.z) / len;
  const moved = { x: a.x + ux * newLen, z: a.z + uz * newLen };
  return walls.map((p, idx) =>
    idx === (edgeIndex + 1) % walls.length ? moved : p,
  );
}

/**
 * Insert a perfectly square (90°) rectangular jut into wall `edgeIndex`.
 * `offA`/`offB` are distances from the edge's START corner along the wall;
 * `depth` is how far the jut face sits off the wall. `dir` "out" pushes away
 * from the room centroid, "in" carves a recess. Pure.
 *
 * Resulting corners along the edge A→B:
 *   A → P1 → Q1 → Q2 → P2 → B
 * with P1/P2 on the original wall and Q1/Q2 the offset jut face, so every
 * new corner is exactly 90°.
 */
export function addJut(
  walls: Pt[],
  edgeIndex: number,
  offA: number,
  offB: number,
  depth: number,
  dir: "out" | "in",
): Pt[] {
  const a = walls[edgeIndex];
  const b = walls[(edgeIndex + 1) % walls.length];
  const len = dist(a, b);
  if (len < 1e-6 || depth <= 0) return walls;
  const lo = Math.max(0, Math.min(offA, offB));
  const hi = Math.min(len, Math.max(offA, offB));
  if (hi - lo < 1e-6) return walls;

  const ux = (b.x - a.x) / len;
  const uz = (b.z - a.z) / len;
  // wall normal; flip so "out" points away from the room centroid
  let nx = -uz;
  let nz = ux;
  const c = centroid(walls);
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const towardCentroid = (c.x - mx) * nx + (c.z - mz) * nz > 0;
  const outward = towardCentroid ? -1 : 1;
  const s = (dir === "out" ? outward : -outward) * depth;

  const P1 = { x: a.x + ux * lo, z: a.z + uz * lo };
  const P2 = { x: a.x + ux * hi, z: a.z + uz * hi };
  const Q1 = { x: P1.x + nx * s, z: P1.z + nz * s };
  const Q2 = { x: P2.x + nx * s, z: P2.z + nz * s };

  const out = [...walls];
  out.splice(edgeIndex + 1, 0, P1, Q1, Q2, P2);
  return out;
}

/** Reference geometry for the 3D scene: a slab per wall edge + a flat
 *  baseboard band per edge, offset inward toward the room centroid. */
export function roomReferenceSlabs(room: Room): RefSlab[] {
  const { ceilingHeight: H, wallThickness: t } = room;
  const c = centroid(room.walls);
  const out: RefSlab[] = [];

  wallEdges(room.walls).forEach(([a, b], i) => {
    const len = dist(a, b);
    if (len < 1e-6) return;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const ang = Math.atan2(b.z - a.z, b.x - a.x);
    out.push({
      id: `w${i}`,
      kind: "wall",
      center: { x: mx, y: H / 2, z: mz },
      size: { x: len + t, y: H, z: t },
      rotY: -ang,
    });

    if (room.baseboard) {
      const { height: bh, thickness: bt } = room.baseboard;
      // inward unit normal (toward centroid)
      let nx = -(b.z - a.z) / len;
      let nz = (b.x - a.x) / len;
      if ((c.x - mx) * nx + (c.z - mz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const off = t / 2 + bt / 2;
      out.push({
        id: `bb${i}`,
        kind: "baseboard",
        center: { x: mx + nx * off, y: bh / 2, z: mz + nz * off },
        size: { x: len, y: bh, z: bt },
        rotY: -ang,
      });
    }
  });
  return out;
}
