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

export interface Room {
  length: Inches;
  width: Inches;
  ceilingHeight: Inches;
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

export interface Project {
  schemaVersion: 1;
  name: string;
  catalog: StockCatalog;
  room: Room;
  carcasses: Carcass[];
}
