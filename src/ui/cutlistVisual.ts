/**
 * Shared HTML/SVG renderers for the cutlist visual layout. Used both inline
 * in the Cut list tab and inside the print window. Returning HTML strings
 * (rather than React elements) lets us reuse the exact same markup in a
 * brand-new document we open with `window.open`, without pulling in
 * react-dom/server.
 *
 * Rendering mode:
 *   - "print"  : SVG sized in physical inches (`12.345in`) so the printed
 *                paper matches reality at 1:1 within page margins.
 *   - "screen" : SVG sized at 100% width via the viewBox so the diagram
 *                fills whatever column it's dropped into.
 */
import type { CutList, MaterialCutList } from "../cutlist";
import type { SheetBin } from "../cutlist/sheet";
import type { BoardBin } from "../cutlist/board";

export type RenderMode = "print" | "screen";
type Fmt = (n: number) => string;

const PAGE_W = 7.5; // letter portrait drawing width (in) at 0.5" margin
const SVG_H = 9;    // sheet SVG region height (in) reserving 1" for heading

export function renderSummarySection(
  itemLabels: string[],
  cutList: CutList,
  fmt: Fmt,
): string {
  const rows = cutList.byMaterial.map((m) => {
    const stockDesc = describeStock(m, fmt);
    const usagePct = computeUsagePct(m);
    const oversize = m.oversize.length;
    return `<tr>
      <td>${escapeHtml(m.materialName)}</td>
      <td>${m.stockCount} ${m.kind === "sheet" ? "sheet" : "board"}${m.stockCount === 1 ? "" : "s"}</td>
      <td>${stockDesc}</td>
      <td>${usagePct == null ? "—" : usagePct.toFixed(0) + "%"}</td>
      <td>${oversize === 0 ? "" : `<span class="cv-oversize">${oversize} oversize</span>`}</td>
    </tr>`;
  }).join("");
  return `<div class="cv-summary">
    ${itemLabels.length > 0
      ? `<h3 class="cv-h3">Items in this cutlist</h3>
         <ul class="cv-ul">${itemLabels.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
      : ""}
    <h3 class="cv-h3">Stock summary</h3>
    <table class="cv-table">
      <thead><tr><th>Material</th><th>Stock</th><th>Size</th><th>Used</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="cv-sub">Total stock pieces: ${cutList.totalStock}</p>
  </div>`;
}

export function renderMaterialSection(
  m: MaterialCutList,
  fmt: Fmt,
  mode: RenderMode,
): string {
  if (m.kind === "sheet") {
    if (m.sheetBins.length === 0) return "";
    return m.sheetBins
      .map((b, i) =>
        renderSheetPage(m.materialName, i + 1, m.sheetBins.length, b, fmt, mode),
      )
      .join("");
  }
  if (m.boardBins.length === 0) return "";
  return renderBoardSection(m, fmt, mode);
}

export function renderDetailTable(cutList: CutList, fmt: Fmt): string {
  interface Row { label: string; length: number; width: number; qty: number }
  const sections = cutList.byMaterial.map((m) => {
    const acc = new Map<string, Row>();
    if (m.kind === "sheet") {
      for (const b of m.sheetBins) {
        for (const pl of b.placements) {
          const key = `${pl.label}|${pl.w}|${pl.h}`;
          const existing = acc.get(key);
          if (existing) existing.qty++;
          else acc.set(key, {
            label: pl.label,
            length: Math.max(pl.w, pl.h),
            width: Math.min(pl.w, pl.h),
            qty: 1,
          });
        }
      }
    } else {
      for (const b of m.boardBins) {
        for (const c of b.cuts) {
          const key = `${c.label}|${c.length}`;
          const existing = acc.get(key);
          if (existing) existing.qty++;
          else acc.set(key, { label: c.label, length: c.length, width: 0, qty: 1 });
        }
      }
    }
    const list = [...acc.values()].sort((a, b) => b.length - a.length);
    const tbody = list.map((r) => `<tr>
      <td>${escapeHtml(r.label)}</td>
      <td>${escapeHtml(fmt(r.length))}</td>
      <td>${r.width > 0 ? escapeHtml(fmt(r.width)) : "—"}</td>
      <td>${r.qty}</td>
    </tr>`).join("");
    const oversize = m.oversize.length > 0
      ? `<p class="cv-oversize">${m.oversize.length} oversize part${m.oversize.length === 1 ? "" : "s"}: ${m.oversize.map((p) => escapeHtml(p.label)).join(", ")}</p>`
      : "";
    return `<h3 class="cv-h3">${escapeHtml(m.materialName)}</h3>
      ${oversize}
      <table class="cv-table">
        <thead><tr><th>Part</th><th>Length</th><th>Width</th><th>Qty</th></tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;
  }).join("");
  return `<div class="cv-detail"><h3 class="cv-h3">Detail cut table</h3>${sections}</div>`;
}

