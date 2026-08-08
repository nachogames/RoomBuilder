# Visibility toggles, baseboard collision, and UI facelift — design

Date: 2026-08-08

## Goals

1. **Per-item visibility (eye icon).** Any scene item — bookcase/desk cabinet,
   runner (shelf/desktop), tote, person — can be hidden/shown from the browser
   tree with an eye toggle, Fusion-style. The setting applies to **both** the
   Plan and 3D views and carries between them (one shared state), surviving
   reload.
2. **Baseboards participate in collision.** When the room has a baseboard, an
   item sitting low enough to intersect it (item bottom below baseboard height)
   cannot be pushed into the baseboard band — it stops `thickness` short of the
   wall. Items elevated above the baseboard (e.g. a floating desk top) still
   reach the wall.
3. **Visual clarity in both views.** Plan view draws the baseboard band as a
   visible inner strip along the walls, so it is obvious why an item stops
   short. 3D already renders baseboard slabs; keep them clearly visible so the
   item is seen butting against the baseboard, not floating short of the wall.
4. **UI facelift.** A consistent design system (CSS custom-property tokens:
   color, spacing, radius, type scale) and a Fusion-360-style layout: top app
   toolbar, left **browser** tree (with eye toggles), center viewport with view
   tabs, right **inspector** (properties) panel.

## Non-goals

- Hiding individual shelf boards inside a carcass (the whole item hides as a
  unit; runner "shelves" are already independent items).
- Item-vs-item exterior collision (tracked separately in HANDOFF.md).
- Persisting visibility into the project file — it is a *view* setting, like
  the active tab and camera, so it lives in view state (localStorage).

## Design

### 1. Visibility

- **State:** `hiddenIds: Set<string>` owned by `Workspace` in `App.tsx`,
  initialized from `loadViewState().hidden` and persisted through
  `saveViewState({ hidden: [...] })`. `ViewState` gains `hidden?: string[]`.
- **Browser tree:** each row gets an eye button (SVG icon, shown dimmed/slashed
  when hidden). Clicking toggles that id. Group headers get an eye that
  toggles the whole group (hide all / show all). Hidden rows render dimmed.
- **Rendering:** `Scene` and `PlanView` take `hiddenIds` and skip rendering
  those entities (3D groups and Plan glyphs simply not mounted, so they also
  can't be clicked/dragged).
- **Semantics:** hidden ≠ deleted. Cut list, BOM, checks, and collision are
  unaffected — hidden items still exist physically (matching Fusion, where a
  hidden body still participates in the model). Deleting an item removes its
  id from nothing; a stale id in the hidden set is harmless.

### 2. Baseboard collision

- **Pure helper** in `src/domain/room.ts`:
  `collisionWalls(room, itemBaseY): Pt[]` — returns
  `innerOffsetVertices(room.walls, room.baseboard.thickness)` when a baseboard
  exists and `itemBaseY < room.baseboard.height` (strictly below the top of
  the board), else `room.walls`. Vitest-covered.
- **Wire-in:** every `rectInsideRoom(walls, …)` call used for placement
  switches to `rectInsideRoom(collisionWalls(project.room, baseY), …)`:
  - Plan drags in `PlanView.tsx`: carcass, runner, tote, person branches.
  - 3D drops in `placement.ts`: `dropCarcass`, `dropRunner`, `dropRefBox`,
    `dropPerson`.
- The carcass back-panel footprint (`carcassRoomRect`) is unchanged — it
  composes with the tighter polygon.

### 3. Visuals

- **Plan:** render the baseboard band as a polygon ring: the wall polygon
  filled against the inner offset polygon (even-odd fill), in a distinct
  muted color with a thin inner stroke. Non-interactive (`pointerEvents:
  none` under items). Only when `room.baseboard` exists.
- **3D:** baseboard slabs keep their geometry; bump their material to a
  distinct trim color at full opacity so the contact is legible.

### 4. Facelift

- **Tokens** (`styles.css` `:root`): background ramp (canvas / panel / raised /
  overlay), text ramp, accent, border, danger; spacing scale
  `--s1..--s6` (4/8/12/16/24/32), radii (4/6/10), type sizes (11/12/13/14).
- **Layout:** grid `header / browser | viewport | inspector / footer`.
  - Left panel = browser tree only (with eyes), ~240px.
  - Right panel = inspector only, ~300px; shows the selected item's
    properties (all existing inspector content moves here unchanged).
  - Center = tab strip + viewport + checks strip + status footer.
- **Consistency:** one button style + primary/ghost/icon variants; fields
  aligned label-left value-right; section headers uppercase 11px; uniform
  spacing from the scale. No behavior changes — markup/CSS only.

## Testing

- Unit (vitest, node env): `collisionWalls` (no baseboard → walls; baseY below
  height → inset; baseY at/above height → walls; thickness respected via
  `rectInsideRoom` probes near a wall).
- UI wiring verified via `tsc -b`, `npm run build`, and a browser smoke pass
  (eye toggles in both views, drag-to-baseboard stop in Plan, 3D drop stop,
  persistence across reload).
