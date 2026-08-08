/**
 * All internal lengths are inches as numbers. Display is fractional.
 */

export type Inches = number;

/** Round to nearest 1/denom and render as a mixed fraction, e.g. 23.75 -> `23 3/4"`. */
export function formatInches(value: Inches, denom = 16): string {
  // A formatter must never crash the app: bail safely on non-finite input.
  if (!Number.isFinite(value)) return '0"';
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

/** Evaluate a calculator expression: + - * / parentheses, unary minus,
 *  decimals. Returns null (never throws) on malformed input or a non-finite
 *  result (e.g. divide by zero). Recursive descent, no eval(). */
export function evalMathExpr(src: string): number | null {
  const s = src.replace(/\s+/g, "");
  if (s === "") return null;
  let i = 0;
  const peek = () => s[i];
  const expr = (): number | null => {
    let v = term();
    if (v == null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = term();
      if (r == null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const term = (): number | null => {
    let v = factor();
    if (v == null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = factor();
      if (r == null) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const factor = (): number | null => {
    if (peek() === "-") {
      i++;
      const v = factor();
      return v == null ? null : -v;
    }
    if (peek() === "(") {
      i++;
      const v = expr();
      if (v == null || s[i] !== ")") return null;
      i++;
      return v;
    }
    const m = s.slice(i).match(/^\d*\.?\d+/);
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const out = expr();
  if (out == null || i !== s.length) return null;
  return Number.isFinite(out) ? out : null;
}

/** Parse `23 3/4`, `23.75`, `3/4`, `23-3/4` into inches — or, with a leading
 *  `=`, a calculator expression like `=96-5.125`. Returns null if unparseable. */
export function parseInches(input: string): Inches | null {
  const raw = input.trim();
  if (raw.startsWith("=")) return evalMathExpr(raw.slice(1));
  const s = raw.replace(/"/g, "").replace(/-/g, " ");
  if (s === "") return null;
  const m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  const f = s.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Iterative GCD on coerced integers — cannot recurse-overflow on bad input. */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.trunc(a)) || 0;
  b = Math.abs(Math.trunc(b)) || 0;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}
