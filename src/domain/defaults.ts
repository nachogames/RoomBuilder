import type { Carcass, Project, RefBox, Runner, StockCatalog } from "./types";
import { evenlySpacedShelves } from "./shelves";

export const PLY_34 = "ply-0.75";
export const PLY_25 = "ply-0.25";
export const PLY_15 = "ply-1.5";
export const PINE_1x12 = "pine-1x12";
export const PINE_2x12 = "pine-2x12";
export const PINE_2x10 = "pine-2x10";
export const PINE_2x8 = "pine-2x8";
export const PINE_2x6 = "pine-2x6";

/** Quick-pick board profiles for the runner inspector. Each applies a
 *  one-shot patch to `boardMaterialId` (and `depth` for lumber, which has a
 *  fixed nominal width). Ply presets leave depth alone. */
export interface RunnerProfile {
  id: string;
  label: string;
  materialId: string;
  /** lumber profiles fix the front-to-back depth; omitted for ply */
  depth?: number;
}
export const RUNNER_PROFILES: RunnerProfile[] = [
  { id: "2x12", label: "2x12", materialId: PINE_2x12, depth: 11.25 },
  { id: "2x10", label: "2x10", materialId: PINE_2x10, depth: 9.25 },
  { id: "2x8", label: "2x8", materialId: PINE_2x8, depth: 7.25 },
  { id: "2x6", label: "2x6", materialId: PINE_2x6, depth: 5.5 },
  { id: "ply34", label: '3/4" ply', materialId: PLY_34 },
  { id: "ply15", label: '1-1/2" ply', materialId: PLY_15 },
];

export function defaultCatalog(): StockCatalog {
  return {
    kerf: 0.125,
    materials: [
      { id: PLY_34, name: '3/4" Birch Plywood', kind: "sheet", thickness: 0.75 },
      { id: PLY_25, name: '1/4" Plywood (back)', kind: "sheet", thickness: 0.25 },
      { id: PLY_15, name: '1-1/2" Plywood', kind: "sheet", thickness: 1.5 },
      { id: PINE_1x12, name: '1x12 Pine (3/4")', kind: "board", thickness: 0.75 },
      { id: PINE_2x12, name: '2x12 Pine (1-1/2")', kind: "board", thickness: 1.5 },
      { id: PINE_2x10, name: '2x10 Pine (1-1/2")', kind: "board", thickness: 1.5 },
      { id: PINE_2x8, name: '2x8 Pine (1-1/2")', kind: "board", thickness: 1.5 },
      { id: PINE_2x6, name: '2x6 Pine (1-1/2")', kind: "board", thickness: 1.5 },
    ],
    sheets: [
      { materialId: PLY_34, width: 48, length: 96 },
      { materialId: PLY_25, width: 48, length: 96 },
      { materialId: PLY_15, width: 48, length: 96 },
    ],
    boards: [
      { materialId: PINE_1x12, width: 11.25, length: 96, nominal: "1x12" },
      { materialId: PINE_2x12, width: 11.25, length: 144, nominal: "2x12" },
      { materialId: PINE_2x10, width: 9.25, length: 144, nominal: "2x10" },
      { materialId: PINE_2x8, width: 7.25, length: 144, nominal: "2x8" },
      { materialId: PINE_2x6, width: 5.5, length: 144, nominal: "2x6" },
    ],
  };
}

let seq = 0;
export function uid(prefix = "id"): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function defaultBookcase(): Carcass {
  const base: Carcass = {
    id: uid("carcass"),
    label: "Bookcase",
    width: 20.75,
    height: 72,
    depth: 11.25,
    carcassMaterialId: PLY_34,
    backMaterialId: PLY_25,
    shelfMaterialId: PLY_34,
    hasBack: true,
    toeKickHeight: 3,
    carcassJoinery: "pocket-screw",
    targetOpeningWidth: 20.75,
    shelves: [],
    position: { x: 0, z: 0 },
    rotationDeg: 0,
    baseHeight: 0,
  };
  base.shelves = evenlySpacedShelves(base, defaultCatalog(), 3, "pocket-screw");
  return base;
}

export function defaultRunner(spanned: string[]): Runner {
  return {
    id: uid("runner"),
    label: "Runner shelf",
    boardMaterialId: PINE_2x12,
    spannedCarcassIds: spanned,
    length: 60,
    depth: 11.25,
    position: { x: 0, z: 0 },
    rotationDeg: 0,
    baseHeight: 72,
    fastening: "pocket-screw",
    supports: [],
  };
}

/** Axis-aligned rectangle polygon centered on the origin (CW in x/z). */
export function rectWalls(length: number, width: number) {
  return [
    { x: -length / 2, z: -width / 2 },
    { x: length / 2, z: -width / 2 },
    { x: length / 2, z: width / 2 },
    { x: -length / 2, z: width / 2 },
  ];
}

