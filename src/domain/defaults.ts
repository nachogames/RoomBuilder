import type { Carcass, Person, Project, RefBox, Runner, StockCatalog } from "./types";
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
    grainMatters: true,
    trimAllowance: 0,
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
/** Collision-proof id. The random suffix matters because the counter resets on
 *  page reload / HMR while ids persist in saved projects — a bare counter would
 *  replay low numbers and collide with existing ids. */
export function uid(prefix = "id"): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}-${seq}`;
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
    groupDrag: false,
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

export function defaultPerson(): Person {
  return {
    id: uid("person"),
    label: "Person",
    position: { x: 0, z: 0 },
    rotationDeg: 0,
    baseHeight: 0,
    pose: "standing",
    height: 70, // 5'10"
  };
}

export function defaultRefBox(): RefBox {
  // Tapered storage tote (bigger at the top than the bottom), matching the
  // "My Room" reference tote so + Tote drops in something representative.
  return {
    id: uid("box"),
    label: "Tote",
    width: 13,
    height: 16.5,
    depth: 19,
    topWidth: 16.25,
    topDepth: 22.25,
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
    groupDrag: true,
    length: 70,
    depth: 24,
    position: { x: 0, z: 0 },
    baseHeight: 28.5,
    fastening: "screw-through",
  };
  return { carcasses: [left, right], runner };
}

/** The user's actual room: 8-corner room with a notch, a left-aligned desk
 *  (2 cabinets + 1-1/2" ply top) along the back wall, and one tapered tote. */
export function myRoom(): Project {
  const cat = defaultCatalog();
  const cabW = 14.125;
  const cabD = 24;
  const cabH = 27.25; // 28.75 overall − 1.5 top
  const deskLen = 98.25;
  const deskDepth = 26.25;
  const deskBase = 27.25; // underside; top surface 28.75 with 1.5" ply
  const gap = (deskLen - 2 * cabW) / 3; // equal spacing under the top
  // desktop spans z 0..deskDepth; cab front inset 1.75" → centre at:
  const cabCenterZ = deskDepth - 1.75 - cabD / 2;

  const makeCab = (label: string, cx: number): Carcass => {
    const base: Carcass = {
      ...defaultBookcase(),
      id: uid("carcass"),
      label,
      width: cabW,
      height: cabH,
      depth: cabD,
      toeKickHeight: 3,
      targetOpeningWidth: undefined,
      shelves: [],
      position: { x: cx, z: cabCenterZ },
      rotationDeg: 0,
      baseHeight: 0,
    };
    base.shelves = evenlySpacedShelves(base, cat, 1, "shelf-pin");
    return base;
  };

  const left = makeCab("Desk cabinet L", gap + cabW / 2);
  const right = makeCab("Desk cabinet R", gap + cabW + gap + cabW / 2);

  const desktop: Runner = {
    ...defaultRunner([left.id, right.id]),
    label: "Desk top",
    boardMaterialId: PLY_15,
    groupDrag: true,
    length: deskLen,
    depth: deskDepth,
    position: { x: deskLen / 2, z: deskDepth / 2 },
    baseHeight: deskBase,
    fastening: "screw-through",
  };

  const tote: RefBox = {
    ...defaultRefBox(),
    id: uid("box"),
    label: "Tote",
    width: 13,
    height: 16.5,
    depth: 19,
    topWidth: 16.25,
    topDepth: 22.25,
    position: { x: 60, z: 70 },
    rotationDeg: 0,
    baseHeight: 0,
  };

  return {
    schemaVersion: 1,
    name: "My Room",
    units: "in",
    catalog: cat,
    room: {
      length: 128.5,
      width: 106,
      ceilingHeight: 96,
      wallThickness: 4.5,
      walls: [
        { x: 0, z: 0 },
        { x: 128.5, z: 0 },
        { x: 128.5, z: 20.75 },
        { x: 114.5, z: 20.75 },
        { x: 114.5, z: 33.75 },
        { x: 126, z: 33.75 },
        { x: 126, z: 106 },
        { x: 0, z: 106 },
      ],
      baseboard: { height: 5.125, thickness: 0.5 },
    },
    carcasses: [left, right],
    runners: [desktop],
    refBoxes: [tote],
    people: [],
  };
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
      baseboard: { height: 5.125, thickness: 0.5 },
    },
    carcasses: [defaultBookcase()],
    runners: [],
    refBoxes: [],
    people: [],
  };
}

/** Coerce a value to a finite number, returning a fallback for anything else
 *  (undefined, null, NaN, ±Infinity, non-numeric). JSON.stringify writes NaN
 *  as null, so corrupt saves round-trip as null — handle both. */
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Sanitize a {x,z} position; missing/null/NaN axes default to 0. */
function pos(p: unknown): { x: number; z: number } {
  const o = (p ?? {}) as { x?: unknown; z?: unknown };
  return { x: num(o.x, 0), z: num(o.z, 0) };
}

/** Upgrade a legacy (auto-derived) runner to the explicit position/length
 *  model, preserving its on-screen geometry. New-shape runners pass through. */
export function migrateRunner(
  r: Record<string, unknown>,
  carcasses: Carcass[],
): Runner {
  // legacy desktops had no flag; assume "Desk top" carries its cabinets
  const groupDrag =
    (r.groupDrag as boolean | undefined) ??
    /desk\s*top/i.test(String(r.label ?? ""));
  const hasNew =
    r.position !== undefined && typeof r.length === "number" && Number.isFinite(r.length as number);
  if (hasNew) {
    const sup = ((r.supports as Runner["supports"]) ?? []).map((s) => ({
      ...s,
      offsetFromLeft: num(s.offsetFromLeft, 0),
      ...(s.offsetFromCenterZ !== undefined
        ? { offsetFromCenterZ: num(s.offsetFromCenterZ, 0) }
        : {}),
    }));
    return {
      ...(r as unknown as Runner),
      groupDrag,
      length: num(r.length, 60),
      depth: num(r.depth, 11.25),
      position: pos(r.position),
      rotationDeg: num(r.rotationDeg, 0),
      baseHeight: num(r.baseHeight, 0),
      supports: sup,
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
    groupDrag,
    length: num(worldRight - worldLeft, 60),
    depth: num(r.depth, 11.25),
    position: { x: num((worldLeft + worldRight) / 2, 0), z: num(z, 0) },
    rotationDeg: 0,
    baseHeight: num(bottomHeight, 0),
    fastening: (r.fastening as Runner["fastening"]) ?? "pocket-screw",
    supports: ((r.supports as Runner["supports"]) ?? []).map((s) => ({
      ...s,
      offsetFromLeft: num(s.offsetFromLeft, 0),
    })),
  };
}

/** Reassign any duplicate object ids (keeping the first occurrence) so a
 *  reused id can't make two pieces move together. Runner refs point at the
 *  first occurrence, so keeping it preserves desk grouping. */
function dedupeIds(p: Project): Project {
  const seen = new Set<string>();
  const fix = <T extends { id: string }>(item: T, prefix: string): T => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }
    let nid = uid(prefix);
    while (seen.has(nid)) nid = uid(prefix);
    seen.add(nid);
    return { ...item, id: nid };
  };
  return {
    ...p,
    carcasses: p.carcasses.map((c) => fix(c, "carcass")),
    runners: p.runners.map((r) => fix(r, "runner")),
    refBoxes: p.refBoxes.map((b) => fix(b, "box")),
    people: p.people.map((pn) => fix(pn, "person")),
  };
}

/** Fill in fields that older saved projects may lack. */
/** Fill in catalog fields added after a project was saved. */
export function normalizeCatalog(c: StockCatalog | undefined): StockCatalog {
  const base = defaultCatalog();
  if (!c) return base;
  return {
    ...c,
    kerf: num(c.kerf, 0.125),
    grainMatters: c.grainMatters ?? true,
    trimAllowance: num(c.trimAllowance, 0),
    materials: c.materials ?? base.materials,
    boards: (c.boards ?? base.boards).map((b) => ({
      ...b,
      width: num(b.width, 11.25),
      length: num(b.length, 96),
    })),
    sheets: (c.sheets ?? base.sheets).map((s) => ({
      ...s,
      width: num(s.width, 48),
      length: num(s.length, 96),
      // undefined qty means "buy as many as needed" — preserve that, but
      // clamp any real number to a sane non-negative integer.
      ...(s.qty === undefined || s.qty === null
        ? {}
        : { qty: Math.max(0, Math.floor(num(s.qty, 0))) }),
    })),
  };
}

export function normalizeProject(p: Project): Project {
  return dedupeIds({
    ...p,
    units: p.units ?? "in",
    catalog: normalizeCatalog(p.catalog),
    room: {
      ...p.room,
      length: num(p.room.length, 128),
      width: num(p.room.width, 120),
      ceilingHeight: num(p.room.ceilingHeight, 96),
      wallThickness: num(p.room.wallThickness, 4.5),
      walls:
        p.room.walls && p.room.walls.length >= 3
          ? p.room.walls.map((w) => pos(w))
          : rectWalls(num(p.room.length, 128), num(p.room.width, 120)),
      baseboard:
        p.room.baseboard === undefined || p.room.baseboard === null
          ? { height: 3.5, thickness: 0.5 }
          : {
              height: num(p.room.baseboard.height, 5.125),
              thickness: num(p.room.baseboard.thickness, 0.5),
            },
    },
    carcasses: (p.carcasses ?? []).map((c) => ({
      ...c,
      width: num(c.width, 20.75),
      height: num(c.height, 72),
      depth: num(c.depth, 11.25),
      rotationDeg: num(c.rotationDeg, 0),
      baseHeight: num(c.baseHeight, 0),
      toeKickHeight: num(c.toeKickHeight, 3),
      position: pos(c.position),
      shelves: (c.shelves ?? []).map((sh) => ({
        ...sh,
        offsetFromBottom: num(sh.offsetFromBottom, 0),
      })),
    })),
    runners: (p.runners ?? []).map((r) =>
      migrateRunner(r as unknown as Record<string, unknown>, p.carcasses ?? []),
    ),
    refBoxes: (p.refBoxes ?? []).map((b) => ({
      ...b,
      width: num(b.width, 16),
      height: num(b.height, 12),
      depth: num(b.depth, 24),
      ...(b.topWidth !== undefined ? { topWidth: num(b.topWidth, b.width) } : {}),
      ...(b.topDepth !== undefined ? { topDepth: num(b.topDepth, b.depth) } : {}),
      rotationDeg: num(b.rotationDeg, 0),
      baseHeight: num(b.baseHeight, 0),
      position: pos(b.position),
    })),
    people: (p.people ?? []).map((pn) => ({
      ...pn,
      rotationDeg: num(pn.rotationDeg, 0),
      baseHeight: num(pn.baseHeight, 0),
      pose: pn.pose ?? "standing",
      height: num(pn.height, 70),
      position: pos(pn.position),
    })),
  });
}
