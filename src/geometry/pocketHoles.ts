import type { StockCatalog } from "../domain/types";
import type { Joint, Part } from "./types";

export interface PocketHoleMark {
  jointId: string;
  partId: string;
  /** carcass-local position of the entrance face center for this hole */
  center: { x: number; y: number; z: number };
  /** Unit outward normal of the drilled face (the face the drill enters
   *  from). The drill axis is `-normal` tilted by `angleDeg` toward the
   *  mating part. */
  normal: { x: number; y: number; z: number };
  /** Kreg drill angle measured from the face surface (~15°), i.e. ~75°
   *  from the face normal. */
  angleDeg: number;
  /** entrance oval long-axis length (~1/2") */
  entranceLong: number;
  /** entrance oval short-axis length (~3/8") */
  entranceShort: number;
  /** how far the cylinder visually extends into the part */
  depth: number;
}

export function pocketHoleMarks(
  _parts: Part[],
  _joints: Joint[],
  _catalog: StockCatalog,
): PocketHoleMark[] {
  return [];
}
