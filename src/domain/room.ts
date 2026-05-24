import type { Pt, Room } from "./types";

export interface RefSlab {
  id: string;
  kind: "wall" | "baseboard";
  center: { x: number; y: number; z: number };
  /** box form (baseboards): size + rotation about Y */
  size?: { x: number; y: number; z: number };
  rotY?: number;
  /** prism form (walls): footprint quad (x/z) extruded to `height` */
  footprint?: Pt[];
  height?: number;
  /** outward (away from room) unit normal in x/z, for dollhouse culling */
  normal?: { x: number; z: number };
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);

/** Outward (away-from-interior) unit normal of each polygon edge i
 *  (walls[i] → walls[i+1]). Uses pointInRoom so it's correct for any shape. */
function edgeOutwardNormals(walls: Pt[]): Pt[] {
  const n = walls.length;
  return walls.map((a, i) => {
    const b = walls[(i + 1) % n];
    const len = dist(a, b) || 1;
    let nx = -(b.z - a.z) / len;
    let nz = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if (pointInRoom(walls, mx + nx * 0.1, mz + nz * 0.1)) {
      nx = -nx; // that side is inside → flip to outward
      nz = -nz;
    }
    return { x: nx, z: nz };
  });
}

/** Intersection of line (A1 + s·r) and (A2 + u·s2); null if parallel. */
function lineIntersect(A1: Pt, r: Pt, A2: Pt, s2: Pt): Pt | null {
  const denom = r.x * s2.z - r.z * s2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t1 = ((A2.x - A1.x) * s2.z - (A2.z - A1.z) * s2.x) / denom;
  return { x: A1.x + t1 * r.x, z: A1.z + t1 * r.z };
}

/** Offset each polygon vertex by `dist` along per-edge `normals`, mitering at
 *  corners (intersection of the two offset edges). One vertex out per vertex. */
function offsetVertices(walls: Pt[], dist: number, normals: Pt[]): Pt[] {
  const n = walls.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const eIn = (i - 1 + n) % n; // edge ending at vertex i
    const P = walls[i];
    const prev = walls[eIn];
    const next = walls[(i + 1) % n];
    const dIn = { x: P.x - prev.x, z: P.z - prev.z };
    const dOut = { x: next.x - P.x, z: next.z - P.z };
    const A1 = { x: P.x + normals[eIn].x * dist, z: P.z + normals[eIn].z * dist };
    const A2 = { x: P.x + normals[i].x * dist, z: P.z + normals[i].z * dist };
    out.push(lineIntersect(A1, dIn, A2, dOut) ?? A2);
  }
  return out;
}

/** The interior wall polygon offset OUTWARD by `t`, with mitered corners. */
export function outerWallVertices(walls: Pt[], t: number): Pt[] {
  return offsetVertices(walls, t, edgeOutwardNormals(walls));
}

/** The interior polygon offset INWARD by `d` (for the baseboard band). */
export function innerOffsetVertices(walls: Pt[], d: number): Pt[] {
  const inward = edgeOutwardNormals(walls).map((o) => ({ x: -o.x, z: -o.z }));
  return offsetVertices(walls, d, inward);
}

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
  const walls = room.walls;
  const n = walls.length;
  const outward = edgeOutwardNormals(walls);
  // outer wall boundary: interior polygon mitered outward by the wall thickness
  const outer = outerWallVertices(walls, t);
  // baseboard band: interior polygon mitered inward by its thickness
  const bbInner = room.baseboard
    ? innerOffsetVertices(walls, room.baseboard.thickness)
    : null;

  const quadCenter = (q: Pt[], y: number) => ({
    x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
    y,
    z: (q[0].z + q[1].z + q[2].z + q[3].z) / 4,
  });

  walls.forEach((a, i) => {
    const b = walls[(i + 1) % n];
    const len = dist(a, b);
    if (len < 1e-6) return;
    const j = (i + 1) % n;

    // Wall = quad between the interior edge (a→b) and the mitered outer edge.
    // No length padding, so corners meet cleanly with no overhang/overlap.
    const fp: Pt[] = [a, b, outer[j], outer[i]];
    out.push({
      id: `w${i}`,
      kind: "wall",
      center: quadCenter(fp, H / 2),
      footprint: fp,
      height: H,
      normal: outward[i],
    });

    if (room.baseboard && bbInner) {
      const { height: bh } = room.baseboard;
      // baseboard = quad between the interior edge and the inward-mitered edge
      const bfp: Pt[] = [a, b, bbInner[j], bbInner[i]];
      out.push({
        id: `bb${i}`,
        kind: "baseboard",
        center: quadCenter(bfp, bh / 2),
        footprint: bfp,
        height: bh,
        normal: outward[i],
      });
    }
  });
  return out;
}
