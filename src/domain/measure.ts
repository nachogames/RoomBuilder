import type { Units } from "./types";
import { formatInches, parseInches } from "./units";

const MM_PER_IN = 25.4;

/** Format an internal inches value for display in the active units. */
export function formatLength(value: number, units: Units): string {
  if (units === "mm") return `${Math.round(value * MM_PER_IN)} mm`;
  return formatInches(value);
}

/** Parse a user string in the active units back to internal inches. */
export function parseLength(input: string, units: Units): number | null {
  if (units === "mm") {
    const n = Number(input.trim().replace(/mm/i, "").trim());
    return Number.isFinite(n) ? n / MM_PER_IN : null;
  }
  return parseInches(input);
}
