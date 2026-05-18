import type { Carcass, Runner, StockCatalog } from "./types";
import { runnerLayout } from "../geometry/runner";
import { materialThickness } from "../geometry/types";
import { formatInches } from "./units";
import type { CheckResult } from "./checks";

/**
 * Rule-of-thumb maximum unsupported span for a shelf/runner carrying a
 * moderate book/decor load, keyed by board thickness (softwood/ply).
 * Deliberately conservative; not a structural calculation.
 */
export function maxAllowableSpan(thickness: number): number {
  if (thickness >= 1.5) return 48;
  if (thickness >= 1.0) return 40;
  if (thickness >= 0.75) return 30;
  return 18;
}

/** Largest unsupported gap along the runner (bearings + point supports). */
export function maxUnsupportedSpan(
  r: Runner,
  carcasses: Carcass[],
  catalog: StockCatalog,
): number {
  const L = runnerLayout(r, carcasses, catalog);
  // merge bearing intervals
  const merged: Array<[number, number]> = [];
  for (const iv of [...L.bearingIntervals].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  // support "segments": bearings (ranges) + point supports (zero width)
  const segs: Array<[number, number]> = [
    ...merged,
    ...L.supportXs.map((x) => [x, x] as [number, number]),
  ].sort((a, b) => a[0] - b[0]);

  let max = 0;
  // leading cantilever
  if (segs.length) max = Math.max(max, segs[0][0] - L.worldLeft);
  for (let i = 0; i < segs.length - 1; i++) {
    max = Math.max(max, segs[i + 1][0] - segs[i][1]);
  }
  // trailing cantilever
  if (segs.length)
    max = Math.max(max, L.worldRight - segs[segs.length - 1][1]);
  if (!segs.length) max = L.length;
  return max;
}

export function checkRunnerSag(
  r: Runner,
  carcasses: Carcass[],
  catalog: StockCatalog,
): CheckResult {
  const t = materialThickness(catalog.materials, r.boardMaterialId);
  const span = maxUnsupportedSpan(r, carcasses, catalog);
  const allow = maxAllowableSpan(t);
  if (span > allow) {
    return {
      level: "warn",
      message: `${r.label}: ${formatInches(
        span,
      )} unsupported span exceeds the ~${formatInches(
        allow,
      )} rule of thumb for this board — add a support.`,
    };
  }
  return {
    level: "ok",
    message: `${r.label}: max unsupported span ${formatInches(
      span,
    )} (within ~${formatInches(allow)}).`,
  };
}
