# Assembly view — 3D pocket holes + exploded view

Adds an **Assembly** tab that shows one selected carcass with real
3D pocket-hole geometry and a smooth explode slider with transparency +
edge outlines. Lets the user see how the parts fit together and where
every pocket hole lives in space, without leaving the app.

## Problem

The current 3D tab renders each carcass part as a solid box. There is no
way to:

- See where pocket holes are physically placed on the wood (the Pocket
  plan tab shows 2D drilling cards, but not the in-context 3D location).
- Pull the parts apart to study the joinery — a fully assembled carcass
  hides every joint behind opaque panels.

## Goals

1. New **Assembly** tab scoped to one carcass (the primary selection).
2. Render pocket holes as 3D entrance ovals + angled cylinders on the
   correct faces of the drilled parts. Visible at every explode level.
3. Smooth explode slider 0–1 that displaces parts along sensible per-role
   axes scaled to the carcass dimensions.
4. As you explode, parts gain alpha (down to 0.6) and constant edge
   outlines so silhouettes read against each other.
5. Camera independent from the main 3D tab. Empty state when no carcass
   is selected.

## Non-goals

- No step-by-step assembly sequencer (separate future feature).
- No CSG (real subtractive geometry) — pocket holes are non-coplanar dark
  meshes on/in the face, not boolean cuts.
- No assembly-order inference or animated transitions between steps.
- No multi-carcass assembly views. Strictly one carcass at a time.
- No camera persistence into the main 3D tab.

## Architecture

### Pocket-hole geometry (pure)

`src/geometry/pocketHoles.ts`

```ts
export interface PocketHoleMark {
  jointId: string;
  partId: string;
  /** carcass-local position of the entrance face center for this hole */
  center: { x: number; y: number; z: number };
  /** unit outward face normal — drill goes -normal into the part */
  normal: { x: number; y: number; z: number };
  /** Kreg angle relative to the face (~15°) */
  angleDeg: number;
  /** entrance oval long-axis length (~1/2") */
  entranceLong: number;
  /** entrance oval short-axis length (~3/8") */
  entranceShort: number;
  /** how far the cylinder visually extends into the part */
  depth: number;
}

export function pocketHoleMarks(
  parts: Part[],
  joints: Joint[],
  catalog: StockCatalog,
): PocketHoleMark[];
```

**Rules**:

For every joint with `method === "pocket-screw"`, `drilledPartId` set
and `drilledEdge` set:

- The drilled face is the part's `±x` (left/right) or `±z`
  (bottom-edge/top-edge) face, picked by `drilledEdge`.
