# Unified placement + desk-as-group — design

Date: 2026-05-19
Status: Approved (build directly per project convention; no separate plan step)

## Context

Placement is inconsistent across object types:

- **Carcass** has `position{x,z}`, `rotationDeg`, `restsOnId`, `baseHeight`.
- **Runner** has *no explicit position* — its X/Z/length are derived from the
  cabinets it spans (`spannedCarcassIds` + `nudge` + `overhangEachEnd`). Moving a
  cabinet therefore resizes the desktop, which the user does not want.
- **RefBox (tote)** has `position{x,z}` but no Y elevation and no rotation.

The user wants runners, bookcases, the desk, and totes to share the same
placement/positioning controls, all movable on Y, and the desk to behave as a
group: drag the desktop and the cabinets follow; move a cabinet and it just
repositions under the desktop without resizing it; wall resistance acts on
whichever edge of the group sticks out furthest.

## Decisions (locked with user)

1. **Unified placement model.** Carcass, Runner, RefBox all expose
   `position{x,z}`, `rotationDeg`, `restsOnId`, `baseHeight`. One shared
   Inspector "Placement" block.
2. **Runner becomes first-class.** Explicit `position`, `length`, `depth`,
   `rotationDeg`, `baseHeight`. Geometry no longer derived from cabinets.
3. **Sit-on stays one-shot.** "Sit on it" button writes `baseHeight` once from
   the surface top; afterward `baseHeight` is a free manual number. No live
   tracking. Same model already shipped for Carcass, generalized to all types.
4. **Desk is a group, desktop is the handle.** Dragging the desktop translates
   the desktop + all owned cabinets by the same delta; rotating the desktop
   rotates the group about its center. Dragging a single cabinet moves only that
   cabinet; the desktop is never moved or resized. The ownership link reuses the
   existing `spannedCarcassIds` (desktop → its cabinets).
5. **Wall resistance = union footprint.** For the desk group, clamp against the
   union of the desktop footprint (including overhang) and all owned cabinet
   footprints — the outermost edge is what the wall blocks. Per-axis slide is
   preserved (matches current carcass behavior). A lone cabinet drag uses normal
   per-cabinet wall resistance.
6. **Rotation universal.** Runner and RefBox gain `rotationDeg`. The desk group
   rotates as a unit.

## Data model (`src/domain/types.ts`)

Shared placement fields (already on `Carcass`; add to the others):

```
position: { x: Inches; z: Inches }
rotationDeg: number
restsOnId?: string | null
baseHeight?: Inches      // elevation of underside; default 0
```

- **Runner**: add `position`, `length`, `rotationDeg`, `restsOnId`,
  `baseHeight`. **Remove** `nudge`, `overhangEachEnd`, `bottomHeight` (length +
  position now express span and overhang directly; `bottomHeight` → `baseHeight`).
  **Keep** `spannedCarcassIds` — repurposed as the owned-cabinets link, used for
  the desk group and for sag/support bearing computation only (not sizing).
- **RefBox**: add `rotationDeg`, `restsOnId`, `baseHeight`.

## Migration (`normalizeProject` in `src/domain/defaults.ts`)

Saved projects live in IndexedDB; migration must preserve appearance:

- **Legacy runner** (has `bottomHeight`/`nudge`/`overhangEachEnd`, no
  `position`): run the *old* layout math (current `runnerLayout`) against its
  spanned carcasses to recover `worldLeft/worldRight/z`. Set
  `position = { x: (worldLeft+worldRight)/2, z }`,
  `length = worldRight - worldLeft`, `baseHeight = bottomHeight`,
  `rotationDeg = 0`, `restsOnId = null`. Drop the obsolete fields.
- **RefBox**: `rotationDeg ?? 0`, `restsOnId ?? null`, `baseHeight ?? 0`.
- Keep `schemaVersion: 1` (consistent with prior additive migrations).

## Geometry (`src/geometry/`)

- `runner.ts`: rewrite `runnerLayout` to use the runner's explicit
  `position`/`length`/`depth`/`rotationDeg` for the board geometry. Continue to
  derive `bearingIntervals`/`supportXs` from the owned cabinets' positions so the
  sag check (`src/domain/sag.ts`) keeps working. Update/replace
  `seatRunnerOnCarcasses` to use the shared stacking helper.
- `stacking.ts`: `surfaceTop` already handles runner (`baseHeight + thickness`)
  and carcass (`baseHeight + height`). Generalize `seatCarcassOn` →
  `seatOn(obj, project)` returning `{ baseHeight }`, reused by carcass, runner,
  refbox.
- New `src/geometry/group.ts`: desk-group helpers — `ownedCarcasses(runner,
  project)`, `groupFootprint(runner, project)` (union AABB incl. overhang &
  cabinets, rotation-aware), `translateGroup(runner, dx, dz)` (returns patched
  runner + cabinet positions).

## Plan view & rendering

- `PlanView.tsx`: runners and totes become draggable with rotation-aware
  footprints. Dragging a runner that owns cabinets drags the whole group
  (`translateGroup`) with union-footprint wall resistance via the existing
  per-axis slide pattern (`rectInsideRoom`). Single cabinet drag unchanged.
- `Scene.tsx`: runner and refbox rendered at their own
  `position`/`rotationDeg`/`baseHeight`. Carcass already correct.

## Inspector (`src/ui/App.tsx`)

Extract a shared `PlacementFields` block: Pos X, Pos Z, Rotation°, Rests on
(dropdown of runners + other carcasses), "Sit on it" button, Base height. Used
by carcass, runner, and refbox inspectors. Runner inspector also shows Length;
remove the old Nudge X/Z and Overhang fields. RefBox inspector gains the shared
block.

## Testing (TDD)

- `normalizeProject`: legacy runner migrates to explicit position/length and
  the new `runnerLayout` reproduces the legacy world extents (geometry
  preserved); refbox gets rotation/restsOn/baseHeight defaults.
- `runnerLayout`: derives board geometry from explicit position/length/rotation;
  bearing intervals still come from owned cabinets.
- `group.ts`: `translateGroup` shifts desktop + owned cabinets by the same
  delta; `groupFootprint` returns the outermost union (overhang vs cabinet).
- `seatOn`: returns correct `baseHeight` for runner and refbox parents; `{}`
  when no parent.
- Rotation: rotated runner footprint corners computed correctly.

## Verification

- `npm test` (vitest) green, including new suites.
- `npx tsc -b` and `npm run build` clean.
- `npm run dev`: add desk → drag desktop, cabinets follow and stop at the wall
  on the outermost edge; move one cabinet, desktop size/position unchanged;
  rotate desktop, group rotates; set a tote/runner "Rests on" a surface, "Sit on
  it", then bump Base height; reload a previously-saved project (IndexedDB) and
  confirm it looks identical to before.

## Notes

- One cohesive spec; highest-risk areas (runner field rework, save-file
  migration) are covered by tests.
- Per project memory, build directly from this spec with TDD; no separate
  writing-plans step.
