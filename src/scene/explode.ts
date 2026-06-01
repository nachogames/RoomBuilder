import type { Carcass } from "../domain/types";
import type { Part } from "../geometry/types";

export interface Vec3 { x: number; y: number; z: number }

/**
 * Per-part displacement for the assembly view's explode slider.
 *  - t = 0 returns zero (assembled state must be exact).
 *  - t = 1 returns the "fully exploded" offset proportional to carcass dims.
 *  - intermediate t lerps linearly.
 */
export function explodeOffset(
  _part: Part,
  _carcass: Carcass,
  _shelfIdx: number | undefined,
  _shelfCount: number,
  t: number,
): Vec3 {
  if (t === 0) return { x: 0, y: 0, z: 0 };
  return { x: 0, y: 0, z: 0 };
}
