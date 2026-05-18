import type { Carcass, Project, RefBox, Runner, StockCatalog } from "./types";

export const PLY_34 = "ply-0.75";
export const PLY_25 = "ply-0.25";
export const PINE_1x12 = "pine-1x12";
export const PINE_2x12 = "pine-2x12";

export function defaultCatalog(): StockCatalog {
  return {
    kerf: 0.125,
    materials: [
      { id: PLY_34, name: '3/4" Birch Plywood', kind: "sheet", thickness: 0.75 },
      { id: PLY_25, name: '1/4" Plywood (back)', kind: "sheet", thickness: 0.25 },
      { id: PINE_1x12, name: '1x12 Pine (3/4")', kind: "board", thickness: 0.75 },
      { id: PINE_2x12, name: '2x12 Pine (1-1/2")', kind: "board", thickness: 1.5 },
    ],
    sheets: [
      { materialId: PLY_34, width: 48, length: 96 },
      { materialId: PLY_25, width: 48, length: 96 },
    ],
    boards: [
      { materialId: PINE_1x12, width: 11.25, length: 96, nominal: "1x12" },
      { materialId: PINE_2x12, width: 11.25, length: 144, nominal: "2x12" },
    ],
  };
}

let seq = 0;
export function uid(prefix = "id"): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function defaultBookcase(): Carcass {
  return {
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
    shelves: [
      { offsetFromBottom: 12, attachment: "pocket-screw" },
      { offsetFromBottom: 26, attachment: "pocket-screw" },
      { offsetFromBottom: 40, attachment: "pocket-screw" },
    ],
    position: { x: 0, z: 0 },
    rotationDeg: 0,
  };
}

export function defaultRunner(spanned: string[]): Runner {
  return {
    id: uid("runner"),
    label: "Runner shelf",
    boardMaterialId: PINE_2x12,
    spannedCarcassIds: spanned,
    bottomHeight: 72,
    depth: 11.25,
    overhangEachEnd: 1,
    fastening: "pocket-screw",
    supports: [],
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
    shelves: [{ offsetFromBottom: 12, attachment: "shelf-pin" }],
    position: { x: -24, z: 0 },
  };
  const right: Carcass = {
    ...left,
    id: uid("carcass"),
    label: "Desk cabinet R",
    position: { x: 24, z: 0 },
    shelves: [{ offsetFromBottom: 12, attachment: "shelf-pin" }],
  };
  const runner: Runner = {
    ...defaultRunner([left.id, right.id]),
    label: "Desk top",
    boardMaterialId: PLY_34,
    bottomHeight: 28.5,
    depth: 24,
    overhangEachEnd: 2,
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
    room: { length: 128, width: 120, ceilingHeight: 96 },
    carcasses: [defaultBookcase()],
    runners: [],
    refBoxes: [],
  };
}

/** Fill in fields that older saved projects may lack. */
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    units: p.units ?? "in",
    runners: p.runners ?? [],
    refBoxes: p.refBoxes ?? [],
  };
}
