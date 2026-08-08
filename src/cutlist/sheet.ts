import type { Inches } from "../domain/units";
import type { Part } from "../geometry/types";

export interface SheetPlacement {
  partId: string;
  label: string;
  x: Inches;
  y: Inches;
  /** footprint occupied on the sheet — includes trim allowance when set */
  w: Inches;
  h: Inches;
  rotated: boolean;
  /** final size after trimming; equals w/h when trimAllowance is 0 */
  finishedW: Inches;
  finishedH: Inches;
}

export interface SheetBin {
  sheetWidth: Inches;
  sheetLength: Inches;
  placements: SheetPlacement[];
  usedArea: Inches;
  /** which stock entry this bin came from, so a plan can say "your offcut" */
  stockLabel?: string;
  /** true when this bin came from a finite pile you already own */
  fromInventory?: boolean;
}

/** One size of sheet you can cut from. `qty` omitted = unlimited supply. */
export interface StockSheet {
  width: Inches;
  length: Inches;
  qty?: number;
  label?: string;
}

export interface PackOptions {
  kerf: Inches;
  /**
   * Project-level grain lock. When false, every part may rotate 90°
   * regardless of its own `grainMatters` flag — the paint-grade case, and
   * frequently the difference between N and N-1 sheets.
   * Default true (per-part flags are honoured).
   */
  grainMatters?: boolean;
  /**
   * Extra material added to both axes of every part so you can trim to final
   * size instead of trusting a factory edge. Default 0.
   */
  trimAllowance?: Inches;
  /** How many heuristic combinations to try. Default "thorough". */
  effort?: "fast" | "thorough";
}

