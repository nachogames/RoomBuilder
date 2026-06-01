# Pocket hole visual on the Pocket plan tab

A per-part drilling guide for pocket-screw joinery: each part that needs
drilling gets a card with the part drawn to scale, pocket holes marked at
their actual positions on the correct edges, and a dim leader from each
hole to the nearest end. Lives in the existing Pocket plan tab (above the
existing flat table) and also prints into the same PDF as the cutlist.

## Problem

The current Pocket plan tab is a flat row-per-joint table. At the workshop
you cut a part, then drill its pocket holes — but the table tells you
*joints*, not *parts*. To drill a single shelf you mentally aggregate
multiple table rows and figure out which edge each hole group goes on.

## Goals

1. For each part that has any pocket-screw joints, show one card with the
   part drawn to scale and every pocket-hole position marked on the
   correct edge.
2. Each hole gets a leader line + dim text to the nearer end of its edge,
   so the user can mark the wood with a tape measure.
3. Each edge group is labeled with the joint mate ("into Left side") and
   the Kreg setting (jig, collar, screw).
4. Selection-aware, like the cutlist: only parts whose `carcassId` is in
   the current selection show up.
5. Appears in the printable PDF after the cutlist's detail table.
6. Existing per-joint table stays below the cards as a reference.

## Non-goals

- No 3D visualisation. Top-down 2D part outline only.
- No editing of hole positions or jig settings.
- No CNC export, no DXF.
- No assembly-order inference (separate feature).

## Architecture

### Data model change

Add one optional field to `Joint` in `src/geometry/types.ts`:

```ts
export type DrilledEdge = "left" | "right" | "top-edge" | "bottom-edge";

export interface Joint {
  // ...existing fields...
  drilledEdge?: DrilledEdge;
}
```

**Edge convention** (matches the existing `Part` axes — length along x,
width along z, thickness along y):

- `"left"`        : the x=0 edge of the drilled part
- `"right"`       : the x=length edge
- `"bottom-edge"` : the z=0 edge
- `"top-edge"`    : the z=width edge

Carcass joint construction in `src/geometry/carcass.ts` sets the field
on every joint that already sets `drilledPartId`:

| Joint                       | drilledPartId | drilledEdge   |
|-----------------------------|---------------|---------------|
| Top to left side            | top           | `left`        |
| Top to right side           | top           | `right`       |
| Bottom to left side         | bottom        | `left`        |
| Bottom to right side        | bottom        | `right`       |
| Toe kick to left side       | toe-kick      | `left`        |
| Toe kick to right side      | toe-kick      | `right`       |
| Shelf (pocket) to left side | shelf         | `left`        |
| Shelf (pocket) to right side| shelf         | `right`       |

(For top/bottom/kick/shelf parts, length = carcass interior width W, so
the "left" edge of the part meets the left side of the carcass.)

Backwards-compatible: `drilledEdge` is optional so existing serialized
projects parse fine; groups without it fall back to a degenerate
"unspecified" edge that the renderer just labels as the joint name with
no diagram for that group (rare in practice — the user just regenerates
geometry by editing the carcass).

### Grouping by part

New pure module `src/pockets/byPart.ts`:

```ts
export interface EdgeHoles {
  edge: DrilledEdge;
  edgeLength: Inches;
  holes: Inches[];          // positions from one end of the edge
  jointId: string;
  jointLabel: string;
  mateLabel: string;        // e.g. "Left side"
  setting: KregSetting;
}

export interface PartPocketGroup {
  partId: string;
  partLabel: string;
  partLength: Inches;       // along x
  partWidth: Inches;        // along z
  partThickness: Inches;
  edges: EdgeHoles[];
}

export function groupPocketsByPart(
  plan: PocketPlanEntry[],
  joints: Joint[],
  parts: Part[],
): PartPocketGroup[];
```

The function joins on `jointId`, looks up the part and joint, derives
`mateLabel` from the non-drilled member's `partId` → that part's label.
Output is sorted: longest part first, then by label, for stable rendering.

### Visual renderer

New `src/ui/pocketVisual.ts`, same pattern as `cutlistVisual.ts`:

```ts
export type RenderMode = "screen" | "print";

export function partHeading(g: PartPocketGroup): string;        // DOM heading
export function partSubtitle(g: PartPocketGroup, fmt: Fmt): string;
export function renderPartSvg(g: PartPocketGroup, fmt: Fmt, mode: RenderMode): string;
export const POCKET_VISUAL_CSS: string;
```

**Drawing rules** (all in SVG user-space units = inches, matching the
cutlist convention — keeps the scale-arithmetic identical):

- Part rect drawn from `(0,0)` to `(length, width)` in the SVG's
  inches-coordinate viewBox.
