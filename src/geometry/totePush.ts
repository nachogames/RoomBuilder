import type { Project, RefBox } from "../domain/types";
import { rectAABB, type AABB } from "./group";
import { collisionWalls, rectInsideRoom } from "../domain/room";
import { findContainer, clampToInterior } from "./container";
import { materialThickness } from "./types";

const EPS = 1e-4;
const BISECT_TOL = 1 / 64; // 1/64" — below visible
const BISECT_MAX_ITER = 18;

/** The footprint used for collision: the outer (largest) extent in each axis,
 *  matching how the drag code already sizes a tote against walls/containers. */
function outerWD(b: RefBox): { w: number; d: number } {
  return {
    w: Math.max(b.width, b.topWidth ?? b.width),
    d: Math.max(b.depth, b.topDepth ?? b.depth),
  };
}

/** Vertical [lo, hi] occupied by a tote. */
function yRange(b: RefBox): [number, number] {
  const lo = b.baseHeight ?? 0;
  return [lo, lo + b.height];
}

/** True if the two y-intervals overlap (a tote on a shelf above the floor
 *  doesn't collide in plan with a tote on the floor below it). */
function yOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] - EPS && a[1] > b[0] + EPS;
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX - EPS &&
    a.maxX > b.minX + EPS &&
    a.minZ < b.maxZ - EPS &&
    a.maxZ > b.minZ + EPS
  );
}

/** Push distance along unit vector (ux,uz) needed to move B out of A's AABB. */
function pushDistance(a: AABB, b: AABB, ux: number, uz: number): number {
  let dx = 0;
  if (ux > EPS) dx = (a.maxX - b.minX) / ux;
  else if (ux < -EPS) dx = (b.maxX - a.minX) / -ux;
  let dz = 0;
  if (uz > EPS) dz = (a.maxZ - b.minZ) / uz;
  else if (uz < -EPS) dz = (b.maxZ - a.minZ) / -uz;
  return Math.max(dx, dz);
}

interface Candidate {
  pos: { x: number; z: number };
  aabb: AABB;
}

interface Obstacle {
  /** Carcass id when kind=carcass (for container-exemption); empty for runners. */
  carcassId: string;
  aabb: AABB;
  yLo: number;
  yHi: number;
}

/** Carcasses + runners as solid 3D obstacles a tote can't pass through. */
function buildObstacles(project: Project): Obstacle[] {
  const out: Obstacle[] = [];
  for (const c of project.carcasses) {
    const yLo = c.baseHeight ?? 0;
    out.push({
      carcassId: c.id,
      aabb: rectAABB(c.position.x, c.position.z, c.width, c.depth, c.rotationDeg),
      yLo,
      yHi: yLo + c.height,
    });
  }
  for (const r of project.runners) {
    const yLo = r.baseHeight ?? 0;
    const t = materialThickness(project.catalog.materials, r.boardMaterialId);
    out.push({
      carcassId: "",
      aabb: rectAABB(r.position.x, r.position.z, r.length, r.depth, r.rotationDeg),
      yLo,
      yHi: yLo + t,
    });
  }
  return out;
}

/** True if the tote's footprint AABB + Y range conflicts with any obstacle.
 *  Exempts the single carcass that captures the tote (handled via clamp). */
function hitsObstacle(
  b: RefBox,
  pos: { x: number; z: number },
  toteAabb: AABB,
  toteY: [number, number],
  prevPos: { x: number; z: number },
  obstacles: Obstacle[],
  project: Project,
): boolean {
  // The tote may be validly captured by one carcass — that's the one whose
  // interior is enforcing the clamp, not blocking the tote.
  const { w, d } = outerWD(b);
  const captor = findContainer(
    { id: b.id, w, d, cx: pos.x, cz: pos.z, rotationDeg: b.rotationDeg, prevPos },
    project,
  );
  for (const o of obstacles) {
    if (o.carcassId && o.carcassId === captor?.id) continue;
    if (!yOverlap(toteY, [o.yLo, o.yHi])) continue;
    if (aabbOverlap(toteAabb, o.aabb)) return true;
  }
  return false;
}