export interface SheetPackResult {
  bins: SheetBin[];
  /** won't fit on ANY available stock size, in any allowed orientation */
  oversize: Part[];
  /** would fit, but the stock you said you have ran out */
  unplaced: Part[];
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PackBin extends SheetBin {
  free: FreeRect[];
}

interface Piece {
  p: Part;
  /** rough footprint (finished + trim), grain-natural orientation */
  w: number;
  h: number;
  finishedW: number;
  finishedH: number;
  canRotate: boolean;
}

const EPS = 1e-9;

type OrderKey = "maxEdge" | "area" | "length" | "width" | "perimeter";
type FitKey = "area" | "shortSide" | "bottomLeft";
type NewBinKey = "smallest" | "largest";

interface Strategy {
  order: OrderKey;
  fit: FitKey;
  newBin: NewBinKey;
  /**
   * Open this many bins up front and spread pieces across them (each piece
   * goes to the emptiest bin it fits in) instead of filling one bin before
   * opening the next. 0 = the lazy, fill-first behaviour.
   */
  preOpen: number;
}

const ORDERS: OrderKey[] = ["maxEdge", "area", "length", "width", "perimeter"];
const FITS: FitKey[] = ["area", "shortSide", "bottomLeft"];
const NEW_BINS: NewBinKey[] = ["smallest", "largest"];

function strategies(effort: "fast" | "thorough", preOpen: number): Strategy[] {
  const orders = effort === "fast" ? ORDERS.slice(0, 2) : ORDERS;
  const fits = effort === "fast" ? FITS.slice(0, 2) : FITS;
  const newBins = effort === "fast" ? NEW_BINS.slice(0, 1) : NEW_BINS;
  const out: Strategy[] = [];
  for (const order of orders) {
    for (const fit of fits) {
      for (const newBin of newBins) out.push({ order, fit, newBin, preOpen });
    }
  }
  return out;
}

/**
 * 2D nesting across a heterogeneous, optionally finite set of stock sheets.
 *
 * Each strategy is a full MaxRects pass: every piece goes to the best-scoring
 * free rect across ALL open bins, and new stock is opened only when nothing
 * fits. Strategies vary the part ordering, the free-rect score, and which
 * stock size gets opened next. Best result wins on fewest unplaced parts,
 * then fewest sheets you'd have to buy, then fewest sheets, then least area.
 *
 * The search is the point. A single greedy pass routinely lands one sheet
 * above optimal on real cutlists — most visibly once rotation is allowed,
 * because the good packing usually depends on committing a rotated strip
 * early, which only some orderings do. Thirty passes over a few dozen parts
 * is still sub-millisecond.
 */
export function packSheetsFrom(
  parts: Part[],
  stock: StockSheet[],
  opts: PackOptions,
): SheetPackResult {
  const trim = Math.max(0, opts.trimAllowance ?? 0);
  const grainLocked = opts.grainMatters !== false;

  if (stock.length === 0) {
    return { bins: [], oversize: [...parts], unplaced: [] };
  }

  const oversize: Part[] = [];
  const pieces: Piece[] = [];
  for (const p of parts) {
    const w = p.width + trim;
    const h = p.length + trim;
    const canRotate = !(grainLocked && p.grainMatters);
    const fitsSomewhere = stock.some(
      (s) =>
        (h <= s.length + EPS && w <= s.width + EPS) ||
        (canRotate && w <= s.length + EPS && h <= s.width + EPS),
    );
    if (!fitsSomewhere) {
      oversize.push(p);
      continue;
    }
    pieces.push({ p, w, h, finishedW: p.width, finishedH: p.length, canRotate });
  }

  const effort = opts.effort ?? "thorough";
  const best: { result: SheetPackResult | null; score: number[] } = {
    result: null,
    score: [],
  };
  const consider = (attempt: SheetPackResult): void => {
    const score = scoreOf(attempt);
    if (best.result === null || lessThan(score, best.score)) {
      best.result = attempt;
      best.score = score;
    }
  };

  // Pass 1 — lazy: fill a bin, open another only when nothing fits.
  for (const strat of strategies(effort, 0)) {
    consider(runStrategy(pieces, stock, opts.kerf, strat));
  }

  // Pass 2 — fixed-K spread. Filling greedily is exactly how you end up
  // with three sheets when two would do: the first bin swallows every long
  // part, and the leftovers no longer pair with anything. So from the area
  // lower bound upward, pre-open K bins and push each piece into the
  // emptiest one it fits. This is what finds "one sheet per cabinet".
  const lower = lowerBound(pieces, stock);
  const ceiling = best.result ? best.result.bins.length : lower;
  for (let k = lower; k < Math.max(ceiling, lower + 1); k++) {
    let solved = false;
    for (const strat of strategies(effort, k)) {
      const attempt = runStrategy(pieces, stock, opts.kerf, strat);
      consider(attempt);
      if (attempt.unplaced.length === 0 && attempt.bins.length <= k) solved = true;
    }
    if (solved) break;
  }

  const chosen: SheetPackResult = best.result ?? { bins: [], oversize: [], unplaced: [] };
  return {
    bins: chosen.bins,
    oversize: [...oversize, ...chosen.oversize],
    unplaced: chosen.unplaced,
  };
}

/** Fewest sheets this part set could conceivably occupy, by area alone. */
function lowerBound(pieces: Piece[], stock: StockSheet[]): number {
  if (pieces.length === 0) return 0;
  const area = pieces.reduce((s, p) => s + p.w * p.h, 0);
  const biggest = Math.max(...stock.map((s) => s.width * s.length));
  if (!(biggest > 0)) return 1;
  return Math.max(1, Math.ceil(area / biggest - 1e-9));
}

function scoreOf(r: SheetPackResult): number[] {
  const area = r.bins.reduce((s, b) => s + b.sheetWidth * b.sheetLength, 0);
  const used = r.bins.reduce((s, b) => s + b.usedArea, 0);
  // Sheets pulled from a finite pile are already paid for, so rank plans by
  // how many NEW sheets they need before ranking by total sheet count.
  const toBuy = r.bins.filter((b) => !b.fromInventory).length;
  return [r.unplaced.length, toBuy, r.bins.length, area, -used];
}

function lessThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv;
  }
  return false;
}

