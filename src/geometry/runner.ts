import type { Carcass, Runner, StockCatalog } from "../domain/types";
import type { CarcassGeometry, Part } from "./types";
import { materialThickness } from "./types";

export interface RunnerLayout {
  worldLeft: number;
  worldRight: number;
  length: number;
  z: number;
  thickness: number;
  /** x-intervals where a spanned carcass bears the runner */
  bearingIntervals: Array<[number, number]>;
  /** absolute x of each point support */
  supportXs: number[];
}

export function runnerLayout(
  r: Runner,
  carcasses: Carcass[],
  catalog: StockCatalog,
): RunnerLayout {
  const spanned = carcasses.filter((c) =>
    r.spannedCarcassIds.includes(c.id),
  );
  const intervals: Array<[number, number]> = spanned.map((c) => [
    c.position.x - c.width / 2,
    c.position.x + c.width / 2,
  ]);
  const minLeft = Math.min(...intervals.map((i) => i[0]));
  const maxRight = Math.max(...intervals.map((i) => i[1]));
  const worldLeft = minLeft - r.overhangEachEnd;
  const worldRight = maxRight + r.overhangEachEnd;
  const z = spanned[0]?.position.z ?? 0;
  const thickness = materialThickness(catalog.materials, r.boardMaterialId);
  const supportXs = r.supports.map((s) => worldLeft + s.offsetFromLeft);
  return {
    worldLeft,
    worldRight,
    length: worldRight - worldLeft,
    z,
    thickness,
    bearingIntervals: intervals,
    supportXs,
  };
}

export function buildRunner(
  r: Runner,
  carcasses: Carcass[],
  catalog: StockCatalog,
): CarcassGeometry & { layout: RunnerLayout } {
  const L = runnerLayout(r, carcasses, catalog);
  const parts: Part[] = [];
  const joints: CarcassGeometry["joints"] = [];
  let n = 0;
  const pid = () => `${r.id}-p${++n}`;
  let j = 0;
  const jid = () => `${r.id}-j${++j}`;

  const cx = (L.worldLeft + L.worldRight) / 2;
  const boardId = pid();
  parts.push({
    id: boardId,
    carcassId: r.id,
    role: "runner",
    label: r.label,
    materialId: r.boardMaterialId,
    thickness: L.thickness,
    length: Math.max(L.length, r.depth),
    width: Math.min(L.length, r.depth),
    grainMatters: true,
    box: { x: L.length, y: L.thickness, z: r.depth },
    center: { x: cx, y: r.bottomHeight + L.thickness / 2, z: L.z },
    world: true,
  });

  // fasten the runner to each spanned carcass
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

  // supports
  for (const s of r.supports) {
    const sx = L.worldLeft + s.offsetFromLeft;
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
      box = { x: 1.5, y: r.bottomHeight, z: 1.5 };
      center = { x: sx, y: r.bottomHeight / 2, z: L.z };
    } else if (s.kind === "cleat") {
      box = { x: 6, y: 1.5, z: r.depth };
      center = { x: sx, y: r.bottomHeight - 0.75, z: L.z };
    } else {
      // corbel: triangular-ish bracket, approximated as a wedge box
      box = { x: 1.5, y: 6, z: 6 };
      center = { x: sx, y: r.bottomHeight - 3, z: L.z };
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
      world: true,
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