export function renderSheetBin(
  matName: string,
  num: number,
  total: number,
  bin: SheetBin,
  fmt: Fmt,
  mode: RenderMode,
): string {
  return renderSheetPage(matName, num, total, bin, fmt, mode);
}

/** Just the title row for a sheet — for use outside the zoom/pan SVG. */
export function sheetHeading(matName: string, num: number, total: number): string {
  return `Sheet ${num} of ${total} — ${matName}`;
}

/** "48" × 96" · 89% used · 4 pieces" subtitle string. */
export function sheetSubtitle(bin: SheetBin, fmt: Fmt): string {
  const area = bin.sheetWidth * bin.sheetLength;
  const usagePct = area > 0 ? (bin.usedArea / area) * 100 : 0;
  return `${fmt(bin.sheetWidth)} × ${fmt(bin.sheetLength)}  ·  ${usagePct.toFixed(0)}% used  ·  ${bin.placements.length} piece${bin.placements.length === 1 ? "" : "s"}`;
}

/** Just the SVG for a sheet bin, no header/subtitle. Used inside the zoom
 *  wrapper on screen so only the diagram pans/scales. */
export function renderSheetSvg(
  bin: SheetBin,
  fmt: Fmt,
  mode: RenderMode,
): string {
  const scale = Math.min(PAGE_W / bin.sheetWidth, SVG_H / bin.sheetLength);
  const svgW = bin.sheetWidth * scale;
  const svgH = bin.sheetLength * scale;
  const pieces = bin.placements.map((pl) => {
    const x = pl.x * scale;
    const y = pl.y * scale;
    const w = pl.w * scale;
    const h = pl.h * scale;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const lineH = Math.min(0.18, h * 0.3);
    const fontSize = Math.max(0.08, Math.min(0.16, Math.min(w, h) * 0.22));
    const dims = `${fmt(pl.w)} × ${fmt(pl.h)}${pl.rotated ? " ↻" : ""}`;
    return `<g>
      <rect class="cv-piece" x="${x}" y="${y}" width="${w}" height="${h}" />
      <text class="cv-piece-label" x="${cx}" y="${cy - lineH / 2}" font-size="${fontSize}">${escapeHtml(pl.label)}</text>
      <text class="cv-piece-label" x="${cx}" y="${cy + lineH / 2}" font-size="${fontSize}">${escapeHtml(dims)}</text>
    </g>`;
  }).join("");
  const sizeAttrs = mode === "print"
    ? `width="${svgW}in" height="${svgH}in"`
    : `width="100%" preserveAspectRatio="xMidYMid meet"`;
  return `<svg viewBox="0 0 ${svgW} ${svgH}" ${sizeAttrs} xmlns="http://www.w3.org/2000/svg">
      <rect class="cv-sheet" x="0" y="0" width="${svgW}" height="${svgH}" />
      ${pieces}
    </svg>`;
}

export function renderBoardMaterial(
  m: MaterialCutList,
  fmt: Fmt,
  mode: RenderMode,
): string {
  if (m.kind !== "board" || m.boardBins.length === 0) return "";
  return renderBoardSection(m, fmt, mode);
}

