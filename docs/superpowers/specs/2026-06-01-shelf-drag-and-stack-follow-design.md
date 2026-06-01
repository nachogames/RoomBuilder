# Shelf Drag in 3D + Stack-follow on Y Moves

Date: 2026-06-01

## Goals

Two related features that both touch the 3D viewport + placement resolver:

1. **Adjustable shelves.** Carcasses already store each shelf's `offsetFromBottom`
   individually, but the only way to change them is by changing shelf count
   (which calls `evenlySpacedShelves`). Add a way to move each shelf up/down.
2. **Stack-follow on vertical moves.** When the user raises or lowers an item
   (a runner, a shelf, or a carcass with stuff on top), the items resting on
   it ride along, recursively. Horizontal (X/Z) moves do not carry stacks.

## Stack-follow (Y-only)

### New helper: `dependentsOf(project, id)`

Lives in [src/geometry/stacking.ts](../../src/geometry/stacking.ts).

Returns the **set of entity ids** that are currently resting on the
identified support (a carcass, runner, refBox, or shelf-of-carcass). An
entity X is a dependent of Y when:

- X has a `baseHeight` field, AND
- `|X.baseHeight − Y.objectTop| ≤ 1/64"`, AND
- X's footprint overlaps Y's footprint top.

For a carcass, the relevant tops are the carcass's own top *and* each
shelf's top surface. So a tote sitting on shelf 2 of a bookcase is a
dependent of "carcass-X / shelf 2", not of the carcass overall.

The function returns dependents **transitively**: a tote on a runner on a
shelf returns both the runner and the tote when called on the shelf. A
visited-set guards against pathological cycles.

### Y-delta translation in `resolveDrop`

When the support's `baseHeight` is changing, the resolver:

1. Computes the **pre-move dependents** of the support (so picking up a
   shelf that has totes on it captures the totes before the shelf leaves).
2. Computes `dyDelta = newBaseHeight − oldBaseHeight`.
3. For each dependent, sets `dependent.baseHeight += dyDelta` in the
   returned project. Order doesn't matter — every dependent shifts by the
   same scalar.
4. Skips `snapHeight` on dependents during this pass: they were valid
   before the move and stay attached by construction.

Shelf-tops are addressed by a synthetic id of the form `sh:<carcassId>:<idx>`
so `dependentsOf` and `objectTop` can speak about them uniformly. This id
is internal to the resolver and stacking module; entity selection in the UI
keeps using carcass / runner / refBox / person ids only.

### What "Y move" means

- Carcass / runner / refBox: `baseHeight` changes.
- Shelf (new): `offsetFromBottom` changes on the shelf at index `idx`
  inside its carcass. Converted to an absolute Y delta and applied to
  dependents the same way.

### Out of scope

- Carry along X/Z. User explicitly chose Y-only.
- Ceiling collision when a stack rides upward.
- Re-snapping a dependent that's been raised free of its support (it just
  hovers; user can drag it down).

## Shelf drag in 3D

### Selection model

Today: `sel: string` (entity id).

New: `sel` stays the carcass id. A separate piece of UI state
`subSel: { kind: "shelf"; idx: number } | null` lives next to `sel`,
managed in [src/ui/App.tsx](../../src/ui/App.tsx).

- Clicking the carcass body sets `sel = carcass.id`, `subSel = null`.
- Clicking a shelf inside the carcass sets `sel = carcass.id`,
  `subSel = { kind: "shelf", idx }`.
- Inspector keeps showing the carcass either way.
- Move gizmo binds to the shelf when `subSel.kind === "shelf"`, otherwise
  to the carcass as today.

### Picking shelves

The carcass parts already include shelves (see
[src/geometry/carcass.ts](../../src/geometry/carcass.ts) producing parts with
`role === "shelf"`). The `PartMesh` inside `CarcassGroup` will need
selection-aware `onPointerDown`: for the shelf role, dispatch a shelf
sub-select on the parent carcass; for other roles, fall through to the
existing carcass-select.

The simplest approach: have `CarcassGroup` map over its parts and for
shelf parts, render a wrapper mesh with its own `onPointerDown` that calls
a new `onSelectShelf(carcassId, shelfIndex)` callback prop. Shelf parts
already know their index via the order in `carcass.shelves`.

### Gizmo on a shelf

A shelf can only move vertically inside its carcass interior. The gizmo
shows the Y handle only (`showX/showZ = false` when `subSel.kind === "shelf"`).

The proxy approach already in place for the main gizmo works the same
way:

