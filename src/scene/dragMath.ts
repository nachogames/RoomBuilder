export interface P {
  x: number;
  z: number;
}

/** Resolve a drag target against wall resistance. Tries the full move, then
 *  sliding along each axis. If nothing fits: freeze (return the original p0)
 *  unless `freeIfStuck` — then move freely to the target so an oversized piece
 *  (e.g. a long runner that can't fit any in-room spot) still follows the
 *  cursor instead of locking up. */
export function resolveMove(
  fits: (x: number, z: number) => boolean,
  tx: number,
  tz: number,
  p0: P,
  freeIfStuck: boolean,
): P {
  if (fits(tx, tz)) return { x: tx, z: tz };
  if (fits(tx, p0.z)) return { x: tx, z: p0.z };
  if (fits(p0.x, tz)) return { x: p0.x, z: tz };
  return freeIfStuck ? { x: tx, z: tz } : p0;
}
