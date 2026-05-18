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
