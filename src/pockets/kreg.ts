import type { Inches } from "../domain/units";

export interface KregSetting {
  /** material thickness this is for */
  thickness: Inches;
  /** drill-guide / stop-collar setting label printed on a Kreg jig */
  guideSetting: string;
  /** drill depth the stop collar should be set to (= thickness) */
  collarDepth: Inches;
  /** recommended screw length (inches) */
  screwLength: Inches;
  screwType: "coarse" | "fine";
}

const SCREW_TABLE: Array<[Inches, Inches]> = [
  [0.5, 1.0],
  [0.625, 1.0],
  [0.75, 1.25],
  [1.0, 1.5],
  [1.5, 2.5],
];

function guideLabel(t: Inches): string {
  if (t <= 0.5) return '1/2"';
  if (t <= 0.75) return '3/4"';
  if (t <= 1.0) return '1"';
  return '1-1/2"';
}

/** Kreg jig settings for a given material thickness (common 720/520-style jig). */
export function kregForThickness(t: Inches): KregSetting {
  let best = SCREW_TABLE[0];
  for (const row of SCREW_TABLE) {
    if (Math.abs(row[0] - t) < Math.abs(best[0] - t)) best = row;
  }
  return {
    thickness: t,
    guideSetting: guideLabel(t),
    collarDepth: t,
    screwLength: best[1],
    screwType: "coarse",
  };
}

/** Pocket-hole positions along a mating edge (inches from one end). */
export function holePositions(edgeLength: Inches): Inches[] {
  if (edgeLength < 1.5) return [edgeLength / 2];
  const inset = Math.min(2, edgeLength / 4);
  const count = Math.max(2, Math.ceil(edgeLength / 6));
  const span = edgeLength - 2 * inset;
  const out: Inches[] = [];
  for (let i = 0; i < count; i++) {
    out.push(inset + (span * i) / (count - 1));
  }
  return out;
}
