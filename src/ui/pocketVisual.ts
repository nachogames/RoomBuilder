/**
 * Per-part drilling cards: render the part as a top-down 2D rectangle
 * with pocket-hole markers in the right places, dim leaders to the
 * nearer end of each edge, and the Kreg setting per edge group.
 *
 * Same pattern as cutlistVisual: HTML string outputs so the same
 * markup can render inline (screen) and inside the print window.
 */
import type { EdgeHoles, PartPocketGroup } from "../pockets/byPart";

export type RenderMode = "screen" | "print";
type Fmt = (n: number) => string;

const PAGE_W = 7.5;
const PAGE_H = 8;     // pocket cards are wider/shorter than sheet pages
const HOLE_R = 0.12;  // marker radius in user-space inches
const LABEL_FS = 0.18;

export function partHeading(g: PartPocketGroup): string {
  return g.partLabel;
}

export function partSubtitle(g: PartPocketGroup, fmt: Fmt): string {
  const dims = `${fmt(g.partLength)} × ${fmt(g.partWidth)} × ${fmt(g.partThickness)}`;
  const totalHoles = g.edges.reduce((n, e) => n + e.holes.length, 0);
  return `${dims}  ·  ${totalHoles} pocket hole${totalHoles === 1 ? "" : "s"} across ${g.edges.length} edge${g.edges.length === 1 ? "" : "s"}`;
}

export function renderPartSvg(
  g: PartPocketGroup,
  fmt: Fmt,
  mode: RenderMode,
): string {
  // Scale part inches → user-space units. We reserve a margin around the
  // part for dim leaders and edge labels (about 1.2" each way).
  const margin = 1.2;
  const vbW = g.partLength + margin * 2;
  const vbH = g.partWidth + margin * 2;
  const scale = Math.min(PAGE_W / vbW, PAGE_H / vbH);
  const svgW = vbW * scale;
  const svgH = vbH * scale;

  // The part rect sits inside the viewBox, offset by `margin` on each
  // side so dim leaders have room.
  const x0 = margin;
  const y0 = margin;
  const x1 = margin + g.partLength;
  const y1 = margin + g.partWidth;

  const partRect = `<rect class="pv-part" x="${x0}" y="${y0}" width="${g.partLength}" height="${g.partWidth}" />`;

  // For each edge group, place holes and dim leaders.
  const edgeMarkup = g.edges
    .map((e) => renderEdge(e, g.partLength, g.partWidth, x0, y0, x1, y1, fmt))
    .join("");

  // Settings panel (one line per edge with its Kreg jig info).
  const settings = g.edges
    .map((e) => {
      const s = e.setting;
      return `<tspan x="${x0}" dy="${LABEL_FS * 1.4}">${escapeHtml(e.mateLabel)}: jig ${escapeHtml(s.guideSetting)}, ${escapeHtml(fmt(s.screwLength))} ${escapeHtml(s.screwType)} × ${e.holes.length}</tspan>`;
    })
    .join("");
  const settingsText = `<text class="pv-edge-label" x="${x0}" y="${y1 + margin * 0.4}" font-size="${LABEL_FS}">${settings}</text>`;

  const sizeAttrs = mode === "print"
    ? `width="${svgW}in" height="${svgH}in"`
    : `width="100%" preserveAspectRatio="xMidYMid meet"`;

  return `<svg viewBox="0 0 ${vbW} ${vbH}" ${sizeAttrs} xmlns="http://www.w3.org/2000/svg">
    ${partRect}
    ${edgeMarkup}
    ${settingsText}
  </svg>`;
}

function renderEdge(
  e: EdgeHoles,
  partLength: number,
  partWidth: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fmt: Fmt,
): string {
  // Determine which edge of the part rect this group is on, and the
  // axis-aligned (perpendicular) inset direction.
  // The edge length is `e.edgeLength`. Hole positions are 0..edgeLength
  // measured from one end. We anchor "0" at the lower-coord end of the
  // edge for left/right (y=0 end) and at the lower-coord end (x=0) for
  // top/bottom edges.
  const inset = Math.min(0.6, Math.min(partLength, partWidth) * 0.1);

  let markers = "";
  let leaders = "";

  if (e.edge === "left" || e.edge === "right") {
    const edgeX = e.edge === "left" ? x0 : x1;
    const holeX = e.edge === "left" ? edgeX + inset : edgeX - inset;
    const edgeY0 = y0;
    for (const h of e.holes) {
      const hy = edgeY0 + h;
      // The dim is to the nearer end of the edge.
      const nearTop = h <= e.edgeLength / 2;
      const dim = nearTop ? h : e.edgeLength - h;
      const labelY = nearTop ? y0 - 0.15 : y1 + 0.15;
      const anchorY = nearTop ? y0 : y1;
      markers += `<circle class="pv-hole" cx="${holeX}" cy="${hy}" r="${HOLE_R}" />`;
      leaders += `<line class="pv-leader" x1="${holeX}" y1="${hy}" x2="${holeX}" y2="${anchorY}" />`;
      leaders += `<text class="pv-dim" x="${holeX + 0.1}" y="${labelY}" font-size="${LABEL_FS * 0.85}" dominant-baseline="${nearTop ? "auto" : "hanging"}">${escapeHtml(fmt(dim))}</text>`;
    }
  } else if (e.edge === "top-edge" || e.edge === "bottom-edge") {
    const edgeY = e.edge === "bottom-edge" ? y0 : y1;
    const holeY = e.edge === "bottom-edge" ? edgeY + inset : edgeY - inset;
    const edgeX0 = x0;
    for (const h of e.holes) {
      const hx = edgeX0 + h;
      const nearLeft = h <= e.edgeLength / 2;
      const dim = nearLeft ? h : e.edgeLength - h;
      const labelX = nearLeft ? x0 - 0.15 : x1 + 0.15;
      const anchorX = nearLeft ? x0 : x1;
      markers += `<circle class="pv-hole" cx="${hx}" cy="${holeY}" r="${HOLE_R}" />`;
      leaders += `<line class="pv-leader" x1="${hx}" y1="${holeY}" x2="${anchorX}" y2="${holeY}" />`;
      leaders += `<text class="pv-dim" x="${labelX}" y="${holeY + 0.05}" font-size="${LABEL_FS * 0.85}" text-anchor="${nearLeft ? "end" : "start"}">${escapeHtml(fmt(dim))}</text>`;
    }
  }

  return markers + leaders;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const POCKET_VISUAL_CSS = `
.pv-block { background: #f4f1ea; padding: 12px; border-radius: 6px; margin-bottom: 12px; color: #222; }
.pv-block .pv-h3 { color: #222; margin: 0 0 4pt; font-size: 12pt; }
.pv-block .pv-sub { color: #555; font-size: 10pt; margin-bottom: 8pt; }
.pv-part { fill: #fff; stroke: #5a4a26; stroke-width: 0.04; }
.pv-hole { fill: #111; }
.pv-leader { stroke: #888; stroke-width: 0.015; stroke-dasharray: 0.06 0.06; }
.pv-dim { font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; fill: #444; }
.pv-edge-label { font-family: -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; fill: #222; dominant-baseline: hanging; }
`;
