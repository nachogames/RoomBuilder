# Cutlist selection and printable view

Lets the user pick which buildable items become the cutlist, and renders the cutlist as a printable visual document (sheet/board layouts + summary + detail table) suitable for "Save as PDF" from the browser print dialog.

## Problem

Today the cutlist runs over *every* part the project produces. The user only wants a cutlist for the things they will actually cut and build — typically bookcases, runners, and supports — and wants to take the result to the table saw / lumberyard as a printable document with diagrams.

## Goals

1. Pick which scene items contribute to the cutlist via multi-selection in the existing 3D scene (Cmd/Ctrl-click).
2. A dedicated **Cutlist** tab whose contents reflect the current selection.
3. A **Printable view** of the cutlist that:
   - opens in a new window/tab styled for US Letter portrait,
   - leads with a one-page stock summary,
   - shows one page per sheet of stock with the packed pieces drawn to scale, labels + dimensions inside each piece, kerf visible as a thin gap,
   - shows boards as horizontal strips (one strip per stock piece, multiple per page),
   - ends with a detail cut table grouped by material,
   - is produced as a PDF by the user via the browser print dialog (Cmd/Ctrl-P → Save as PDF). No PDF library dependency.

## Non-goals

- No rectangle-marquee selection (Cmd/Ctrl-click only).
- No new packing/nesting algorithms — uses the existing `src/cutlist` engine.
- No in-app PDF generator (no jsPDF/pdf-lib).
- No editing of which parts a scene item produces. Container = all-or-nothing.
- No selection of non-buildable items (totes, person figure, etc.) into the cutlist. Those items remain selectable in the scene for inspection, but contribute zero parts.

## User flow

1. In the 3D scene, user clicks a bookcase → it is the sole selection (current behavior).
2. Cmd/Ctrl-click another bookcase → both are selected, both highlighted.
3. Cmd/Ctrl-click a runner → added to selection.
4. Cmd/Ctrl-click an already-selected item → removed.
5. Plain click on empty space → selection cleared.
6. User switches to **Cutlist** tab.
   - Empty selection → empty-state copy: *"Select items in the 3D scene to build a cutlist."*
   - Non-empty → live cutlist: stock summary, per-material totals, and a **Open printable view** button.
7. Clicking **Open printable view** opens a new browser window/tab with the print-styled document. User hits Cmd/Ctrl-P, picks "Save as PDF" and a paper size of Letter portrait.

## Architecture

### Selection (new module)

`src/scene/selection.ts`

```ts
export type Selection = ReadonlySet<string>;

export function emptySelection(): Selection;
export function toggle(sel: Selection, id: string): Selection;
export function replace(id: string | null): Selection;  // null = clear
export function serialize(sel: Selection): string;       // comma-joined for viewState
export function deserialize(s: string | undefined): Selection;
```

Pure functions, no React. Tested in isolation.

A React hook `useSelection()` in `src/scene/useSelection.ts` wraps `useState<Selection>` plus a setter API matching the pure functions, and is what App and Scene consume.

### View state

`src/ui/viewState.ts` already has a `sel?: string` field. Change semantics:

- Reads: comma-joined ID list. A single-ID old value stays valid (one-element selection).
- Writes: `serialize(currentSelection)`.

No version bump needed because the value remains a string.

### Scene click wiring

`src/scene/Scene.tsx` currently calls `onSelect(id)`. New signature:

```ts
onSelect(id: string | null, modifiers: { toggle: boolean })
```

- `id === null` → background click → `replace(null)`.
- `modifiers.toggle === true` → `toggle(sel, id)`.
- otherwise → `replace(id)`.

The toggle flag is derived from the pointer event: `event.metaKey || event.ctrlKey`.

Visual highlight: the existing outline renderer takes a single `selectedId`. Change it to take `selectedIds: Set<string>` and render the outline for every member.

### Inspector compatibility

Current right-side inspector pulls `selected = project.carcasses.find(c => c.id === sel)`. Behavior when the selection has multiple members:

- If selection size is **1** → inspector behaves exactly as today.
- If selection size is **>1** → inspector shows: *"N items selected — open the Cutlist tab to see the combined parts list."* Editing fields are hidden.
- If selection size is **0** → inspector is hidden (already the case for unknown IDs).

This keeps the existing single-item editing UX intact and avoids designing a multi-edit panel.

### Cutlist tab

New tab value `"cutlist"` in `viewState.tab`. The existing tab strip in `App.tsx` gets a new entry.

`src/ui/CutlistTab.tsx` (new):

- Reads selection and project.
- Computes selected parts: `g.parts.filter(p => selection.has(p.carcassId))`.
  - This relies on the existing invariant that every Part is tagged with the `carcassId` of the scene item that owns it (true for both carcasses and runners today).
- Calls `buildCutList(selectedParts, project.catalog)`.
- Renders:
  - Header: count of selected items and a list of their labels.
  - Per-material summary cards: material name, stock count, % used.
  - A `<button>` **Open printable view**.
  - Empty state when selection is empty.

### Printable view

`src/ui/CutlistPrintView.tsx` (new) — a self-contained React component that renders the full printable document. It is mounted in a **new window** opened by the Cutlist tab:

- Clicking **Open printable view** calls `window.open("", "_blank")`, writes a minimal HTML shell into the new document, and uses `ReactDOM.createRoot` to mount `CutlistPrintView` inside it. The project + selection are passed via props in the same React tree (no postMessage / no serialization).
- The new window shares the parent React tree's module instances because it's same-origin; we mount a fresh root with its own provider tree.

