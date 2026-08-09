import type { Pt } from "../domain/types";

/** A measurement target: a segment, or a point as a degenerate segment
 *  (a === b). Wall edges, item edges and corners all reduce to this. */
export interface Seg {
  a: Pt;
  b: Pt;
}

export interface Measurement {
  /** shortest distance between the two targets */
  dist: number;
  /** unit vector pointing from the A-side anchor toward the B-side anchor —
   *  the direction to translate B's owner to change the distance */
  axis: Pt;
  /** closest point on A / on B (the measurement line endpoints) */
  pa: Pt;
  pb: Pt;
}

const dot = (ax: number, az: number, bx: number, bz: number) =>
  ax * bx + az * bz;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Closest pair of points between two segments (Ericson, RTCD §5.1.9),
 *  then distance + move axis. Degenerate segments (points) are fine. */
export function measureBetween(A: Seg, B: Seg): Measurement {
  const d1x = A.b.x - A.a.x;
  const d1z = A.b.z - A.a.z;
  const d2x = B.b.x - B.a.x;
  const d2z = B.b.z - B.a.z;
  const rx = A.a.x - B.a.x;
  const rz = A.a.z - B.a.z;
  const a = dot(d1x, d1z, d1x, d1z);
  const e = dot(d2x, d2z, d2x, d2z);
  const f = dot(d2x, d2z, rx, rz);
  const EPS = 1e-12;

  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1x, d1z, rx, rz);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1x, d1z, d2x, d2z);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  const pa: Pt = { x: A.a.x + d1x * s, z: A.a.z + d1z * s };
  const pb: Pt = { x: B.a.x + d2x * t, z: B.a.z + d2z * t };
  const dx = pb.x - pa.x;
  const dz = pb.z - pa.z;
  const dist = Math.hypot(dx, dz);

  let axis: Pt;
  if (dist > 1e-9) {
    axis = { x: dx / dist, z: dz / dist };
  } else {
    // touching targets: fall back to a perpendicular of whichever is a real
    // segment so typing a value still pushes B somewhere sensible
    const len1 = Math.hypot(d1x, d1z);
    const len2 = Math.hypot(d2x, d2z);
    if (len1 > 1e-9) axis = { x: -d1z / len1, z: d1x / len1 };
    else if (len2 > 1e-9) axis = { x: -d2z / len2, z: d2x / len2 };
    else axis = { x: 1, z: 0 };
  }
  return { dist, axis, pa, pb };
}
