import type { Carcass, Runner, StockCatalog } from "../domain/types";
import type { CarcassGeometry, Part } from "./types";
import { materialThickness } from "./types";

export interface RunnerLayout {
  worldLeft: number;
  worldRight: number;
  length: number;
  z: number;
  thickness: number;
  /** x-intervals where an owned cabinet bears the runner (for sag) */
  bearingIntervals: Array<[number, number]>;
  /** absolute x of each point support */
  supportXs: number[];
}

/** Geometry of a runner from its OWN explicit position/length. Bearing
 *  intervals still come from the owned cabinets so the sag check works. */
export function runnerLayout(
  r: Runner,
  carcasses: Carcass[],
  _catalog: StockCatalog,
): RunnerLayout {
  const worldLeft = r.position.x - r.length / 2;
  const worldRight = r.position.x + r.length / 2;
  const owned = carcasses.filter((c) => r.spannedCarcassIds.includes(c.id));
  const bearingIntervals: Array<[number, number]> = owned.map((c) => [
    c.position.x - c.width / 2,
    c.position.x + c.width / 2,
  ]);
  const thickness = materialThickness(_catalog.materials, r.boardMaterialId);
  const supportXs = r.supports.map((s) => worldLeft + s.offsetFromLeft);
  return {
    worldLeft,
    worldRight,
    length: r.length,
    z: r.position.z,
    thickness,
    bearingIntervals,
    supportXs,
  };
}

export function buildRunner(
  r: Runner,
  carcasses: Carcass[],
  catalog: StockCatalog,
  options?: {
    /** Highest surface Y at world (x, z) ≤ maxY. Used to auto-size a `leg`
     *  support so it spans from the runner's underside down to whatever's
     *  directly below it (defaults to floor / 0 when omitted). */
    surfaceUnder?: (x: number, z: number, maxY: number) => number;
  },
): CarcassGeometry & { layout: RunnerLayout } {
  const L = runnerLayout(r, carcasses, catalog);
  const parts: Part[] = [];
  const joints: CarcassGeometry["joints"] = [];
  let n = 0;
  const pid = () => `${r.id}-p${++n}`;
  let j = 0;
  const jid = () => `${r.id}-j${++j}`;
  const base = r.baseHeight ?? 0;

  // Parts are runner-local: origin at the board centre, floor at local
  // y = -base. Scene wraps these in a group at [position.x, base, position.z]
  // rotated by rotationDeg.
  const boardId = pid();
  parts.push({
    id: boardId,
    carcassId: r.id,
    role: "runner",
    label: r.label,
    materialId: r.boardMaterialId,
    thickness: L.thickness,
    length: Math.max(r.length, r.depth),
    width: Math.min(r.length, r.depth),
    grainMatters: true,
    box: { x: r.length, y: L.thickness, z: r.depth },
    center: { x: 0, y: L.thickness / 2, z: 0 },
  });

  for (const c of carcasses.filter((c) =>
    r.spannedCarcassIds.includes(c.id),
  )) {
    joints.push({
      id: jid(),
      carcassId: r.id,
      method: r.fastening,
      label: `${r.label} to ${c.label}`,
      members: [
        { partId: boardId, role: "runner" },
        { partId: c.id, role: "top" },
      ],
      drilledPartId: r.fastening === "pocket-screw" ? boardId : undefined,
      edgeLength: r.depth,
    });
  }

  // supports: local x measured from the board centre, local z from centre line
  for (const s of r.supports) {
    const sx = -r.length / 2 + s.offsetFromLeft;
    const sz = s.offsetFromCenterZ ?? 0;
    if (s.kind === "bracket") {
      joints.push({
        id: jid(),
        carcassId: r.id,
        method: "bracket",
        label: `${r.label} bracket @ ${s.offsetFromLeft}"`,
        members: [{ partId: boardId, role: "runner" }],
        edgeLength: r.depth,
      });
      continue;
    }
    const sid = pid();
    let box: { x: number; y: number; z: number };
    let center: { x: number; y: number; z: number };
    if (s.kind === "leg") {
      // span from the runner's underside down to whatever's below this support
      // at its world (x, z) point — accounts for the runner's rotation AND the
      // support's own (sx, sz) offsets in the runner-local frame.
      const rad = (r.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const wx = r.position.x + sx * cos - sz * sin;
      const wz = r.position.z + sx * sin + sz * cos;
      const surfaceY = options?.surfaceUnder?.(wx, wz, base) ?? 0;
      const legH = Math.max(0, base - surfaceY);
      box = { x: 1.5, y: legH, z: 1.5 };
      // local y origin = board centre underside; leg top at 0, bottom at -legH
      center = { x: sx, y: -legH / 2, z: sz };
    } else if (s.kind === "cleat") {
      box = { x: 6, y: 1.5, z: r.depth };
      center = { x: sx, y: -0.75, z: sz };
    } else {
      box = { x: 1.5, y: 6, z: 6 };
      center = { x: sx, y: -3, z: sz };
    }
    parts.push({
      id: sid,
      carcassId: r.id,
      role: "support",
      label: `${s.kind} support`,
      materialId: r.boardMaterialId,
      thickness: s.kind === "leg" ? 1.5 : box.y,
      length: Math.max(box.x, box.y, box.z),
      width: Math.min(box.x, box.z),
      grainMatters: false,
      box,
      center,
    });
    joints.push({
      id: jid(),
      carcassId: r.id,
      method: "screw-through",
      label: `${s.kind} support to ${r.label}`,
      members: [
        { partId: sid, role: "support" },
        { partId: boardId, role: "runner" },
      ],
      edgeLength: r.depth,
    });
  }

  return { parts, joints, layout: L };
}