function validatePos(
  b: RefBox,
  pos: { x: number; z: number },
  prev: { x: number; z: number },
  toteAabb: AABB,
  toteY: [number, number],
  obstacles: Obstacle[],
  project: Project,
): boolean {
  const { w, d } = outerWD(b);
  if (
    !rectInsideRoom(
      collisionWalls(project.room, b.baseHeight ?? 0),
      pos.x,
      pos.z,
      w,
      d,
      b.rotationDeg,
    )
  )
    return false;
  const container = findContainer(
    { id: b.id, w, d, cx: pos.x, cz: pos.z, rotationDeg: b.rotationDeg, prevPos: prev },
    project,
  );
  if (container) {
    const clamped = clampToInterior(container, w, d, pos.x, pos.z, project, b.rotationDeg);
    if (Math.abs(clamped.x - pos.x) > EPS || Math.abs(clamped.z - pos.z) > EPS)
      return false;
  }
  if (hitsObstacle(b, pos, toteAabb, toteY, prev, obstacles, project)) return false;
  return true;
}

function buildCandidate(b: RefBox, pos: { x: number; z: number }): Candidate {
  const { w, d } = outerWD(b);
  return { pos, aabb: rectAABB(pos.x, pos.z, w, d, b.rotationDeg) };
}

export interface PushResult {
  ok: boolean;
  /** New positions, keyed by tote id (includes mover and pushed totes). */
  updates: Record<string, { x: number; z: number }>;
  /** Final mover position after partial-push clamping (may be short of target). */
  moverPos?: { x: number; z: number };
}

interface CascadeResult {
  ok: boolean;
  proposed: Record<string, Candidate>;
}

/** Run the cascade with the mover offset by `s` along (ux,uz) from its
 *  starting position. Each pushed tote must satisfy room+container; if not,
 *  the cascade fails. Mover is assumed pre-clamped by the caller, so its own
 *  validity is not re-checked here. */
function runCascade(
  project: Project,
  totes: RefBox[],
  byId: Record<string, RefBox>,
  moverId: string,
  start: Record<string, { x: number; z: number }>,
  yRanges: Record<string, [number, number]>,
  obstacles: Obstacle[],
  ux: number,
  uz: number,
  s: number,
): CascadeResult {
  const proposed: Record<string, Candidate> = {};
  for (const b of totes) {
    const pos =
      b.id === moverId
        ? { x: start[b.id].x + ux * s, z: start[b.id].z + uz * s }
        : { x: start[b.id].x, z: start[b.id].z };
    proposed[b.id] = buildCandidate(b, pos);
  }

  // The mover itself must clear obstacles at the proposed s. (Walls and the
  // mover's own container are pre-clamped by the caller, so we only test
  // obstacles here.)
  const moverBox = byId[moverId];
  const moverPos = proposed[moverId].pos;
  if (
    hitsObstacle(
      moverBox,
      moverPos,
      proposed[moverId].aabb,
      yRanges[moverId],
      start[moverId],
      obstacles,
      project,
    )
  ) {
    return { ok: false, proposed };
  }

  // Only totes "in the chain" — directly or transitively pushed by the mover —
  // are allowed to push others. This prevents pre-existing overlaps among
  // stationary totes from being "resolved" mid-drag (which would teleport them
  // across the room along the drag axis).
  const displaced = new Set<string>([moverId]);

  const MAX_ITER = totes.length * totes.length + 8;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let movedAny = false;
    for (const a of totes) {
      if (!displaced.has(a.id)) continue;
      const ca = proposed[a.id];
      for (const b of totes) {
        if (b.id === a.id) continue;
        // Collision is 3D: skip pairs whose vertical ranges don't overlap (a
        // tote on a shelf above another doesn't push it in plan).
        if (!yOverlap(yRanges[a.id], yRanges[b.id])) continue;
        const cb = proposed[b.id];
        if (!aabbOverlap(ca.aabb, cb.aabb)) continue;
        const push = pushDistance(ca.aabb, cb.aabb, ux, uz);
        if (push <= EPS) continue;
        const newPos = { x: cb.pos.x + ux * push, z: cb.pos.z + uz * push };
        const newCand = buildCandidate(b, newPos);
        if (!validatePos(b, newPos, start[b.id], newCand.aabb, yRanges[b.id], obstacles, project))
          return { ok: false, proposed };
        proposed[b.id] = newCand;
        displaced.add(b.id);
        movedAny = true;
      }
    }
    if (!movedAny) break;
    if (iter === MAX_ITER - 1) return { ok: false, proposed };
  }

  // Final sanity pass: only check pairs that involve a displaced tote. We
  // tolerate pre-existing overlaps among untouched totes (the cascade is not
  // a generic collision-resolver, only a drag-driven pusher).
  for (let i = 0; i < totes.length; i++) {
    for (let j = i + 1; j < totes.length; j++) {
      const a = totes[i], b = totes[j];
      if (!displaced.has(a.id) && !displaced.has(b.id)) continue;
      if (!yOverlap(yRanges[a.id], yRanges[b.id])) continue;
      if (aabbOverlap(proposed[a.id].aabb, proposed[b.id].aabb))
        return { ok: false, proposed };
    }
  }
  return { ok: true, proposed };
}

