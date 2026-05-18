import type { Inches } from "./units";

export type JoineryMethod =
  | "pocket-screw"
  | "shelf-pin"
  | "cleat"
  | "dado"
  | "screw-through"
  | "bracket";

export type MaterialKind = "sheet" | "board";

/** A material definition referenced by parts and stock. */
export interface Material {
  id: string;
  name: string; // e.g. "3/4\" Birch Plywood"
  kind: MaterialKind;
  thickness: Inches;
}

/** Stock you can buy: a sheet (W x L) or a board (nominal, sold by length). */
export interface SheetStock {
  materialId: string;
  width: Inches; // 48
  length: Inches; // 96
}
export interface BoardStock {
  materialId: string;
  width: Inches; // actual, e.g. 11.25 for a 1x12
  length: Inches; // e.g. 96
  nominal: string; // "1x12"
}

export interface StockCatalog {
  materials: Material[];
  sheets: SheetStock[];
  boards: BoardStock[];
  kerf: Inches; // saw kerf, e.g. 0.125
}

export type WallId = "N" | "S" | "E" | "W";

/** A rectangular jog in a wall: `out` protrudes, `in` is a recess/alcove. */
export interface BumpOut {
  id: string;
  wall: WallId;
  /** distance from the wall's start corner to the near edge of the jog */
  offset: Inches;
  /** size along the wall */
  width: Inches;
  /** how far it juts out / recesses in */
  depth: Inches;
  dir: "out" | "in";
  label: string;
}

export interface Baseboard {
  height: Inches;
  thickness: Inches;
}

export interface Room {
  length: Inches; // along X
  width: Inches; // along Z
  ceilingHeight: Inches;
  wallThickness: Inches;
  bumpOuts: BumpOut[];
  /** flat baseboard reference; null = none. Not counted in the cut list. */
  baseboard: Baseboard | null;
}

export type ShelfAttachment = Extract<
  JoineryMethod,
  "pocket-screw" | "shelf-pin" | "cleat" | "dado"
>;

export interface ShelfSpec {
  /** clear position of the shelf's bottom face from carcass interior floor */
  offsetFromBottom: Inches;
  attachment: ShelfAttachment;
}

/** The shared primitive: a box with shelves. Bookcases/cabinets/desk cabinets. */
export interface Carcass {
  id: string;
  label: string;
  /** outside dimensions */
  width: Inches;
  height: Inches;
  depth: Inches;
  carcassMaterialId: string; // sides/top/bottom
  backMaterialId: string;
  shelfMaterialId: string;
  hasBack: boolean;
  toeKickHeight: Inches; // 0 = none
  shelves: ShelfSpec[];
  carcassJoinery: Extract<JoineryMethod, "pocket-screw" | "dado" | "screw-through">;
  /** optional target opening this must fit into, e.g. a 20.75" slot */
  targetOpeningWidth?: Inches;
  /** placement on the room floor (top-down), inches from room origin */
  position: { x: Inches; z: Inches };
  rotationDeg: number;
}

export type SupportKind = "corbel" | "bracket" | "leg" | "cleat";

export interface Support {
  id: string;
  kind: SupportKind;
  /** position along the runner, inches from the runner's left end */
  offsetFromLeft: Inches;
}

export type RunnerFastening = Extract<
  JoineryMethod,
  "pocket-screw" | "screw-through" | "bracket"
>;

/** A board spanning one or more carcasses (e.g. a 2x12 across two bookcases). */
export interface Runner {
  id: string;
  label: string;
  boardMaterialId: string;
  /** ids of carcasses this runner bears on, left-to-right */
  spannedCarcassIds: string[];
  /** underside height above the floor */
  bottomHeight: Inches;
  /** depth (front-to-back) of the runner board */
  depth: Inches;
  /** horizontal overhang past the outer carcasses, each end */
  overhangEachEnd: Inches;
  fastening: RunnerFastening;
  supports: Support[];
  /** shift the whole runner relative to the carcasses it spans */
  nudge: { x: Inches; z: Inches };
}

/** A plain reference object (e.g. a storage tote) for fit-checking only. */
export interface RefBox {
  id: string;
  label: string;
  width: Inches;
  height: Inches;
  depth: Inches;
  position: { x: Inches; z: Inches };
}

export type Units = "in" | "mm";

export interface Project {
  schemaVersion: 1;
  name: string;
  units: Units;
  catalog: StockCatalog;
  room: Room;
  carcasses: Carcass[];
  runners: Runner[];
  refBoxes: RefBox[];
}
