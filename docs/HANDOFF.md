# RoomBuilder — Handoff (Plan-view placement / drag / container system)

## Where you are working

- **Repo / worktree:** `/Users/nach/Projects/RoomBuilder/.claude/worktrees/eager-bhabha-092d33`
- **Branch:** `claude/eager-bhabha-092d33`
- This is a git **worktree** (not the main checkout). Stay on this branch; commit here.
- Commit trailer used in this project:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

## What the app is

RoomBuilder is a browser app for laying out a room and the furniture in it
(bookcases / desk cabinets, "runners" = boards/desktops/shelves, and "totes" =
tapered reference boxes), then producing cut lists / BOM. Two main views:
**3D** (react-three-fiber) and **Plan** (top-down SVG, where dragging happens).

**Stack:** React 18 + TypeScript + Vite. 3D via `@react-three/fiber` + `three`.
Tests via **vitest** (run in the **node** environment — no DOM, no
`localStorage`). State is plain React (`useProjectHistory` hook), persisted to
IndexedDB (`src/persistence/store.ts`) and view state to localStorage
(`src/ui/viewState.ts`).

## Run / verify

```bash
npm run dev        # Vite dev server on http://localhost:5173 (HMR)
npm test           # vitest run (currently 114 passing)
npx tsc -b         # typecheck (must be clean)
npm run build      # tsc -b && vite build
```

A live preview is available via the **Claude_Preview MCP** (preview_start →
serverId, then preview_eval / preview_screenshot). The dev server is usually
already running; `preview_start` with name `dev` reuses it (see
`.claude/launch.json`).

## THE TASK — what we're trying to get right

The active work is the **Plan-view placement & collision model**. The user is
furnishing one real room ("My Room" preset, `myRoom()` in
`src/domain/defaults.ts`). Two behaviors are **still not fully right for the
user's room** and are what you should focus on:

### Open issue A — "Span cabinets" button (a shelf in the gap)
`fitRunnerToCarcasses` in `src/geometry/group.ts` sizes a runner when the user
clicks **Span cabinets** in the runner inspector.
- Desired (per the user): a **shelf** (runner with `groupDrag === false`) should
  span the **GAP between the two outermost cabinets it spans**, ending butted
  against the **facing inner side walls**. A **desk top** (`groupDrag === true`)
  should instead **cover** the cabinets (ends flush with outer edges).
- Current state: implemented exactly that (commit `01791cf`). The user said
  "still working on it" — so verify against their actual room. Likely remaining
  mismatch: which cabinets the runner `spannedCarcassIds` actually contains (set
  via the "Sits on" checkboxes), or whether "touch the inner wall" should mean
  the gap-facing face vs. recessed by the side-panel thickness. Confirm the
  exact intent with the user before changing again — we guessed wrong twice.

### Open issue B — tote ↔ cabinet as "solid objects"
The user wants a **tote** (and a shelf) dragged in Plan to **stop at a cabinet's
inner walls** like solid objects.
- Current state (commits `03c7847`, `c759c1a`, `4ab40af`, `c7ace98`):
  `src/geometry/container.ts` provides `findContainer` + `clampToInterior`.
  When a dragged tote/runner's footprint **width fits** a cabinet it's over, it
  is "captured" and clamped to that cabinet's **interior**: inner **side** walls
  + **back**, with the **front open** (slide in/out). Capture currently uses the
  tote's **top (outer) footprint** so the visible edge seats on the wall. Deep
  items (deeper than the cavity) skip the back clamp and just slide through the
  open front (no forward snap).
- Known limitation the user may still want fixed: this is **interior
  containment only**, triggered when the item's **center** is over the cabinet
  (`findContainer` checks center-in-footprint). There is **no exterior
  collision** — a tote that's too wide to fit a cabinet can still be dragged to
  overlap that cabinet's body (it won't "bump off" the outside). If the user
  wants true solid-object collision (can't overlap the cabinet at all, only
  enter through the open front), that's a larger addition: treat the carcass as
  a U-shaped obstacle (solid sides + back, open front) and resolve the drag
  against it. Discuss scope before building.

