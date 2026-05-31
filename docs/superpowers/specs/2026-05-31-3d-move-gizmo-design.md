# 3D Move Gizmo & Keyboard Nudge

Date: 2026-05-31

## Goal

Let the user move carcasses, runners, totes, and people directly inside the 3D
scene — by clicking an item to select it, dragging the standard 3-axis arrow
gizmo, or nudging with the arrow keys. Stacking/collision resolves on release,
matching PlanView drop behavior.

## Movable entity types

| Type   | Position fields            | Y-handle? |
|--------|----------------------------|-----------|
| Carcass | `position.{x,z}`, `baseHeight` | yes |
| Runner  | `position.{x,z}`, `baseHeight` | yes |
| RefBox (tote) | `position.{x,z}`, `baseHeight` | yes |
| Person  | `position.{x,z}`              | no (hidden) |

Walls, slabs, baseboards: not selectable.

## Architecture

All new code lives in `src/scene/`. `App.tsx` passes `sel` and a single
`onPatchEntity(id, patch)` callback (router that dispatches to existing
`patchCarcass` / `patchRunner` / `patchRefBox` / `patchPerson`) down to `Scene`.

New components inside `Scene.tsx` (or sibling files if any grows past ~80 LOC):

- **`SelectableGroup`** — wraps each movable entity's `<group>`. Holds a ref,
  attaches `onPointerDown` that calls `onSelect(id)` and `e.stopPropagation()`.
  When `id === sel`, also renders the selection outline.
- **`DeselectPlane`** — invisible mesh at y=0 sized to `max(roomLength,
  roomWidth) * 3`. `onPointerDown` (no stopPropagation upstream needed)
  calls `onSelect("")`. Rendered behind everything via `renderOrder`.
- **`MoveGizmo`** — single `<TransformControls>` from `@react-three/drei`,
  mounted only when `sel` resolves to a movable entity. Bound via `object`
  prop to that entity's group ref (passed up through a small ref registry, or
  resolved via a `useRef` map keyed by id).
  - `mode="translate"`, `size={0.75}`, `translationSnap={1}`.
  - `showY={selKind !== "person"}`.
  - On `dragging-changed`:
    - `true`: disable OrbitControls (`controls.enabled = false`).
    - `false`: read `groupRef.position`, convert to entity-local fields, call
      `onPatchEntity`, re-enable OrbitControls.
- **`KeyboardNudge`** — window `keydown` listener. Skips when
  `document.activeElement` is an input/textarea/contenteditable. Maps keys
  to per-axis deltas and dispatches `onPatchEntity`.
- **Selection outline** — `<lineSegments>` from a `THREE.EdgesGeometry` of the
  entity's bounding box, color `#ffd166`, rendered as a sibling inside
  `SelectableGroup` when selected. Survives wall occlusion in dollhouse view.

## Selection behavior

- Click on a movable item's mesh → `onSelect(id)` (replaces current sel).
- Click empty floor (DeselectPlane) → `onSelect("")`.
- Click on walls / shells / grid → no-op (no handlers). Bubbles past to
  DeselectPlane only if nothing else catches it; OK either way.
- `e.stopPropagation()` on the entity prevents the deselect plane from also
  firing on the same gesture.

## Keyboard map

Active only when `sel` resolves to a movable entity and focus is not in a
text input.

| Key                     | Action               |
|-------------------------|----------------------|
| ← / →                   | X − / X +            |
| ↑ / ↓                   | Z − / Z +            |
| Shift + ↑ / ↓           | Y + / Y −            |
| Alt + arrow             | fine step (0.125")   |
| Shift + Alt + arrow     | coarse step (6")     |
| (none)                  | default 1"           |
| Escape                  | deselect             |

Browser key-repeat handles holding the key down. Each keydown is one patch =
one undo step.

## Stacking & collision on release

Both gizmo-drop and keyboard nudge dispatch through the same `onPatchEntity`
callback. That callback wraps the existing per-entity patch fn with the same
resolver PlanView's drop uses, so:

- Tote dropped near a shelf surface → snaps onto the shelf.
- Carcass dropped into another carcass → rotation-aware collision pushes it
  out.
- Carcass dropped above the floor with nothing below → snaps to baseHeight 0.

If the existing PlanView resolve logic isn't already a single reusable
function, extract one (`resolvePlacement(project, entityKind, id, patch) →
patch`). That small refactor is in scope — both code paths need it.

## Data conversions

`<TransformControls>` writes to the bound `Object3D`'s `position`. The group
is positioned at `(entity.position.x, baseHeight ?? 0, entity.position.z)`,
so on drag-end:

```ts
const p = groupRef.current.position;
onPatchEntity(id, {
  position: { x: p.x, z: p.z },
  baseHeight: p.y,
});
```

For people (no Y handle, no baseHeight), omit `baseHeight`.

## Files touched

- `src/scene/Scene.tsx` — new components, new props (`sel`, `onSelect`,
  `onPatchEntity`), gizmo + nudge wiring.
- `src/ui/App.tsx` — pass new props down; create `onPatchEntity` router that
  dispatches by id prefix or via lookup, then wraps with placement resolver.
- Possibly new: `src/scene/placement.ts` (extracted resolver, if not already
  isolated). Adds vitest for the resolver.

## Out of scope

- Rotation gizmo (`mode="rotate"`) and scale. Only translate.
- Multi-select.
- Snap-to-other-object midflight (live snap during drag).
- Per-keypress undo debouncing (accept noise; revisit if it bites).
- Camera-relative arrow mapping.