Why a new window instead of an in-app printable mode: keeps the user's working scene untouched and avoids fighting the app's CSS for the print stylesheet.

The component renders four logical sections, in order:

1. **Summary page** — title (project name + date), per-material table (material, stock pieces required, sheet size or board length, % used, oversize warnings).
2. **Sheet layouts** — one page per `SheetBin` from `MaterialCutList.sheetBins`. Each page:
   - Heading: `"Sheet n of N — {material name}"` and dimensions.
   - SVG drawn to scale. Each placement rendered as a `<rect>` with the part's label and dims (`length"×width"`, formatted via the existing `formatLength` from `src/domain/measure.ts`) centered inside. Kerf is shown as the actual gap between rects (the packing already accounts for kerf in `x/y` coords, so no extra math is needed).
3. **Board layouts** — for each `MaterialCutList` with `boardBins`, group them by nominal stock length and render as horizontal strips. Each strip is one stick of stock; cuts are colored segments with the part label and length printed inside. Multiple sticks stack vertically per page. Page break after each material.
4. **Detail table** — last page(s). One row per unique part description (label, L"×W", thickness, qty), grouped by material. Footer: total stock counts.

#### Print CSS

`src/ui/cutlist-print.css` (new), loaded only into the print window's document:

```css
@page { size: letter portrait; margin: 0.5in; }
body { font-family: Helvetica, Arial, sans-serif; color: #111; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
.sheet-svg { width: 100%; height: auto; }
.piece-label { font-size: 9pt; text-anchor: middle; dominant-baseline: middle; }
.summary-table { width: 100%; border-collapse: collapse; }
.summary-table th, .summary-table td { border-bottom: 1px solid #999; padding: 4px 8px; text-align: left; }
```

#### Scale math (sheet pages)

Available drawing area on letter portrait at 0.5" margin: 7.5" × 10". Reserve 1" for page heading and footer, so SVG region is 7.5" × 9". Scale factor = `min(7.5/sheetWidth, 9/sheetLength)`. Inches in part coords are multiplied by this factor and rendered as a 72 dpi inch (CSS `in` unit) so the rendered SVG matches reality on paper.

### Data flow summary

```
3D Scene click ─► useSelection ─► viewState (persist) ─► CutlistTab
                                                          │
                                                          ▼
                                  selectedParts = g.parts.filter(carcassId ∈ sel)
                                                          │
                                                          ▼
                                              buildCutList(...) (existing)
                                                          │
                                          ┌───────────────┴───────────────┐
                                          ▼                               ▼
                                  in-tab summary UI            CutlistPrintView (new window)
                                                                          │
                                                                          ▼
                                                              user: Cmd-P → Save as PDF
```

## Components / files touched

**New:**
- `src/scene/selection.ts` + `selection.test.ts`
- `src/scene/useSelection.ts`
- `src/ui/CutlistTab.tsx`
- `src/ui/CutlistPrintView.tsx`
- `src/ui/cutlist-print.css`
- `src/ui/printWindow.ts` — helper that opens a same-origin blank window and mounts a React tree into it.

**Modified:**
- `src/scene/Scene.tsx` — click handler emits `(id, { toggle })`; outline renderer takes a Set.
- `src/ui/App.tsx` — replace `[sel, setSel]` with `useSelection`; pass set to Scene; wire new tab; update inspector to handle multi/zero selection.
- `src/ui/viewState.ts` — keep `sel: string`; new helpers route through `selection.ts` serialization.

## Error handling

- **Selection includes non-buildable item** (no parts produced for that `carcassId`) — silently contributes zero parts. Header shows the item's label so the user sees it's selected but the summary section explains *"M of N selected items have no buildable parts."*
- **Empty selection on Cutlist tab** — empty-state copy, no print button.
- **Oversize parts** — already returned by `buildCutList` as `oversize[]`. Render at the top of the per-material section in the printable view with a warning style. Print button stays enabled.
- **`window.open` blocked by popup blocker** — fall back to mounting the print view inline as a modal overlay with a "Print" button that calls `window.print()`. Detect by checking the return value of `window.open`.
- **Old viewState with single ID** — `deserialize` treats it as a one-element set. No migration code needed.

## Testing

- `selection.test.ts` — pure tests for toggle/replace/serialize/deserialize, including the single-ID legacy format.
- `CutlistTab` — unit test that mounting with selection of zero, one, multi yields the expected summary structure (RTL).
- `CutlistPrintView` — snapshot test of the SVG output for a small fixture (one sheet, three parts) to lock the scale math.
- Existing `cutlist.test.ts` tests already cover `buildCutList`; no changes needed there.
- Manual verification:
  - Select 2 bookcases + 1 runner, switch to Cutlist tab, confirm summary numbers match a hand-traced expectation.
  - Open printable view, Cmd-P in browser, save as PDF, confirm the PDF has the expected page count, scale, and labels.

## Open question

None — answered during brainstorming:
- Selection unit = scene items, multi-select via Cmd/Ctrl-click.
- Empty selection = empty state.
- Container parts flow whole.
- Format = summary + visual + detail (option C).
- PDF via browser print dialog.
- Letter portrait.
- Labels show name + dims.
- Kerf drawn as a gap.
- Boards rendered as horizontal strips.
- Cutlist lives in a dedicated tab.
