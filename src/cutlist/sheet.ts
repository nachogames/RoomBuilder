import type { Inches } from "../domain/units";
import type { Part } from "../geometry/types";

export interface SheetPlacement {
  partId: string;
  label: string;
  x: Inches;
  y: Inches;
  w: Inches;
  h: Inches;
  rotated: boolean;
}
export interface SheetBin {
  sheetWidth: Inches;
  sheetLength: Inches;
  placements: SheetPlacement[];
  usedArea: Inches;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Internal: SheetBin plus the live free-rect list used during packing. */
interface PackBin extends SheetBin {
  free: FreeRect[];
}

interface Piece {
  p: Part;
  w: number;
  h: number;
  rotated: boolean;
}

const EPS = 1e-9;

/**
 * 2D nesting via MaxRects (best-area-fit). Sheet is `sheetWidth` (x) by
 * `sheetLength` (y). Grain-aware: parts may rotate 90° only when the
 * part's `grainMatters` is false. Kerf is consumed between adjacent
 * placements by treating each placed piece as `(w + kerf)` × `(h + kerf)`
 * when carving free space.
 *
 * Versus the shelf-guillotine packer this replaces:
 *  - free space is tracked as a list of maximal rectangles instead of
 *    locked shelves, so a tall piece doesn't trap short pieces in its
 *    shelf height,
 *  - placements pick the rect that wastes the least area for this piece
 *    (BAF), so small pieces tend to fill leftover gaps from large ones.
 *
 * Output uses the same SheetBin shape as before so the UI and existing
 * tests keep working.
 */
export function packSheets(
  parts: Part[],
  sheetWidth: Inches,
  sheetLength: Inches,
  kerf: Inches,
): { bins: SheetBin[]; oversize: Part[] } {
  const oversize: Part[] = [];
  const pieces: Piece[] = [];
  for (const p of parts) {
    const grainFit = p.length <= sheetLength && p.width <= sheetWidth;
    const crossFit = p.width <= sheetLength && p.length <= sheetWidth;
    if (!grainFit && !(crossFit && !p.grainMatters)) {
      oversize.push(p);
      continue;
    }
    pieces.push({ p, w: p.width, h: p.length, rotated: false });
  }

  // Order by max edge desc, then area desc. This isn't required for
  // correctness (MaxRects is dynamic) but produces noticeably better
  // results on heterogeneous sets.
  pieces.sort((a, b) => {
    const am = Math.max(a.w, a.h);
    const bm = Math.max(b.w, b.h);
    if (am !== bm) return bm - am;
    return (b.w * b.h) - (a.w * a.h);
  });

  const bins: PackBin[] = [];
  for (const piece of pieces) {
    let placed = false;
    for (const bin of bins) {
      if (tryPlace(bin, piece, sheetWidth, sheetLength, kerf)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      const bin = newBin(sheetWidth, sheetLength);
      const ok = tryPlace(bin, piece, sheetWidth, sheetLength, kerf);
      // A piece that survived the oversize filter must fit in a fresh bin.
      // If not, surface it as oversize rather than silently dropping.
      if (!ok) oversize.push(piece.p);
      bins.push(bin);
    }
  }

  // Strip the internal `free` list from the public output.
  const out: SheetBin[] = bins.map((b) => ({
    sheetWidth: b.sheetWidth,
    sheetLength: b.sheetLength,
    placements: b.placements,
    usedArea: b.usedArea,
  }));
  return { bins: out, oversize };
}

function newBin(w: number, h: number): PackBin {
  return {
    sheetWidth: w,
    sheetLength: h,
    placements: [],
    usedArea: 0,
    free: [{ x: 0, y: 0, w, h }],
  };
}

/** Find the free rect that minimises leftover area for this piece in this
 *  bin, considering both orientations when grain allows. Returns the chosen
 *  placement (or null if no rect fits). */
function chooseRect(
  bin: PackBin,
  piece: Piece,
  sheetW: number,
  sheetH: number,
): { rect: FreeRect; pw: number; ph: number; rotated: boolean } | null {
  // Effective footprint includes kerf on +X and +Y unless the piece sits
  // flush against the right/top edge of the sheet (no neighbour will share
  // that edge). We over-approximate by always reserving kerf — the small
  // waste at the edge is acceptable and mirrors the prior packer.
  const candidates: Array<{ pw: number; ph: number; rotated: boolean }> = [];
  if (piece.w <= sheetW + EPS && piece.h <= sheetH + EPS) {
    candidates.push({ pw: piece.w, ph: piece.h, rotated: false });
  }
  if (!piece.p.grainMatters && piece.h <= sheetW + EPS && piece.w <= sheetH + EPS) {
    candidates.push({ pw: piece.h, ph: piece.w, rotated: true });
  }
  if (candidates.length === 0) return null;

  let best: {
    rect: FreeRect;
    pw: number;
    ph: number;
    rotated: boolean;
    score: number;
  } | null = null;

  for (const c of candidates) {
    for (const r of bin.free) {
      if (r.w + EPS < c.pw || r.h + EPS < c.ph) continue;
      // Score: leftover area after placing (best-area-fit). Tie-break on
      // smaller short side leftover so we don't strand thin strips.
      const leftover = r.w * r.h - c.pw * c.ph;
      const shortLeftover = Math.min(r.w - c.pw, r.h - c.ph);
      const score = leftover * 1e6 + shortLeftover;
      if (best === null || score < best.score) {
        best = { rect: r, pw: c.pw, ph: c.ph, rotated: c.rotated, score };
      }
    }
  }
  return best;
}

function tryPlace(
  bin: PackBin,
  piece: Piece,
  sheetW: number,
  sheetH: number,
  kerf: number,
): boolean {
  const choice = chooseRect(bin, piece, sheetW, sheetH);
  if (!choice) return false;
  const { rect, pw, ph, rotated } = choice;
  const x = rect.x;
  const y = rect.y;

  bin.placements.push({
    partId: piece.p.id,
    label: piece.p.label,
    x,
    y,
    w: pw,
    h: ph,
    rotated,
  });
  bin.usedArea += pw * ph;

  // Subdivide every free rect that overlaps the placed kerf-padded box.
  const padW = pw + kerf;
  const padH = ph + kerf;
  const placedRight = x + padW;
  const placedBottom = y + padH;

  const next: FreeRect[] = [];
  for (const r of bin.free) {
    if (!intersects(r, x, y, placedRight, placedBottom)) {
      next.push(r);
      continue;
    }
    // Split r into up to 4 children that don't overlap the placement.
    if (y > r.y + EPS) next.push({ x: r.x, y: r.y, w: r.w, h: y - r.y });
    if (placedBottom < r.y + r.h - EPS) {
      next.push({ x: r.x, y: placedBottom, w: r.w, h: r.y + r.h - placedBottom });
    }
    if (x > r.x + EPS) next.push({ x: r.x, y: r.y, w: x - r.x, h: r.h });
    if (placedRight < r.x + r.w - EPS) {
      next.push({ x: placedRight, y: r.y, w: r.x + r.w - placedRight, h: r.h });
    }
  }
  // Clip every rect to the sheet bounds and prune dominated ones.
  const clipped: FreeRect[] = [];
  for (const r of next) {
    const cx = Math.max(0, r.x);
    const cy = Math.max(0, r.y);
    const cw = Math.min(sheetW, r.x + r.w) - cx;
    const ch = Math.min(sheetH, r.y + r.h) - cy;
    if (cw > EPS && ch > EPS) clipped.push({ x: cx, y: cy, w: cw, h: ch });
  }
  bin.free = prune(clipped);
  return true;
}

function intersects(
  r: FreeRect,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  return (
    r.x < x1 - EPS &&
    r.x + r.w > x0 + EPS &&
    r.y < y1 - EPS &&
    r.y + r.h > y0 + EPS
  );
}

/** Remove any free rect contained by another. O(n²) but n stays small in
 *  practice (a few dozen at most for realistic cutlists). */
function prune(rects: FreeRect[]): FreeRect[] {
  const keep: boolean[] = rects.map(() => true);
  for (let i = 0; i < rects.length; i++) {
    if (!keep[i]) continue;
    for (let j = 0; j < rects.length; j++) {
      if (i === j || !keep[j]) continue;
      if (contains(rects[j], rects[i])) {
        keep[i] = false;
        break;
      }
    }
  }
  return rects.filter((_, i) => keep[i]);
}

function contains(outer: FreeRect, inner: FreeRect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  );
}
