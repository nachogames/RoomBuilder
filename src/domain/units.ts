/**
 * All internal lengths are inches as numbers. Display is fractional.
 */

export type Inches = number;

/** Round to nearest 1/denom and render as a mixed fraction, e.g. 23.75 -> `23 3/4"`. */
export function formatInches(value: Inches, denom = 16): string {
  const neg = value < 0;
  const v = Math.abs(value);
  const whole = Math.floor(v);
  let num = Math.round((v - whole) * denom);
  let w = whole;
  if (num === denom) {
    w += 1;
    num = 0;
  }
  let g = gcd(num, denom);
  if (num === 0) g = 1;
  const frac = num === 0 ? "" : `${num / g}/${denom / g}`;
  const body =
    w !== 0 && frac ? `${w} ${frac}` : frac ? frac : `${w}`;
  return `${neg ? "-" : ""}${body}"`;
}

/** Parse `23 3/4`, `23.75`, `3/4`, `23-3/4` into inches. Returns null if unparseable. */
export function parseInches(input: string): Inches | null {
  const s = input.trim().replace(/"/g, "").replace(/-/g, " ");
  if (s === "") return null;
  const m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