export function defaultBumpOut(wall: "N" | "S" | "E" | "W" = "N") {
  return {
    id: uid("bump"),
    wall,
    offset: 24,
    width: 24,
    depth: 12,
    dir: "out" as const,
    label: "Bump-out",
  };
}

export function defaultRefBox(): RefBox {
  return {
    id: uid("box"),
    label: "Tote",
    width: 16,
    height: 12,
    depth: 24,
    position: { x: 0, z: 24 },
    rotationDeg: 0,
    baseHeight: 0,
  };
}

/** Desk preset: two cabinets + a tabletop runner, flagged as reference. */
export function deskAssembly(): { carcasses: Carcass[]; runner: Runner } {
  const left: Carcass = {
    ...defaultBookcase(),
    id: uid("carcass"),
    label: "Desk cabinet L",
    width: 18,
    height: 28.5,
    depth: 22,
    targetOpeningWidth: undefined,
    shelves: [],
    position: { x: -24, z: 0 },
  };
  left.shelves = evenlySpacedShelves(left, defaultCatalog(), 1, "shelf-pin");
  const right: Carcass = {
    ...left,
    id: uid("carcass"),
    label: "Desk cabinet R",
    position: { x: 24, z: 0 },
  };
  // cabinets at x ±24, width 18 → outer extent ∓33; +2" overhang each end
  const runner: Runner = {
    ...defaultRunner([left.id, right.id]),
    label: "Desk top",
    boardMaterialId: PLY_34,
    length: 70,
    depth: 24,
    position: { x: 0, z: 0 },
    baseHeight: 28.5,
    fastening: "screw-through",
  };
  return { carcasses: [left, right], runner };
}

export function defaultProject(): Project {
  return {
    schemaVersion: 1,
    name: "Untitled Room",
    units: "in",
    catalog: defaultCatalog(),
    room: {
      length: 128,
      width: 120,
      ceilingHeight: 96,
      wallThickness: 4.5,
      walls: rectWalls(128, 120),
      baseboard: { height: 3.5, thickness: 0.5 },
    },
    carcasses: [defaultBookcase()],
    runners: [],
    refBoxes: [],
  };
}

/** Upgrade a legacy (auto-derived) runner to the explicit position/length
 *  model, preserving its on-screen geometry. New-shape runners pass through. */
export function migrateRunner(
  r: Record<string, unknown>,
  carcasses: Carcass[],
): Runner {
  const hasNew =
    r.position !== undefined && typeof r.length === "number";
  if (hasNew) {
    return {
      ...(r as unknown as Runner),
      rotationDeg: (r.rotationDeg as number) ?? 0,
      baseHeight: (r.baseHeight as number) ?? 0,
    };
  }
  const spannedIds = (r.spannedCarcassIds as string[]) ?? [];
  const spanned = carcasses.filter((c) => spannedIds.includes(c.id));
  const overhang = (r.overhangEachEnd as number) ?? 0;
  const nudge = (r.nudge as { x: number; z: number }) ?? { x: 0, z: 0 };
  const bottomHeight = (r.bottomHeight as number) ?? 0;
  let worldLeft = -30;
  let worldRight = 30;
  let z = 0;
  if (spanned.length) {
    const lefts = spanned.map((c) => c.position.x - c.width / 2);
    const rights = spanned.map((c) => c.position.x + c.width / 2);
    worldLeft = Math.min(...lefts) - overhang + nudge.x;
    worldRight = Math.max(...rights) + overhang + nudge.x;
    z = spanned[0].position.z + nudge.z;
  }
  return {
    id: r.id as string,
    label: r.label as string,
    boardMaterialId: r.boardMaterialId as string,
    spannedCarcassIds: spannedIds,
    length: worldRight - worldLeft,
    depth: (r.depth as number) ?? 11.25,
    position: { x: (worldLeft + worldRight) / 2, z },
    rotationDeg: 0,
    baseHeight: bottomHeight,
    fastening: (r.fastening as Runner["fastening"]) ?? "pocket-screw",
    supports: (r.supports as Runner["supports"]) ?? [],
  };
}

/** Fill in fields that older saved projects may lack. */
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    units: p.units ?? "in",
    room: {
      ...p.room,
      wallThickness: p.room.wallThickness ?? 4.5,
      walls:
        p.room.walls && p.room.walls.length >= 3
          ? p.room.walls
          : rectWalls(p.room.length ?? 128, p.room.width ?? 120),
      baseboard:
        p.room.baseboard === undefined
          ? { height: 3.5, thickness: 0.5 }
          : p.room.baseboard,
    },
    carcasses: (p.carcasses ?? []).map((c) => ({
      ...c,
      baseHeight: c.baseHeight ?? 0,
    })),
    runners: (p.runners ?? []).map((r) =>
      migrateRunner(r as unknown as Record<string, unknown>, p.carcasses ?? []),
    ),
    refBoxes: (p.refBoxes ?? []).map((b) => ({
      ...b,
      rotationDeg: b.rotationDeg ?? 0,
      baseHeight: b.baseHeight ?? 0,
    })),
  };
}