function renderSheetPage(
  matName: string,
  num: number,
  total: number,
  bin: SheetBin,
  fmt: Fmt,
  mode: RenderMode,
): string {
  const scale = Math.min(PAGE_W / bin.sheetWidth, SVG_H / bin.sheetLength);
  const svgW = bin.sheetWidth * scale;
  const svgH = bin.sheetLength * scale;
  const usagePct = bin.sheetWidth * bin.sheetLength > 0
    ? (bin.usedArea / (bin.sheetWidth * bin.sheetLength)) * 100
    : 0;
  // All sizes below are in *user-space units* matching the viewBox (where
  // 1 unit = 1 inch of printed paper). We pass them as plain numbers — using
  // CSS units like `0.13in` here gets resolved against the viewport (96px/in)
  // rather than the viewBox scale, which catastrophically mis-sizes labels
  // when the SVG is stretched to 100% column width.
  const pieces = bin.placements.map((pl) => {
    const x = pl.x * scale;
    const y = pl.y * scale;
    const w = pl.w * scale;
    const h = pl.h * scale;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const lineH = Math.min(0.18, h * 0.3);
    const fontSize = Math.max(0.08, Math.min(0.16, Math.min(w, h) * 0.22));
    const dims = `${fmt(pl.w)} × ${fmt(pl.h)}${pl.rotated ? " ↻" : ""}`;
    return `<g>
      <rect class="cv-piece" x="${x}" y="${y}" width="${w}" height="${h}" />
      <text class="cv-piece-label" x="${cx}" y="${cy - lineH / 2}" font-size="${fontSize}">${escapeHtml(pl.label)}</text>
      <text class="cv-piece-label" x="${cx}" y="${cy + lineH / 2}" font-size="${fontSize}">${escapeHtml(dims)}</text>
    </g>`;
  }).join("");
  const sizeAttrs = mode === "print"
    ? `width="${svgW}in" height="${svgH}in"`
    : `width="100%" preserveAspectRatio="xMidYMid meet" style="max-height:520px;max-width:100%"`;
  const wrapClass = mode === "print" ? "cv-page cv-sheet-page" : "cv-block cv-sheet-block";
  return `<section class="${wrapClass}">
    <h3 class="cv-h3">Sheet ${num} of ${total} — ${escapeHtml(matName)}</h3>
    <div class="cv-sub">${escapeHtml(fmt(bin.sheetWidth))} × ${escapeHtml(fmt(bin.sheetLength))} &nbsp;·&nbsp; ${usagePct.toFixed(0)}% used &nbsp;·&nbsp; ${bin.placements.length} piece${bin.placements.length === 1 ? "" : "s"}</div>
    <svg viewBox="0 0 ${svgW} ${svgH}" ${sizeAttrs} xmlns="http://www.w3.org/2000/svg">
      <rect class="cv-sheet" x="0" y="0" width="${svgW}" height="${svgH}" />
      ${pieces}
    </svg>
  </section>`;
}

function renderBoardSection(
  m: MaterialCutList,
  fmt: Fmt,
  mode: RenderMode,
): string {
  const strips = m.boardBins
    .map((b, i) => renderBoardStrip(b, i + 1, fmt))
    .join("");
  const wrapClass = mode === "print" ? "cv-page" : "cv-block";
  return `<section class="${wrapClass}">
    <h3 class="cv-h3">${escapeHtml(m.materialName)} — ${m.boardBins.length} board${m.boardBins.length === 1 ? "" : "s"}</h3>
    <div class="cv-sub">${escapeHtml(m.boardBins[0]?.nominal ?? "")} × ${escapeHtml(m.boardBins[0] ? fmt(m.boardBins[0].stockLength) : "")}</div>
    ${strips}
  </section>`;
}