/** Try to move tote `moverId` from its current position toward (tx,tz),
 *  cascade-pushing any other totes that get in the way along the same drag
 *  vector. When the chain hits a wall/container limit, returns a *partial*
 *  push — the mover stops at the maximum scalar offset for which the chain
 *  fits. Returns ok:false only when even s=0 fails (which shouldn't happen
 *  since totes start in valid positions).
 *
 *  Mover is *not* re-validated here — callers should have clamped tx/tz to
 *  walls/container. */
export function attemptToteMove(
  project: Project,
  moverId: string,
  tx: number,
  tz: number,
): PushResult {
  const mover = project.refBoxes.find((k) => k.id === moverId);
  if (!mover) return { ok: false, updates: {} };

  const totes = project.refBoxes;
  const byId: Record<string, RefBox> = {};
  const start: Record<string, { x: number; z: number }> = {};
  const yRanges: Record<string, [number, number]> = {};
  for (const b of totes) {
    byId[b.id] = b;
    start[b.id] = { x: b.position.x, z: b.position.z };
    yRanges[b.id] = yRange(b);
  }
  const obstacles = buildObstacles(project);

  const dx = tx - mover.position.x;
  const dz = tz - mover.position.z;
  const len = Math.hypot(dx, dz);
  if (len < EPS) return { ok: true, updates: {}, moverPos: start[moverId] };
  const ux = dx / len;
  const uz = dz / len;

  // Fast path: try the full move first.
  const full = runCascade(project, totes, byId, moverId, start, yRanges, obstacles, ux, uz, len);
  let chosen: CascadeResult;
  let sChosen: number;
  if (full.ok) {
    chosen = full;
    sChosen = len;
  } else {
    // Bisect for the largest s ∈ [0, len] where the cascade succeeds. s=0
    // is always feasible (no movement). Stop when the window is below 1/64".
    let lo = 0;
    let hi = len;
    let best: CascadeResult | null = null;
    for (let i = 0; i < BISECT_MAX_ITER && hi - lo > BISECT_TOL; i++) {
      const mid = (lo + hi) / 2;
      const r = runCascade(project, totes, byId, moverId, start, yRanges, obstacles, ux, uz, mid);
      if (r.ok) {
        lo = mid;
        best = r;
      } else {
        hi = mid;
      }
    }
    if (!best) return { ok: false, updates: {} };
    chosen = best;
    sChosen = lo;
  }

  const updates: Record<string, { x: number; z: number }> = {};
  for (const b of totes) {
    const cur = start[b.id];
    const next = chosen.proposed[b.id].pos;
    if (Math.abs(next.x - cur.x) > EPS || Math.abs(next.z - cur.z) > EPS) {
      updates[b.id] = next;
    }
  }
  const moverPos = {
    x: start[moverId].x + ux * sChosen,
    z: start[moverId].z + uz * sChosen,
  };
  return { ok: true, updates, moverPos };
}
