import type { CutList } from "../cutlist";
import { formatLength } from "../domain/measure";
import type { Units } from "../domain/types";
import {
  CUTLIST_VISUAL_CSS,
  escapeHtml,
  renderDetailTable,
  renderMaterialSection,
  renderSummarySection,
} from "./cutlistVisual";
import type { PartPocketGroup } from "../pockets/byPart";
import {
  POCKET_VISUAL_CSS,
  partHeading as pocketPartHeading,
  partSubtitle as pocketPartSubtitle,
  renderPartSvg as renderPocketPartSvg,
} from "./pocketVisual";

interface OpenArgs {
  projectName: string;
  cutList: CutList;
  itemLabels: string[];
  unitsLabel: Units;
  pocketGroups?: PartPocketGroup[];
}

/** Open a same-origin window with the print-styled cutlist document. The user
 *  uses the browser's own Save-as-PDF from the print dialog (Cmd/Ctrl-P). */
export function openCutlistPrintWindow(args: OpenArgs): void {
  const html = renderCutlistHtml(args);
  const w = window.open("", "_blank");
  if (!w) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank") ?? (window.location.href = url);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function renderCutlistHtml(args: OpenArgs): string {
  const { projectName, cutList, itemLabels, unitsLabel, pocketGroups } = args;
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (n: number) => formatLength(n, unitsLabel);

  const summary = `<section class="cv-page">
    <div class="print-actions">Press Cmd/Ctrl-P to save as PDF</div>
    <h1>Cutlist — ${escapeHtml(projectName)}</h1>
    <div class="cv-sub">${escapeHtml(today)}</div>
    ${renderSummarySection(itemLabels, cutList, fmt)}
  </section>`;
  const layouts = cutList.byMaterial
    .map((m) => renderMaterialSection(m, fmt, "print"))
    .join("");
  const table = `<section class="cv-page">${renderDetailTable(cutList, fmt)}</section>`;

  const pocketPages = pocketGroups && pocketGroups.length > 0
    ? `<section class="cv-page"><h2>Pocket holes</h2>${pocketGroups
        .map((g) => `<div class="pv-print-block">
          <h3 class="pv-h3">${escapeHtml(pocketPartHeading(g))}</h3>
          <div class="pv-sub">${escapeHtml(pocketPartSubtitle(g, fmt))}</div>
          ${renderPocketPartSvg(g, fmt, "print")}
        </div>`)
        .join("")}</section>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cutlist — ${escapeHtml(projectName)}</title>
  <style>${PRINT_FRAME_CSS}${CUTLIST_VISUAL_CSS}${POCKET_VISUAL_CSS}${PRINT_POCKET_CSS}</style>
</head>
<body>
  ${summary}
  ${layouts}
  ${table}
  ${pocketPages}
</body>
</html>`;
}

const PRINT_POCKET_CSS = `
.pv-print-block { background: transparent !important; padding: 0 !important; margin-bottom: 24pt; page-break-inside: avoid; }
.pv-print-block .pv-h3 { color: #222 !important; }
`;

const PRINT_FRAME_CSS = `
@page { size: letter portrait; margin: 0.5in; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: #111;
  font-size: 11pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.cv-page { page-break-after: always; padding: 0; }
.cv-page:last-child { page-break-after: auto; }
h1 { font-size: 18pt; margin: 0 0 4pt; }
.print-actions { position: fixed; top: 8px; right: 8px; background: #222; color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; }
/* In the print window only the .cv-page wrapper is used (not .cv-block /
 * .cv-sheet-block), so the card backgrounds defined for screen never appear
 * on paper. Explicit override here keeps it that way even if classnames are
 * ever crossed. */
.cv-block, .cv-sheet-block, .cv-detail, .cv-summary { background: transparent !important; padding: 0 !important; border-radius: 0 !important; margin-bottom: 0 !important; }
@media print { .print-actions { display: none; } }
`;