## Architecture map (the files that matter for the task)

- **`src/scene/PlanView.tsx`** — the Plan (top-down SVG) view and **all drag
  logic**. The `onMove` handler has branches: `corner` / `edge` (walls),
  `carcass`, `runner`, `box` (tote). Each drag records a **grab offset**
  (`dx`,`dz`) at pointerdown so the piece tracks the cursor without jumping.
  - carcass: room wall resistance via `resolveMove(ok, …, false)`.
  - runner: container capture first (`findContainer`, excluding its own
    `spannedCarcassIds`); else room walls via `resolveMove(…, true)` (never
    freezes — a too-big shelf still follows the cursor). If `groupDrag`, drags
    its spanned cabinets along via `translateGroup`.
  - box/tote: container capture (top footprint); else room walls.
- **`src/geometry/container.ts`** — `findContainer(item, project)` and
  `clampToInterior(carcass, itemW, itemD, tx, tz, project)`. Rotation-aware
  (works in the carcass local frame). Interior = `width − 2·sideT` wide,
  `depth − backT` deep; **back panel is at local −Z, open front at +Z**.
- **`src/geometry/group.ts`** — desk-group helpers: `ownedCarcasses`,
  `groupAABB`, `rectAABB`, `corners`, `translateGroup`, and
  `fitRunnerToCarcasses` (the "Span cabinets" logic — issue A).
- **`src/scene/dragMath.ts`** — `resolveMove(fits, tx, tz, p0, freeIfStuck)`:
  full move → x-slide → z-slide → (freeze | free). Runners pass
  `freeIfStuck=true`; carcasses/totes `false`.
