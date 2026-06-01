import type { Inches } from "../domain/units";
import type { JoineryMethod, Material } from "../domain/types";

export type PartRole =
  | "side"
  | "top"
  | "bottom"
  | "toe-kick"
  | "back"
  | "shelf"
  | "runner"
  | "support";

/**
 * One physical piece. `length >= width` by convention (long dimension first).
 * `box`/`center` are carcass-local 3D coords (inches) for the scene; y is up.
 */
export interface Part {
  id: string;
  carcassId: string;
  role: PartRole;
  label: string;
  materialId: string;
  thickness: Inches;
  length: Inches;
  width: Inches;
  grainMatters: boolean;
  box: { x: Inches; y: Inches; z: Inches };
  center: { x: Inches; y: Inches; z: Inches };
  /** when true, `center` is room/world coords (not carcass-local) */
  world?: boolean;
}

export interface JointMember {
  partId: string;
  role: PartRole;
}

/** Which edge of the drilled part the joinery (pocket holes / pins /
 *  dado) lives on. Uses the Part-local axes: x along length, z along
 *  width. */
export type DrilledEdge = "left" | "right" | "top-edge" | "bottom-edge";

export interface Joint {
  id: string;
  carcassId: string;
  method: JoineryMethod;
  label: string;
  members: JointMember[];
  /** the member that receives the pocket holes / pins / dado, if applicable */
  drilledPartId?: string;
  /** edge of the drilled part the joinery sits on */
  drilledEdge?: DrilledEdge;
  /** length of the mating edge, used to space fasteners */
  edgeLength: Inches;
}

export interface CarcassGeometry {
  parts: Part[];
  joints: Joint[];
}

export function materialThickness(materials: Material[], id: string): Inches {
  const m = materials.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown material: ${id}`);
  return m.thickness;
}
