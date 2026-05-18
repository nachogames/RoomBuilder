import type { Carcass, Project } from "./types";
import { formatInches } from "./units";

export interface CheckResult {
  level: "ok" | "warn" | "error";
  message: string;
}

/** Phase 1 checks: target-opening fit and room containment. */
export function checkCarcass(c: Carcass, project: Project): CheckResult[] {
  const out: CheckResult[] = [];

  if (c.targetOpeningWidth != null) {
    const gap = c.targetOpeningWidth - c.width;
    if (gap < 0) {
      out.push({
        level: "error",
        message: `${c.label} is ${formatInches(-gap)} too wide for its ${formatInches(
          c.targetOpeningWidth,
        )} opening.`,
      });
    } else if (gap < 0.125) {
      out.push({
        level: "warn",
        message: `${c.label} has only ${formatInches(
          gap,
        )} clearance in its ${formatInches(c.targetOpeningWidth)} opening — tight to slide in.`,
      });
    } else {
      out.push({
        level: "ok",
        message: `${c.label} fits its opening with ${formatInches(gap)} clearance.`,
      });
    }
  }

  if (c.height > project.room.ceilingHeight) {
    out.push({
      level: "error",
      message: `${c.label} (${formatInches(
        c.height,
      )}) is taller than the ${formatInches(
        project.room.ceilingHeight,
      )} ceiling.`,
    });
  }

  return out;
}

export function worstLevel(results: CheckResult[]): CheckResult["level"] {
  if (results.some((r) => r.level === "error")) return "error";
  if (results.some((r) => r.level === "warn")) return "warn";
  return "ok";
}