- For each edge group, pocket-hole markers placed along the edge:
  - Position along edge axis = `edgeLength - hole` or `hole` depending
    on which end of the edge the hole positions are measured from (the
    existing `holePositions(edgeLength)` returns positions from one end;
    we use that end as the "near" anchor).
  - Inset perpendicular to the edge by `min(0.75, partWidth*0.1)` inches
    so the marker sits visibly inside the part outline rather than on
    the boundary.
  - Marker = filled black circle, radius = 0.18 user-units (≈3/16″).
- Leader line + dimension text from each marker to the nearer end of its
  edge. Dim text formatted via existing `formatLength`.
- Per-edge label drawn near the relevant edge ("→ into Left side  ·  Jig
  ¾″, 1¼″ coarse"), in user-units font-size (`font-size="0.16"`).
- `mode: "screen"` → `width="100%"` preserveAspectRatio; `mode: "print"`
  → `width="<N>in" height="<N>in"` for 1:1 paper scale (same as the
  cutlist).

The same scale formula `min(PAGE_W / partLength, SVG_H / partWidth)` is
used so multi-page parts size consistently.

### UI wiring

`src/ui/App.tsx`, Pocket plan tab:

```tsx
{tab === "Pocket plan" && (
  <div className="report">
    <style>{POCKET_VISUAL_CSS}</style>
    {selectedPocketGroups.length === 0 ? (
      <p className="label">
        Select items in the 3D scene to see drilling cards.
      </p>
    ) : (
      <>
        <h3>Drilling guide</h3>
        {selectedPocketGroups.map(g => (
          <div key={g.partId} className="pv-block">
            <h4 className="pv-h3">{partHeading(g)}</h4>
            <div className="pv-sub">{partSubtitle(g, fmtFn)}</div>
            <ZoomPan html={renderPartSvg(g, fmtFn, "screen")} />
          </div>
        ))}
      </>
    )}
    <h3>Per-joint table</h3>
    {/* existing per-joint table, unchanged */}
  </div>
)}
```

`selectedPocketGroups` is a new `useMemo` that:
1. computes `groupPocketsByPart(derived.pocketPlan, derived.joints, derived.parts)`
2. filters to parts whose `carcassId` is in `selectionIds`
3. returns `[]` when selection is empty.

### Printable view

`src/ui/printWindow.ts` accepts a new optional arg
`pocketGroups: PartPocketGroup[]`. When non-empty, after the cutlist's
detail-table section, append a new `<section class="cv-page">` per
group (or several per page if they fit), with `mode: "print"` SVG so the
diagram prints at 1:1 scale.

The Cut list tab's "Open printable view" button passes
`selectedPocketGroups` through. The user gets one PDF that includes
both cutlist and pocket-hole guides.

## Error handling

- A `Joint` with `drilledPartId` set but no `drilledEdge` (legacy data):
  the group is included but the edge renders with no markers, only a
  "drilledEdge unknown — regenerate geometry to fix" label. The
  per-joint table still shows the row as before, so nothing is lost.
- A `Joint` whose `drilledPartId` doesn't resolve to a part: skipped,
  same as current `buildPocketPlan` behavior.
- Empty selection: empty state, no print button next to it (the print
  button on the Cut list tab is the single entry point).

## Tests

- `src/pockets/byPart.test.ts`:
  - Default bookcase produces the expected groups (top with 2 edges,
    bottom with 2 edges, shelves each with 2 edges, toe-kick if
    present). Verify counts and that edges are sorted in a stable way.
  - A part with one pocket-screw joint and one non-pocket joint shows
    only one edge group.
  - Mate labels are correctly resolved ("Left side", "Right side").

- `src/ui/pocketVisual.test.ts`:
  - Snapshot the SVG output for a small fixture (a single top with two
    edges of two holes each). Locks scale math + label positions.

- Existing `pockets/plan.test.ts` and `cutlist.test.ts` untouched.

## Files

**New:**

- `src/pockets/byPart.ts`
- `src/pockets/byPart.test.ts`
- `src/ui/pocketVisual.ts`
- `src/ui/pocketVisual.test.ts`

**Modified:**

- `src/geometry/types.ts` (add `DrilledEdge`, `Joint.drilledEdge?`)
- `src/geometry/carcass.ts` (set `drilledEdge` per joint)
- `src/ui/App.tsx` (Pocket plan tab cards + selection filter)
- `src/ui/printWindow.ts` (append pocket section when groups present)

## Open question

None — all answered in brainstorming:
- Per-part cards (not per-joint).
- Single outline showing every edge's holes.
- Dim leader from each hole to the nearest end.
- Cards above the existing table, table preserved.
- Appended to the same printable PDF as the cutlist.
- `Joint.drilledEdge` added rather than derived at render time.
