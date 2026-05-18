import type { Room, BumpOut } from "./types";

export interface RefSlab {
  id: string;
  kind: "wall" | "bump" | "baseboard";
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

/** Interior baseboard run, including the two return walls of each bump-out.
 *  Reference only — never enters the cut list. Returns inches. */
export function baseboardLengthInches(room: Room): number {
  const base = 2 * (room.length + room.width);
  const jogs = room.bumpOuts.reduce((s, b) => s + 2 * b.depth, 0);
  return base + jogs;
}

/** Plan-view rectangle (in room coords) for a bump-out's jut volume. */
export function bumpPlanRect(room: Room, b: BumpOut) {
  const { length: L, width: W } = room;
  const sign = b.dir === "out" ? 1 : -1;
  if (b.wall === "S" || b.wall === "N") {
    const x = -L / 2 + b.offset;
    const zEdge = b.wall === "S" ? -W / 2 : W / 2;
    const outward = b.wall === "S" ? -1 : 1;
    const zStart = zEdge;
    const zEnd = zEdge + outward * sign * b.depth;
    return {
      x,
      z: Math.min(zStart, zEnd),
      w: b.width,
      d: Math.abs(zEnd - zStart),
    };
  }
  const z = -W / 2 + b.offset;
  const xEdge = b.wall === "W" ? -L / 2 : L / 2;
  const outward = b.wall === "W" ? -1 : 1;
  const xStart = xEdge;
  const xEnd = xEdge + outward * sign * b.depth;
  return {
    x: Math.min(xStart, xEnd),
    z,
    w: Math.abs(xEnd - xStart),
    d: b.width,
  };
}

/** Reference geometry for the 3D scene: 4 walls, bump-out volumes, and a
 *  flat baseboard band on each wall. */
export function roomReferenceSlabs(room: Room): RefSlab[] {
  const { length: L, width: W, ceilingHeight: H, wallThickness: t } = room;
  const out: RefSlab[] = [];
  const wall = (
    id: string,
    cx: number,
    cz: number,
    sx: number,
    sz: number,
  ) =>
    out.push({
      id,
      kind: "wall",
      center: { x: cx, y: H / 2, z: cz },
      size: { x: sx, y: H, z: sz },
    });
  wall("wS", 0, -W / 2 - t / 2, L + 2 * t, t);
  wall("wN", 0, W / 2 + t / 2, L + 2 * t, t);
  wall("wW", -L / 2 - t / 2, 0, t, W + 2 * t);
  wall("wE", L / 2 + t / 2, 0, t, W + 2 * t);

  for (const b of room.bumpOuts) {
    const r = bumpPlanRect(room, b);
    out.push({
      id: b.id,
      kind: "bump",
      center: { x: r.x + r.w / 2, y: H / 2, z: r.z + r.d / 2 },
      size: { x: r.w, y: H, z: r.d },
    });
  }

  if (room.baseboard) {
    const { height: bh, thickness: bt } = room.baseboard;
    const bb = (id: string, cx: number, cz: number, sx: number, sz: number) =>
      out.push({
        id,
        kind: "baseboard",
        center: { x: cx, y: bh / 2, z: cz },
        size: { x: sx, y: bh, z: sz },
      });
    bb("bbS", 0, -W / 2 + bt / 2, L, bt);
    bb("bbN", 0, W / 2 - bt / 2, L, bt);
    bb("bbW", -L / 2 + bt / 2, 0, bt, W);
    bb("bbE", L / 2 - bt / 2, 0, bt, W);
  }
  return out;
}
