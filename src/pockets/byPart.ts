/**
 * Group the flat per-joint pocket plan by drilled part. Each part that
 * has any pocket-screw joints produces one PartPocketGroup; multiple
 * pocket-screw joints on the same part (e.g. a shelf joining both
 * sides) collapse into one group with multiple edge entries.
 */
import type { Inches } from "../domain/units";
import type { DrilledEdge, Joint, Part } from "../geometry/types";
import type { KregSetting } from "./kreg";
import type { PocketPlanEntry } from "./plan";

export interface EdgeHoles {
  edge: DrilledEdge | "unknown";
  edgeLength: Inches;
  /** positions in inches measured from the start of the edge */
  holes: Inches[];
  jointId: string;
  jointLabel: string;
  mateLabel: string;
  setting: KregSetting;
}

export interface PartPocketGroup {
  partId: string;
  carcassId: string;
  partLabel: string;
  /** part dimensions, used by the renderer to draw the outline */
  partLength: Inches;
  partWidth: Inches;
  partThickness: Inches;
  edges: EdgeHoles[];
}

const EDGE_ORDER: Record<EdgeHoles["edge"], number> = {
  left: 0,
  right: 1,
  "bottom-edge": 2,
  "top-edge": 3,
  unknown: 4,
};

export function groupPocketsByPart(
  plan: PocketPlanEntry[],
  joints: Joint[],
  parts: Part[],
): PartPocketGroup[] {
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const jointsById = new Map(joints.map((j) => [j.id, j]));
  const groups = new Map<string, PartPocketGroup>();

  for (const entry of plan) {
    const joint = jointsById.get(entry.jointId);
    if (!joint || !joint.drilledPartId) continue;
    const part = partsById.get(joint.drilledPartId);
    if (!part) continue;

    // The mate is the other member of the joint that isn't the drilled
    // part. For multi-member joints (e.g. the back panel which joins to
    // sides + top + bottom) we pick the first non-drilled member.
    const mate = joint.members.find((m) => m.partId !== joint.drilledPartId);
    const matePart = mate ? partsById.get(mate.partId) : undefined;
    const mateLabel = matePart?.label ?? "(unknown)";

    let g = groups.get(part.id);
    if (!g) {
      g = {
        partId: part.id,
        carcassId: part.carcassId,
        partLabel: part.label,
        partLength: part.length,
        partWidth: part.width,
        partThickness: part.thickness,
        edges: [],
      };
      groups.set(part.id, g);
    }
    g.edges.push({
      edge: joint.drilledEdge ?? "unknown",
      edgeLength: joint.edgeLength,
      holes: entry.holePositions,
      jointId: joint.id,
      jointLabel: entry.label,
      mateLabel,
      setting: entry.setting,
    });
  }

  for (const g of groups.values()) {
    g.edges.sort((a, b) => EDGE_ORDER[a.edge] - EDGE_ORDER[b.edge]);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.partLength !== b.partLength) return b.partLength - a.partLength;
    return a.partLabel.localeCompare(b.partLabel);
  });
}