- Hole positions come from `holePositions(joint.edgeLength)` (existing
  function). Positions are along the perpendicular axis (the one
  spanning the joint's mating edge).
- For `drilledEdge: left|right`, holes spread along the part's z axis
  (depth). For `top-edge|bottom-edge`, holes spread along x (length).
- `entranceLong = 0.5`, `entranceShort = 0.375`, `angleDeg = 15`.
- `depth = min(thickness * 0.9, 1.0)`.

Pure, fully testable. Output is in **carcass-local coords** (same frame
as `Part.center`/`Part.box`).

### `<PocketHoleMesh>` component

`src/scene/PocketHoleMesh.tsx`

Renders one pocket-hole mark as two grouped meshes:

1. **Entrance** — a circle geometry scaled into an ellipse:
   `<group scale={[entranceLong/2, entranceShort/2, 1]}>` with a
   `<circleGeometry args={[1, 24]}>` and dark `<meshStandardMaterial>`,
   placed flush on the entrance face. Long axis aligned with the edge
   the holes run along.

2. **Cylinder** — a thin `<cylinderGeometry args={[entranceShort/2 *
   0.85, entranceShort/2 * 0.85, depth, 16]}>` rotated to point
   `-normal` tilted by `angleDeg` toward the mate-edge direction.
   Material same dark color.

Both meshes set `material.polygonOffset = true` with
`polygonOffsetFactor = -1, polygonOffsetUnits = -1` so they don't
z-fight with the part face.

Color: `#1a1410`. Both meshes are children of the part's transform group
so they explode with their part.

### Explode transform (pure)

`src/scene/explode.ts`

```ts
export function explodeOffset(
  part: Part,
  carcass: Carcass,
  shelfIdx: number | undefined,
  shelfCount: number,
  t: number,
): { x: number; y: number; z: number };
```

Per `part.role`:

| Role        | x                       | y                                      | z              |
|-------------|-------------------------|----------------------------------------|----------------|
| side        | `sign(center.x) * W*0.6*t` | 0                                  | 0              |
| top         | 0                       | `+H*0.5*t`                             | 0              |
| bottom      | 0                       | `-(toe>0 ? toe*2*t : H*0.15*t)`        | 0              |
| toe-kick    | 0                       | `-H*0.35*t`                            | 0              |
| shelf       | 0                       | `+H*0.2*t*(1 + shelfIdx/shelfCount)`   | `+D*0.5*t`     |
| back        | 0                       | 0                                      | `-D*0.8*t`     |

`t=0` returns zero offset for every part. Pure, easily unit-tested.

### Assembly view component

`src/scene/AssemblyView.tsx`

Mounts an independent `<Canvas>`. Props:

```ts
interface Props {
  project: Project;
  carcassId: string;  // primary selection's id, if it's a carcass
}
```

Reads the matching `Carcass` from `project`. If not found, renders the
empty state.

Holds `const [explodeT, setExplodeT] = useState(0)`. Provides it to
descendants via a new `ExplodeCtx`. (Used by `<PartMesh>` to apply the
offset and by the alpha/edges treatment.)

Scene content:
- Ambient + directional light (same intensities as main 3D view).
- A neutral floor plane at y=0, size = `max(carcass.width, carcass.depth) * 4`,
  light grey.
- One `<CarcassAssemblyGroup>` rendering the carcass parts.
- Pocket-hole meshes as children of each part's group.
- `<OrbitControls>` with `target` framed on the carcass centroid.
- Initial camera at a 3/4 view: `[W*1.5, H*0.9, D*1.8]` looking at
  `[0, H/2, 0]`.

Floating overlay UI (absolute-positioned over the canvas):
- Top-left card with: explode slider (`<input type="range" min=0 max=1
  step=0.01>`), label `"Exploded: ${Math.round(t*100)}%"`, and a small
  "Reset view" button that resets `OrbitControls` to the initial camera.

### `<CarcassAssemblyGroup>` and `<AssemblyPartMesh>`

Variants of the existing `<CarcassGroup>` / `<PartMesh>` tailored for
the Assembly view:

- Reads `t` from `ExplodeCtx`.
- Each part renders at `part.center + explodeOffset(...)`.
- Material: `transparent: true`, `opacity: 1 - 0.4 * t`. Uses the same
  `ROLE_COLOR` palette as the main view at `t=0`.
- Adds `<Edges threshold={15} color="#332b1c" />` from `@react-three/drei`.
- Renders pocket-hole marks for every joint whose `drilledPartId` is
  this part.

These are deliberately new components rather than overloading the
existing 3D scene rendering — the main 3D scene stays simple and the
assembly behaviors don't sneak into it.

### App.tsx wiring

- Extend `Tab` to `"3D" | "Plan" | "Assembly" | "Cut list" | "Pocket plan" | "Materials"`.
- Tab strip gets the new entry.
- In the content section:
  ```tsx
  {tab === "Assembly" && (
    <AssemblyView project={project} carcassId={sel} />
  )}
  ```
  (Where `sel` is the primary selection id, which the existing state
  already exposes. `AssemblyView` renders the empty state if `sel`
  doesn't resolve to a carcass.)

## Error handling

- `sel` is empty / not a carcass id → empty-state copy: `"Select a
  bookcase in another tab to see it exploded."` No canvas mounted, no
  perf cost.
- A joint has `drilledPartId` but no `drilledEdge` (legacy data): the
  pocket-holes module skips it. The carcass still renders fine.
- A part position contains a non-finite value: existing `allFinite`
  guard inside `<PartMesh>` skips it.

## Tests

- `src/geometry/pocketHoles.test.ts`:
  - Default bookcase produces marks only for `drilledPartId`-bearing
    pocket-screw joints. Count matches.
  - For a top joining the left side, the entrance face normal is the
    left-facing direction (`-x`) and the cylinder tilts toward `+x`.
  - Hole centers lie on the correct face plane (e.g. `x ≈ -length/2`
    for `drilledEdge: "left"`).

- `src/scene/explode.test.ts`:
  - `t = 0` → zero offset for every role.
  - Left side gets a negative x offset at t>0; right side gets a positive x.
  - Top moves +y; bottom moves -y; back moves -z; shelves move both +y
    and +z.
  - Shelves at higher indices move farther up than lower indices.

## Files

**New**

- `src/geometry/pocketHoles.ts`
- `src/geometry/pocketHoles.test.ts`
- `src/scene/PocketHoleMesh.tsx`
- `src/scene/explode.ts`
- `src/scene/explode.test.ts`
- `src/scene/AssemblyView.tsx`

**Modified**

- `src/ui/App.tsx` — new tab value, render `<AssemblyView>` when active.

(`src/scene/Scene.tsx` is **not** modified — the Assembly view has its
own component tree to keep the main 3D scene unchanged.)

## Open questions

None — all answered in brainstorming:
- Tab-scoped, one carcass at a time.
- Pocket holes = dark ellipse entrance + angled cylinder (no CSG).
- Smooth slider 0–1.
- Drilled-part-only (uses `Joint.drilledPartId` + `drilledEdge`).
- Alpha 1.0 → 0.6 with edges visible throughout.
- Independent camera from the main 3D view.
- Empty state for no-carcass selection.
