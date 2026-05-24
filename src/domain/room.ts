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

const unit = (a: Pt, b: Pt) => {
  const l = dist(a, b) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
};
const cross2 = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => a.x * b.z - a.z * b.x;

/**
 * If wall edge `i` is one of a jut's two perpendicular return walls, set
 * BOTH returns to `len` (keeping their anchor corners on the main wall) so
 * the jut stays square and symmetric. Returns new walls, or null if edge
 * `i` isn't a jut return.
 *
 * Jut corner pattern: anchorA → faceA → faceB → anchorB
 *   E_a = anchorA→faceA (return)  E_{a+1} = face   E_{a+2} = faceB→anchorB (return)
 */
export function setJutDepthSymmetric(
  walls: Pt[],
  i: number,
  len: number,
): Pt[] | null {
  const n = walls.length;
  if (n < 6 || len <= 0) return null;
  const E = (k: number) =>
    unit(walls[k % n], walls[(k + 1) % n]);
  const perp = (k: number, m: number) =>
    Math.abs(cross2(E(k), E(m))) > 0.9; // ~64°+ ⇒ treat as perpendicular
  const para = (k: number, m: number) =>
    Math.abs(cross2(E(k), E(m))) < 0.12;

  for (const a of [i, (i - 2 + n) % n]) {
    const anchorA = walls[a % n];
    const anchorB = walls[(a + 3) % n];
    // the two anchors must sit on one straight wall line (the jut's base),
    // i.e. anchorA→anchorB is parallel to the main-wall stub before it
    const onSameWall =
      dist(anchorA, anchorB) > 1e-6 &&
      Math.abs(cross2(E(a - 1 + n), unit(anchorA, anchorB))) < 0.12;
    if (
      perp(a, a + 1) &&
      perp(a + 1, a + 2) &&
      para(a, a + 2) &&
      onSameWall &&
      (a === i || (a + 2) % n === i)
    ) {
      const dA = unit(anchorA, walls[(a + 1) % n]);
      const dB = unit(anchorB, walls[(a + 2) % n]);
      const out = walls.map((p) => ({ ...p }));
      out[(a + 1) % n] = {
        x: anchorA.x + dA.x * len,
        z: anchorA.z + dA.z * len,
      };
      out[(a + 2) % n] = {
        x: anchorB.x + dB.x * len,
        z: anchorB.z + dB.z * len,
      };
      return out;
    }
  }
  return null;
}

/** True only if the whole (optionally rotated) footprint is inside the room. */
export function rectInsideRoom(
  walls: Pt[],
  cx: number,
  cz: number,
  w: number,
  d: number,
  rotDeg = 0,
): boolean {
  const a = (rotDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const hw = w / 2;
  const hd = d / 2;
  for (const [lx, lz] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]) {
    const px = cx + lx * ca - lz * sa;
    const pz = cz + lx * sa + lz * ca;
    if (!pointInRoom(walls, px, pz)) return false;
  }
  return true;
}

/** Ray-cast point-in-polygon (room interior test). */
export function pointInRoom(walls: Pt[], px: number, pz: number): boolean {
  let inside = false;
  for (let i = 0, j = walls.length - 1; i < walls.length; j = i++) {
    const a = walls[i];
    const b = walls[j];
    if (
      a.z > pz !== b.z > pz &&
      px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Reference geometry for the 3D scene: a slab per wall edge + a flat
 *  baseboard band per edge, offset inward toward the room centroid. */
export function roomReferenceSlabs(room: Room): RefSlab[] {
  const { ceilingHeight: H, wallThickness: t } = room;
  const out: RefSlab[] = [];

  wallEdges(room.walls).forEach(([a, b], i) => {
    const len = dist(a, b);
    if (len < 1e-6) return;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const ang = Math.atan2(b.z - a.z, b.x - a.x);

    // inward unit normal: pick the side that is actually inside the polygon.
    // (Centroid won't do for non-convex shapes like a notch.)
    let nx = -(b.z - a.z) / len;
    let nz = (b.x - a.x) / len;
    if (!pointInRoom(room.walls, mx + nx * 0.1, mz + nz * 0.1)) {
      nx = -nx;
      nz = -nz;
    }

    // The polygon edge is the room's INTERIOR face, so the wall sits entirely
    // OUTSIDE it: shift the slab outward (−normal) by half its thickness.
    out.push({
      id: `w${i}`,
      kind: "wall",
      center: { x: mx - nx * (t / 2), y: H / 2, z: mz - nz * (t / 2) },
      size: { x: len + t, y: H, z: t },
      rotY: -ang,
    });

    if (room.baseboard) {
      const { height: bh, thickness: bt } = room.baseboard;
      // baseboard hugs the interior face (the polygon line), just inside it
      const off = bt / 2;
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
