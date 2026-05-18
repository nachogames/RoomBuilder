import type { Inches } from "../domain/units";
import type { JoineryMethod, Material } from "../domain/types";

export type PartRole =
  | "side"
  | "top"
  | "bottom"
  | "toe-kick"
  | "back"
  | "shelf";

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
}

export interface JointMember {
  partId: string;
  role: PartRole;
}

export interface Joint {
  id: string;
  carcassId: string;
  method: JoineryMethod;
  label: string;
  members: JointMember[];
  /** the member that receives the pocket holes / pins / dado, if applicable */
  drilledPartId?: string;
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
