import type { Project } from "../domain/types";
import { buildCarcass } from "./carcass";
import { buildRunner } from "./runner";
import { surfaceUnderPoint } from "./stacking";
import type { CarcassGeometry } from "./types";

export * from "./types";
export { buildCarcass, buildAll } from "./carcass";
export { buildRunner, runnerLayout } from "./runner";

/** Every part and joint in the project: carcasses + runners + supports. */
export function buildProject(project: Project): CarcassGeometry {
  const all: CarcassGeometry = { parts: [], joints: [] };
  for (const c of project.carcasses) {
    const g = buildCarcass(c, project.catalog);
    all.parts.push(...g.parts);
    all.joints.push(...g.joints);
  }
  for (const r of project.runners) {
    const g = buildRunner(r, project.carcasses, project.catalog, {
      // legs auto-span from the runner's underside down to whatever's below
      surfaceUnder: (x, z, maxY) =>
        surfaceUnderPoint(x, z, maxY, project, r.id),
    });
    all.parts.push(...g.parts);
    all.joints.push(...g.joints);
  }
  return all;
}
