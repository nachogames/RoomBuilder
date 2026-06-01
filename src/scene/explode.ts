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
  part: Part,
  carcass: Carcass,
  shelfIdx: number | undefined,
  shelfCount: number,
  t: number,
): Vec3 {
  if (t === 0) return { x: 0, y: 0, z: 0 };
  const W = carcass.width;
  const H = carcass.height;
  const D = carcass.depth;
  const toe = carcass.toeKickHeight;

  switch (part.role) {
    case "side": {
      const sign = part.center.x < 0 ? -1 : 1;
      return { x: sign * W * 0.6 * t, y: 0, z: 0 };
    }
    case "top":
      return { x: 0, y: H * 0.5 * t, z: 0 };
    case "bottom": {
      const dy = toe > 0 ? -toe * 2 * t : -H * 0.15 * t;
      return { x: 0, y: dy, z: 0 };
    }
    case "toe-kick":
      return { x: 0, y: -H * 0.35 * t, z: 0 };
    case "shelf": {
      const n = Math.max(1, shelfCount);
      const i = shelfIdx ?? 0;
      return { x: 0, y: H * 0.2 * t * (1 + i / n), z: D * 0.5 * t };
    }
    case "back":
      return { x: 0, y: 0, z: -D * 0.8 * t };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}