function runStrategy(
  pieces: Piece[],
  stock: StockSheet[],
  kerf: number,
  strat: Strategy,
): SheetPackResult {
  const ordered = [...pieces].sort(comparator(strat.order));
  const remaining = stock.map((s) =>
    s.qty === undefined ? Infinity : Math.max(0, Math.floor(s.qty)),
  );

  const bins: PackBin[] = [];
  const unplaced: Part[] = [];

  // Pre-open bins for spread mode. Uses the largest stock still available,
  // which is the right default when you're deciding how much to buy.
  for (let i = 0; i < strat.preOpen; i++) {
    const idx = pickAnyStock(stock, remaining);
    if (idx < 0) break;
    remaining[idx] -= 1;
    bins.push(openBin(stock[idx]));
  }
  const spread = strat.preOpen > 0;

  for (const piece of ordered) {
    let target: { bin: PackBin; choice: Choice } | null = null;
    for (const bin of bins) {
      const choice = chooseRect(bin, piece, strat.fit);
      if (!choice) continue;
      if (target === null) {
        target = { bin, choice };
        continue;
      }
      // Spread: prefer the emptiest bin, so long parts don't all pile into
      // the first sheet. Otherwise: the globally tightest free rect.
      const better = spread
        ? freeArea(bin) > freeArea(target.bin)
        : choice.score < target.choice.score;
      if (better) target = { bin, choice };
    }
    if (target) {
      commit(target.bin, piece, target.choice, kerf);
      continue;
    }

    const idx = pickStock(stock, remaining, piece, strat.newBin);
    if (idx < 0) {
      unplaced.push(piece.p);
      continue;
    }
    const bin = openBin(stock[idx]);
    const choice = chooseRect(bin, piece, strat.fit);
    if (!choice) {
      // Unreachable: pickStock only returns stock this piece fits on.
      unplaced.push(piece.p);
      continue;
    }
    remaining[idx] -= 1;
    commit(bin, piece, choice, kerf);
    bins.push(bin);
  }

  const out: SheetBin[] = bins.map((b) => ({
    sheetWidth: b.sheetWidth,
    sheetLength: b.sheetLength,
    placements: b.placements,
    usedArea: b.usedArea,
    ...(b.stockLabel !== undefined ? { stockLabel: b.stockLabel } : {}),
    fromInventory: b.fromInventory,
  }));
  return { bins: out, oversize: [], unplaced };
}

function openBin(s: StockSheet): PackBin {
  return {
    sheetWidth: s.width,
    sheetLength: s.length,
    placements: [],
    usedArea: 0,
    ...(s.label !== undefined ? { stockLabel: s.label } : {}),
    fromInventory: s.qty !== undefined,
    free: [{ x: 0, y: 0, w: s.width, h: s.length }],
  };
}

function freeArea(b: PackBin): number {
  return b.sheetWidth * b.sheetLength - b.usedArea;
}

/** Largest stock still on hand, for pre-opening bins in spread mode. */
function pickAnyStock(stock: StockSheet[], remaining: number[]): number {
  let best = -1;
  let bestArea = 0;
  for (let i = 0; i < stock.length; i++) {
    if (remaining[i] <= 0) continue;
    const area = stock[i].width * stock[i].length;
    if (best < 0 || area > bestArea) {
      best = i;
      bestArea = area;
    }
  }
  return best;
}

function comparator(order: OrderKey): (a: Piece, b: Piece) => number {
  switch (order) {
    case "area":
      return (a, b) => b.w * b.h - a.w * a.h;
    case "length":
      return (a, b) => b.h - a.h || b.w - a.w;
    case "width":
      return (a, b) => b.w - a.w || b.h - a.h;
    case "perimeter":
      return (a, b) => b.w + b.h - (a.w + a.h);
    case "maxEdge":
    default:
      return (a, b) => {
        const am = Math.max(a.w, a.h);
        const bm = Math.max(b.w, b.h);
        if (am !== bm) return bm - am;
        return b.w * b.h - a.w * a.h;
      };
  }
}

function pickStock(
  stock: StockSheet[],
  remaining: number[],
  piece: Piece,
  mode: NewBinKey,
): number {
  let best = -1;
  let bestArea = 0;
  for (let i = 0; i < stock.length; i++) {
    if (remaining[i] <= 0) continue;
    const s = stock[i];
    const fits =
      (piece.h <= s.length + EPS && piece.w <= s.width + EPS) ||
      (piece.canRotate && piece.w <= s.length + EPS && piece.h <= s.width + EPS);
    if (!fits) continue;
    const area = s.width * s.length;
    if (best < 0 || (mode === "smallest" ? area < bestArea : area > bestArea)) {
      best = i;
      bestArea = area;
    }
  }
  return best;
}