- On mousedown, snapshot the shelf's current world Y into the proxy.
- During drag, read the proxy's Y, convert back to `offsetFromBottom`
  (relative to the carcass's interior floor), patch the project, and run
  stack-follow on any dependents resting on the shelf top.
- Clamp `offsetFromBottom` to `[0, interiorClearHeight − shelfThickness]`
  during the patch.

### Inspector reveals shelf positions when uneven

The inspector currently shows a "Shelves: N" number field that, on change,
calls `evenlySpacedShelves` and replaces the array. New behavior:

- A shelf array is **even** when all gaps between adjacent shelf bottoms
  (and between the floor / top and the nearest shelf) match the
  even-spacing formula within `1/64"`.
- If even, the inspector renders the existing "Shelves: N" field plus a
  small "(evenly spaced)" hint.
- If uneven, the inspector renders a list:
  ```
  Shelf 1   12 1/2"   [↻ reset]
  Shelf 2   18 3/4"   [↻ reset]
  Shelf 3   28 1/2"   [↻ reset]
  ```
  Each row's dim field edits `offsetFromBottom` directly; the carcass-level
  "Shelves: N" field still works but now reveals "(custom spacing)" with a
  one-click "Re-space evenly" button next to it.
- Changing the count when shelves are custom-spaced shows a confirm before
  resetting to even.

The "even or not" check is one new helper (`isEvenlySpaced(c, catalog)`)
colocated with `evenlySpacedShelves` in
[src/domain/shelves.ts](../../src/domain/shelves.ts).

## Architecture

```
                         User                              State
   ┌────────────────────┐        ┌────────────────────┐  ┌──────────────┐
   │  Inspector field   │  ───▶  │   patchSelected    │  │  setProject  │
   │  (shelf offset)    │        │  (App.tsx)         │  │  (history)   │
   └────────────────────┘        └────────────────────┘  └──────────────┘
                                          │                     ▲
                                          ▼                     │
   ┌────────────────────┐        ┌────────────────────┐         │
   │  3D shelf gizmo    │  ───▶  │   resolveDrop      │  ───────┘
   │  (Scene.tsx)       │        │  (placement.ts)    │
   └────────────────────┘        └─────────┬──────────┘
                                           │
                                           ▼
                                 ┌────────────────────┐
                                 │   stack follow     │
                                 │  (stacking.ts)     │
                                 └────────────────────┘
```

`resolveDrop` gets a new branch / overload for shelf moves:
`resolveShelfDrop(project, carcassId, shelfIdx, newOffset)`. It computes
the dependents-before-move, applies the offset change, then translates
dependents by the resulting Y delta.

## Files touched

- `src/domain/shelves.ts` — add `isEvenlySpaced(c, catalog)`,
  `shelfTopY(c, catalog, shelfIdx)` if not already exposed.
- `src/geometry/stacking.ts` — add `dependentsOf(project, id)` supporting
  carcass / runner / refBox / shelf synthetic ids. Add `shelfTopAbsoluteY`
  helper.
- `src/scene/placement.ts` — extend `MovableKind` with `"shelf"` (carrying
  `{ carcassId, idx }`), or add a sibling `resolveShelfDrop`. Run
  stack-follow on every Y-changing move.
- `src/scene/Scene.tsx` — shelf `onPointerDown` in `CarcassGroup`; thread
  `subSel` and `onSelectShelf` through; new gizmo target when subSel is a
  shelf.
- `src/ui/App.tsx` — `subSel` state, wire `onSelectShelf`, inspector
  reveal logic for custom-spaced shelves with "Re-space evenly" button.
- New tests: `src/geometry/stacking.test.ts` for `dependentsOf` (single
  level, transitive, no false positives at different Y). `placement.test.ts`
  for shelf-move with stack-follow on a 3-entity stack. `shelves.test.ts`
  for `isEvenlySpaced`.

## Edge cases

- **Empty shelves array, drag the carcass up:** no dependents — no-op.
- **Two shelves at same height (manual overlap):** `dependentsOf` still
  finds the right ones; we don't try to prevent overlapping shelves.
- **A tote sits on both a shelf top and the carcass top because the
  carcass has no `top` panel:** dependentsOf returns true for both;
  carry-Y still works (delta is the same in both contributions to the
  identity translation). Idempotent.
- **Shelf dragged outside interior bounds:** clamp to the interior range
  at patch time; dependents follow the clamped delta, not the requested.
- **Carcass rotated:** shelf footprint rotates with the carcass; the new
  helpers reuse `rectAABB` already used elsewhere, so rotation is handled.

## Out of scope (for this round)

- Multi-select moves.
- A handle visible on the shelf even when not selected.
- Ceiling collision when stacks ride up.
- Reordering shelves by drag — order is implicit by `offsetFromBottom`
  ascending; the inspector list will sort by offset for display but the
  data array order remains insertion order.
- Per-shelf attachment editing in the new inspector list (it's already
  editable at the carcass level; per-shelf override is a future ask).
