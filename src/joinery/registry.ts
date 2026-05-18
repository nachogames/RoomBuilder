import type { Joint } from "../geometry/types";

export type HardwareKind =
  | "pocket-screw"
  | "wood-screw"
  | "shelf-pin"
  | "bracket"
  | "confirmat";

export interface HardwareItem {
  kind: HardwareKind;
  spec: string; // human label, also the aggregation key
  qty: number;
}

/**
 * Hardware contributed by a joint, EXCLUDING pocket screws (those are derived
 * from the pocket-hole plan so they are never double-counted).
 */
export function hardwareForJoint(j: Joint): HardwareItem[] {
  switch (j.method) {
    case "pocket-screw":
      return []; // counted via pockets/plan
    case "shelf-pin":
      // two pins per side (front + back)
      return [{ kind: "shelf-pin", spec: '1/4" shelf pin', qty: 2 }];
    case "bracket":
      return [
        { kind: "bracket", spec: "shelf bracket", qty: 1 },
        { kind: "wood-screw", spec: '#8 x 5/8" pan', qty: 4 },
      ];
    case "screw-through": {
      // ~1 screw every 5" along the edge, min 4
      const qty = Math.max(4, Math.round(j.edgeLength / 5));
      return [{ kind: "wood-screw", spec: '#6 x 5/8" (back)', qty }];
    }
    case "cleat": {
      const qty = Math.max(2, Math.round(j.edgeLength / 6));
      return [{ kind: "wood-screw", spec: '#8 x 1-1/4"', qty }];
    }
    case "dado":
      return []; // glued joint, no fasteners
    default:
      return [];
  }
}