- **`src/domain/room.ts`** — `rectInsideRoom` (footprint-in-room test, has a
  1/32" tolerance so flush fits pass), `pointInRoom`, `roomReferenceSlabs`
  (3D walls/baseboards, mitered), `outerWallVertices` / `innerOffsetVertices`
  (polygon offset), `roomInteriorPoint` (spawn point inside the room).
- **`src/domain/types.ts`** — `Carcass`, `Runner`, `RefBox`, `Room`.
- **`src/domain/defaults.ts`** — `uid()`, `defaultBookcase/Runner/RefBox`,
  `deskAssembly()`, `myRoom()` preset, `normalizeProject()` (back-compat +
  **id de-dup** + legacy runner migration), `RUNNER_PROFILES`.
- **`src/ui/App.tsx`** — inspectors. `PlacementFields` (shared Pos X/Y/Z +
  Rotation + "Snap to surface below"). Runner inspector has **Profile**, Length,
  Depth, the **"Drag moves cabinets"** (groupDrag) checkbox, **"Span cabinets"**
  button, and "Sits on" checkboxes (which set `spannedCarcassIds`). Add buttons
  spawn at `roomInteriorPoint`. View persistence + auto-load of last project.

## Data model quick reference

- **Coordinates:** plan is `{x, z}` — `x` = width (→), `z` = depth (↓). `y` is up
  (3D only). Furniture stores floor position `{x,z}` + `baseHeight` (elevation).
- **Carcass** (bookcase / desk cabinet): `width,height,depth, position{x,z},
  rotationDeg, baseHeight, shelves[]`. Open front at local **+Z**, back at **−Z**.
  Interior width `= width − 2·carcassMaterialThickness`.
- **Runner** (board / desk top / shelf): first-class — explicit `position{x,z},
  length, depth, rotationDeg, baseHeight`. `spannedCarcassIds` = cabinets it
  bears on (for sag + group/span), **not** sizing. `groupDrag` = whether
  dragging it carries those cabinets (true for desk tops).
- **RefBox** (tote): `width,depth` = **bottom** footprint; optional
  `topWidth,topDepth` = tapered **top** (bigger). Rendered as a frustum in 3D
  (`src/scene/frustum.ts`); in Plan the top is the solid outline with the bottom
  dashed inside.

## Gotchas (READ before debugging the drag system)

1. **React commits pointer-move state asynchronously.** If you simulate a drag
   in the browser and read a DOM attribute (e.g. a rect's `x`) in the *same*
   `preview_eval`, you'll get the **stale** pre-move value. Split it: dispatch
   pointerdown in one eval, pointermove/up in a second, **read in a third**.
   Multiple "it didn't move" findings in this session were this artifact, not
   real bugs — verify with a separate read.
2. **`requestAnimationFrame` does not fire** in the headless preview tab, and
   `preview_eval` is **synchronous-only** (returning a Promise / using `await`
   **times out**). Don't `await rAF`. Use separate eval calls to let React flush.
3. To drive React inputs in the preview, set value via the native setter or call
   the fiber props (`el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))]`)
   — and React's `onBlur` is delivered via the bubbling **`focusout`**, not
   `blur`. `setPointerCapture` throws on synthetic pointer ids; override it to a
   no-op during simulation.
4. **`uid()` must stay collision-proof.** It includes a random suffix because a
   bare module counter resets on reload/HMR while ids persist, which once
   *fused* a bookcase to a cabinet (shared id → both move together). Don't
   "simplify" it back to a counter. `normalizeProject` also de-dups ids on load.
5. UI files (`PlanView.tsx`, `App.tsx`, `Scene.tsx`) are **not** unit-tested
   (node test env). Cover logic by extracting pure helpers (as done:
   `dragMath`, `container`, `group`, `dollhouse`, `frustum`, `prism`) and verify
   the wiring via `tsc -b`, `npm run build`, and the preview MCP.

## Method that worked (use it)

Follow systematic debugging + TDD:
1. Reproduce the user's exact case in the preview before changing anything
   (load **My Room**, add the relevant pieces, drag with simulated pointer
   events, read positions in a *separate* eval).
2. Put the decision/geometry in a **pure function** with a vitest test (RED →
   GREEN), then wire it into `PlanView.tsx`.
3. `npm test` + `npx tsc -b` + `npm run build` green before committing.
4. The user iterates visually — confirm intent with a concrete numeric example
   (we mis-guessed "span" twice by assuming).

## Recent commits (newest first)

```
01791cf Span cabinets: a shelf fills the gap between cabinets (desk top still covers)
c7ace98 Tote interior capture uses the outer (top) edge so visible edge stops at wall
4ab40af Span to inner cabinet walls; tote captures on its bottom footprint
c759c1a Fix container capture snapping deep items to the front edge
03c7847 Capture totes/shelves inside a bookcase's interior when dragging
0351aab Plan: tapered tote shows top as footprint, bottom inset inside
00ef1b2 Plan: make runner Length/Depth dimensions click-to-edit
9e4a763 Runner drag: per-runner groupDrag flag (desk carries cabinets, shelf free-moves)
fd29643 Runner drag: constrain by own footprint so wide-spanning runners still move
73e56af Fix runner drag (grab offset) and persist the open project across reload
31faea0 Spawn items inside room, runner 'Span cabinets', persist view on reload
efbc905 Allow exact/flush footprint fit in wall resistance
3369e49 Fix id collisions that fused a bookcase to a desk cabinet
38d1912 Mitered baseboards (5.5" tall)
643df85 Dollhouse: only cull when looking roughly level
fe96cda Miter wall corners (offset polygon + prisms)
94c55fc Add dollhouse view (auto-hide near walls)
b3d7e19 / fa30ff5 Walls sit outside the polygon (interior face on the line)
2cfe9c7 Add tapered totes + 'My Room' preset
bf8953a Unified placement: Pos X/Y/Z + snap, first-class runner, desk group
```

## Definition of done for the open issues

- Load **My Room**, go to **Plan**. Build the user's actual arrangement
  (confirm cabinet count / spacing / a bookcase wide enough for the tote).
- **Span cabinets** on a gap shelf sizes it to the clear opening between the
  cabinets, ends on the facing inner walls — confirmed against the user's room.
- Dragging the **tote** into a cabinet stops its visible outer edge at the inner
  side/back walls (and, if the user confirms they want it, bumps off the outside
  of cabinets it can't enter).
- All green: `npm test`, `npx tsc -b`, `npm run build`. Commit on
  `claude/eager-bhabha-092d33`.
