import type { Project } from "../domain/types";
import { normalizeProject } from "../domain/defaults";
import neilsStorageRoom from "./neils-storage-room.json";

/**
 * Bundled rooms. `starterProject()` is seeded into every visitor's saved
 * projects the first time they open the app after it shipped, and opened once;
 * after that the usual last-opened restore applies (see App.tsx).
 */
export const STARTER_ROOM_NAME = neilsStorageRoom.name;

export function starterProject(): Project {
  const p = JSON.parse(JSON.stringify(neilsStorageRoom)) as Project;
  if (p.schemaVersion !== 1) throw new Error("Unsupported starter room version");
  return normalizeProject(p);
}

/** Saved-project names with the bundled starter pinned to the top. */
export function starterFirst(names: string[]): string[] {
  const rest = names.filter((n) => n !== STARTER_ROOM_NAME).sort((a, b) => a.localeCompare(b));
  return names.includes(STARTER_ROOM_NAME) ? [STARTER_ROOM_NAME, ...rest] : rest;
}
