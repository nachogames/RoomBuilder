import type { Project } from "../domain/types";
import { normalizeProject } from "../domain/defaults";
import neilsStorageRoom from "./neils-storage-room.json";

/**
 * Bundled rooms. `starterProject()` is what a first-time visitor sees before
 * they have anything saved; returning visitors get their last-opened project
 * restored over it on startup (see App.tsx).
 */
export function starterProject(): Project {
  const p = JSON.parse(JSON.stringify(neilsStorageRoom)) as Project;
  if (p.schemaVersion !== 1) throw new Error("Unsupported starter room version");
  return normalizeProject(p);
}