interface Choice {
  rect: FreeRect;
  pw: number;
  ph: number;
  rotated: boolean;
  score: number;
}

function chooseRect(bin: PackBin, piece: Piece, fit: FitKey): Choice | null {
  const candidates: Array<{ pw: number; ph: number; rotated: boolean }> = [];
  if (piece.w <= bin.sheetWidth + EPS && piece.h <= bin.sheetLength + EPS) {
    candidates.push({ pw: piece.w, ph: piece.h, rotated: false });
  }
  if (
    piece.canRotate &&
    piece.h <= bin.sheetWidth + EPS &&
    piece.w <= bin.sheetLength + EPS
  ) {
    candidates.push({ pw: piece.h, ph: piece.w, rotated: true });
  }
  if (candidates.length === 0) return null;

  let best: Choice | null = null;
  for (const c of candidates) {
    for (const r of bin.free) {
      if (r.w + EPS < c.pw || r.h + EPS < c.ph) continue;
      const score = fitScore(fit, r, c.pw, c.ph);
      if (best === null || score < best.score) {
        best = { rect: r, pw: c.pw, ph: c.ph, rotated: c.rotated, score };
      }
    }
  }
  return best;
}

function fitScore(fit: FitKey, r: FreeRect, pw: number, ph: number): number {
  const leftoverW = r.w - pw;
  const leftoverH = r.h - ph;
  switch (fit) {
    case "shortSide":
      return Math.min(leftoverW, leftoverH) * 1e6 + Math.max(leftoverW, leftoverH);
    case "bottomLeft":
      return (r.y + ph) * 1e6 + r.x;
    case "area":
    default:
      return (r.w * r.h - pw * ph) * 1e6 + Math.min(leftoverW, leftoverH);
  }
}

function commit(bin: PackBin, piece: Piece, choice: Choice, kerf: number): void {
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
    finishedW: rotated ? piece.finishedH : piece.finishedW,
    finishedH: rotated ? piece.finishedW : piece.finishedH,
  });
  bin.usedArea += pw * ph;

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
    if (y > r.y + EPS) next.push({ x: r.x, y: r.y, w: r.w, h: y - r.y });
    if (placedBottom < r.y + r.h - EPS) {
      next.push({ x: r.x, y: placedBottom, w: r.w, h: r.y + r.h - placedBottom });
    }
    if (x > r.x + EPS) next.push({ x: r.x, y: r.y, w: x - r.x, h: r.h });
    if (placedRight < r.x + r.w - EPS) {
      next.push({ x: placedRight, y: r.y, w: r.x + r.w - placedRight, h: r.h });
    }
  }
  const clipped: FreeRect[] = [];
  for (const r of next) {
    const cx = Math.max(0, r.x);
    const cy = Math.max(0, r.y);
    const cw = Math.min(bin.sheetWidth, r.x + r.w) - cx;
    const ch = Math.min(bin.sheetLength, r.y + r.h) - cy;
    if (cw > EPS && ch > EPS) clipped.push({ x: cx, y: cy, w: cw, h: ch });
  }
  bin.free = prune(clipped);
}

function intersects(
  r: FreeRect,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  return (
    r.x < x1 - EPS && r.x + r.w > x0 + EPS && r.y < y1 - EPS && r.y + r.h > y0 + EPS
  );
}

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

/**
 * Back-compat wrapper: one unlimited stock size, per-part grain flags
 * honoured, no trim allowance. Prefer `packSheetsFrom`.
 */
export function packSheets(
  parts: Part[],
  sheetWidth: Inches,
  sheetLength: Inches,
  kerf: Inches,
): { bins: SheetBin[]; oversize: Part[] } {
  const r = packSheetsFrom(parts, [{ width: sheetWidth, length: sheetLength }], {
    kerf,
  });
  return { bins: r.bins, oversize: [...r.oversize, ...r.unplaced] };
}