function renderBoardStrip(bin: BoardBin, num: number, fmt: Fmt): string {
  let xPct = 0;
  const segs = bin.cuts.map((c) => {
    const widthPct = (c.length / bin.stockLength) * 100;
    const seg = `<div class="cv-board-seg" style="left:${xPct.toFixed(3)}%;width:${widthPct.toFixed(3)}%;">${escapeHtml(c.label)} — ${escapeHtml(fmt(c.length))}</div>`;
    xPct += widthPct;
    return seg;
  }).join("");
  const leftoverPct = Math.max(0, 100 - xPct);
  const leftover = leftoverPct > 0
    ? `<div class="cv-board-leftover" style="left:${xPct.toFixed(3)}%;width:${leftoverPct.toFixed(3)}%;">leftover ${escapeHtml(fmt(bin.leftover))}</div>`
    : "";
  return `<div class="cv-board-label">Board ${num} — ${escapeHtml(fmt(bin.used))} used, ${escapeHtml(fmt(bin.leftover))} leftover</div>
    <div class="cv-board-strip">${segs}${leftover}</div>`;
}

function describeStock(m: MaterialCutList, fmt: Fmt): string {
  if (m.kind === "sheet" && m.sheetBins.length > 0) {
    return `${escapeHtml(fmt(m.sheetBins[0].sheetWidth))} × ${escapeHtml(fmt(m.sheetBins[0].sheetLength))}`;
  }
  if (m.kind === "board" && m.boardBins.length > 0) {
    return `${escapeHtml(m.boardBins[0].nominal)} × ${escapeHtml(fmt(m.boardBins[0].stockLength))}`;
  }
  return "—";
}

function computeUsagePct(m: MaterialCutList): number | null {
  if (m.kind === "sheet" && m.sheetBins.length > 0) {
    const total = m.sheetBins.reduce((s, b) => s + b.sheetWidth * b.sheetLength, 0);
    const used = m.sheetBins.reduce((s, b) => s + b.usedArea, 0);
    return total > 0 ? (used / total) * 100 : null;
  }
  if (m.kind === "board" && m.boardBins.length > 0) {
    const total = m.boardBins.reduce((s, b) => s + b.stockLength, 0);
    const used = m.boardBins.reduce((s, b) => s + b.used, 0);
    return total > 0 ? (used / total) * 100 : null;
  }
  return null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** CSS shared by print + screen. Classes are namespaced `cv-` so they don't
 *  collide with the app's normal styles when rendered inline. */
export const CUTLIST_VISUAL_CSS = `
.cv-h3 { font-size: 12pt; margin: 12pt 0 4pt; }
.cv-sub { color: #555; font-size: 10pt; margin-bottom: 6pt; }
.cv-ul { margin: 0 0 8pt 16pt; padding: 0; }
.cv-table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
.cv-table th, .cv-table td { text-align: left; padding: 3pt 6pt; border-bottom: 1px solid #ccc; font-size: 10pt; }
.cv-table th { background: #f0f0f0; }
.cv-sheet { fill: #fff; stroke: #555; stroke-width: 0.01; }
.cv-piece { fill: #e6d8b5; stroke: #6b5a30; stroke-width: 0.01; }
.cv-piece-label { font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; text-anchor: middle; dominant-baseline: middle; fill: #222; }
.cv-sheet-block, .cv-block, .cv-detail, .cv-summary { background: #f4f1ea; padding: 12px; border-radius: 6px; margin-bottom: 12px; color: #222; }
.cv-sheet-block .cv-h3, .cv-block .cv-h3, .cv-detail .cv-h3, .cv-summary .cv-h3 { color: #222; margin-top: 0; }
.cv-sheet-block .cv-sub, .cv-block .cv-sub, .cv-detail .cv-sub, .cv-summary .cv-sub { color: #555; }
.cv-board-label { font-size: 10pt; margin: 8pt 0 2pt; }
.cv-board-strip { display: block; width: 100%; height: 36pt; border: 1px solid #6b5a30; margin-bottom: 4pt; position: relative; background: #fff; }
.cv-board-seg { position: absolute; top: 0; bottom: 0; border-right: 1px dashed #444; background: #e6d8b5; display: flex; align-items: center; justify-content: center; font-size: 9pt; color: #222; overflow: hidden; }
.cv-board-leftover { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(45deg, #fff, #fff 3px, #eee 3px, #eee 6px); display: flex; align-items: center; justify-content: center; font-size: 8pt; color: #666; }
.cv-oversize { color: #a00; font-weight: 600; }
.cv-sheet-block svg { display: block; margin: 0 auto; }
`;
