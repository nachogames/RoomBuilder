import type { Person } from "./types";

/** Standard chair seat height — what a sitting person rests at unless their
 *  baseHeight is bumped (e.g. by snapping onto a stool top). */
export const PERSON_SEAT_HEIGHT = 17;

/** Top-down footprint of a person in their own frame.
 *  - standing: shoulders × body (~18 × 10)
 *  - sitting: shoulders × (body + thighs forward) (~18 × 28) */
export function personFootprint(p: Person): { width: number; depth: number } {
  return p.pose === "sitting"
    ? { width: 18, depth: 28 }
    : { width: 18, depth: 10 };
}

/** Top of head Y above the person's baseHeight.
 *  - standing: equals their height
 *  - sitting: chair seat + half their standing height (head sits ~50% of
 *    standing height above the seat for typical proportions) */
export function personTopY(p: Person): number {
  return p.pose === "sitting"
    ? PERSON_SEAT_HEIGHT + p.height * 0.5
    : p.height;
}
