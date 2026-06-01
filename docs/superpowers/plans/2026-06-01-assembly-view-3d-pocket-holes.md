# Assembly View — 3D Pocket Holes + Exploded View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Assembly tab that renders one selected carcass with real 3D pocket-hole geometry on the right faces and a smooth 0–1 explode slider that pulls parts apart with transparency + edge outlines.

**Architecture:** Two pure modules (`pocketHoles`, `explode`) compute the data. Two new React Three Fiber components (`PocketHoleMesh`, `AssemblyView`) render it. A new `Assembly` tab in `App.tsx` mounts the view, scoped to whatever carcass is the primary selection. The main 3D Scene is **not modified** — the Assembly view has its own component tree so the main scene stays simple.

**Tech Stack:** TypeScript, React, React Three Fiber, Three.js, `@react-three/drei` (already in deps), vitest.

**Spec:** [docs/superpowers/specs/2026-06-01-assembly-view-3d-pocket-holes-design.md](../specs/2026-06-01-assembly-view-3d-pocket-holes-design.md)

---

## File Structure

**New:**

- `src/geometry/pocketHoles.ts` — pure function `pocketHoleMarks(parts, joints, catalog)` returning `PocketHoleMark[]` describing where each pocket hole goes in carcass-local 3D coords.
- `src/geometry/pocketHoles.test.ts` — counts, face normals, hole positions.
- `src/scene/explode.ts` — pure function `explodeOffset(part, carcass, shelfIdx, shelfCount, t)` returning a per-part displacement.
- `src/scene/explode.test.ts` — t=0 zero, per-role directions, shelf staggering.
- `src/scene/PocketHoleMesh.tsx` — renders one `PocketHoleMark` as an entrance ellipse + angled cylinder, both dark, z-fight-safe via polygon offset.
- `src/scene/AssemblyView.tsx` — self-contained Canvas + carcass renderer with explode slider overlay. Empty state when no carcass is selected. Independent camera/orbit. Reuses `pocketHoleMarks` + `explodeOffset`.

**Modified:**

- `src/ui/App.tsx` — adds `"Assembly"` to the `Tab` union, the tab strip, and mounts `<AssemblyView project={project} carcassId={sel} />` when active.

`src/scene/Scene.tsx` is intentionally untouched — the Assembly view duplicates the small bit of part-rendering it needs to avoid coupling the main scene to assembly-mode flags.

---

## Task 1: Pocket-hole geometry — types and skeleton

**Files:**
- Create: `src/geometry/pocketHoles.ts`
- Test: `src/geometry/pocketHoles.test.ts`

- [ ] **Step 1: Write the failing test (empty input)**

```ts
// src/geometry/pocketHoles.test.ts
import { describe, expect, it } from "vitest";
import { pocketHoleMarks } from "./pocketHoles";
import { defaultCatalog } from "../domain/defaults";

describe("pocketHoleMarks", () => {
  it("returns no marks for empty input", () => {
    expect(pocketHoleMarks([], [], defaultCatalog())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run src/geometry/pocketHoles.test.ts`
Expected: FAIL with "Cannot find module './pocketHoles'".

- [ ] **Step 3: Create the module with types and stub**

```ts
// src/geometry/pocketHoles.ts
import type { StockCatalog } from "../domain/types";
import type { Joint, Part } from "./types";

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
  _parts: Part[],
  _joints: Joint[],
  _catalog: StockCatalog,
): PocketHoleMark[] {
  return [];
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run src/geometry/pocketHoles.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/pocketHoles.ts src/geometry/pocketHoles.test.ts
git commit -m "Pocket holes 3D: types + skeleton"
```

---

## Task 2: Pocket-hole geometry — emit one mark per pocket-screw joint

**Files:**
- Modify: `src/geometry/pocketHoles.ts`
- Test: `src/geometry/pocketHoles.test.ts`

- [ ] **Step 1: Add a counts test**

Append to `src/geometry/pocketHoles.test.ts`:

```ts
import { buildCarcass } from "./carcass";
import { defaultBookcase } from "../domain/defaults";
import { holePositions } from "../pockets/kreg";

describe("pocketHoleMarks (default bookcase)", () => {
  it("emits one mark per hole-position per drilled pocket-screw joint", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);

    const drilled = g.joints.filter(
      (j) => j.method === "pocket-screw" && j.drilledPartId && j.drilledEdge,
    );
    const expected = drilled.reduce(
      (n, j) => n + holePositions(j.edgeLength).length,
      0,
    );

    const marks = pocketHoleMarks(g.parts, g.joints, cat);
    expect(marks).toHaveLength(expected);
  });

  it("ignores joints without a drilledPartId or drilledEdge", () => {
    const c = defaultBookcase();
    // swap shelves to shelf-pin so they aren't drilled
    c.shelves = c.shelves.map((s) => ({ ...s, attachment: "shelf-pin" }));
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);

    const marks = pocketHoleMarks(g.parts, g.joints, cat);
    const shelfPartIds = new Set(
      g.parts.filter((p) => p.role === "shelf").map((p) => p.id),
    );
    for (const m of marks) {
      expect(shelfPartIds.has(m.partId)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run src/geometry/pocketHoles.test.ts`
Expected: FAIL — current stub returns `[]`.

- [ ] **Step 3: Implement the join + iteration**

Replace the stub body in `src/geometry/pocketHoles.ts`:

```ts
import type { StockCatalog } from "../domain/types";
import type { DrilledEdge, Joint, Part } from "./types";
import { holePositions } from "../pockets/kreg";

export interface PocketHoleMark {
  jointId: string;
  partId: string;
  center: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  angleDeg: number;
  entranceLong: number;
  entranceShort: number;
  depth: number;
}

const ENTRANCE_LONG = 0.5;
const ENTRANCE_SHORT = 0.375;
const ANGLE_DEG = 15;

export function pocketHoleMarks(
  parts: Part[],
  joints: Joint[],
  _catalog: StockCatalog,
): PocketHoleMark[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: PocketHoleMark[] = [];
  for (const j of joints) {
    if (j.method !== "pocket-screw") continue;
    if (!j.drilledPartId || !j.drilledEdge) continue;
    const part = byId.get(j.drilledPartId);
    if (!part) continue;
    const positions = holePositions(j.edgeLength);
    for (const pos of positions) {
      out.push(markForPosition(part, j.id, j.drilledEdge, pos));
    }
  }
  return out;
}

function markForPosition(
  part: Part,
  jointId: string,
  edge: DrilledEdge,
  posAlongEdge: number,
): PocketHoleMark {
  // Placeholder: all geometry zeros — face mapping comes in the next task.
  return {
    jointId,
    partId: part.id,
    center: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 0 },
    angleDeg: ANGLE_DEG,
    entranceLong: ENTRANCE_LONG,
    entranceShort: ENTRANCE_SHORT,
    depth: Math.min(part.thickness * 0.9, 1.0),
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run src/geometry/pocketHoles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/pocketHoles.ts src/geometry/pocketHoles.test.ts
git commit -m "Pocket holes 3D: emit one mark per drilled hole"
```

---

## Task 3: Pocket-hole geometry — map edges to faces

**Files:**
- Modify: `src/geometry/pocketHoles.ts`
- Test: `src/geometry/pocketHoles.test.ts`

Each part has carcass-local center `part.center` and axis-aligned size `part.box` (where `box.x = length`, `box.y = thickness`, `box.z = width` for horizontal panels; for vertical sides `box.x = thickness`, `box.y = height`, `box.z = depth`). Pocket-screw joints are always drilled on the **end-grain face of a horizontal piece** (top, bottom, shelf, toe-kick) — i.e. the part's `±x` or `±z` face per `drilledEdge`.

The hole position spreads along the **other in-face axis**: for left/right edges the holes spread along z (depth); for top-edge/bottom-edge they spread along x (length). The position is measured from one end of the edge (`holePositions(edgeLength)` returns 0..edgeLength), anchored at the lower-coord end of that axis.

- [ ] **Step 1: Write face-mapping tests**

Append to `src/geometry/pocketHoles.test.ts`:

```ts
describe("pocketHoleMarks face mapping", () => {
  it("left-edge marks sit on the part's -x face, normal -x", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const marks = pocketHoleMarks(g.parts, g.joints, cat);

    // Pick a left-edge joint on the Top
    const leftTopJoint = g.joints.find(
      (j) =>
        j.method === "pocket-screw" &&
        j.drilledPartId !== undefined &&
        j.drilledEdge === "left" &&
        j.label.startsWith("Top"),
    )!;
    const topPart = g.parts.find((p) => p.id === leftTopJoint.drilledPartId)!;
    const leftMarks = marks.filter((m) => m.jointId === leftTopJoint.id);
    expect(leftMarks.length).toBeGreaterThan(0);

    for (const m of leftMarks) {
      // Entrance plane is at the part's -x face (carcass-local).
      expect(m.center.x).toBeCloseTo(topPart.center.x - topPart.box.x / 2, 5);
      // Outward normal points -x
      expect(m.normal.x).toBeCloseTo(-1, 5);
      expect(m.normal.y).toBeCloseTo(0, 5);
      expect(m.normal.z).toBeCloseTo(0, 5);
    }
  });

  it("right-edge marks sit on the part's +x face, normal +x", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const marks = pocketHoleMarks(g.parts, g.joints, cat);

    const rightTopJoint = g.joints.find(
      (j) =>
        j.method === "pocket-screw" &&
        j.drilledPartId !== undefined &&
        j.drilledEdge === "right" &&
        j.label.startsWith("Top"),
    )!;
    const topPart = g.parts.find((p) => p.id === rightTopJoint.drilledPartId)!;
    const rightMarks = marks.filter((m) => m.jointId === rightTopJoint.id);

    for (const m of rightMarks) {
      expect(m.center.x).toBeCloseTo(topPart.center.x + topPart.box.x / 2, 5);
      expect(m.normal.x).toBeCloseTo(1, 5);
    }
  });

  it("hole z positions span the depth across the part width", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const marks = pocketHoleMarks(g.parts, g.joints, cat);

    const leftTopJoint = g.joints.find(
      (j) =>
        j.drilledEdge === "left" && j.label.startsWith("Top"),
    )!;
    const topPart = g.parts.find((p) => p.id === leftTopJoint.drilledPartId)!;
    const leftMarks = marks.filter((m) => m.jointId === leftTopJoint.id);

    const zMin = topPart.center.z - topPart.box.z / 2;
    const zMax = topPart.center.z + topPart.box.z / 2;
    for (const m of leftMarks) {
      expect(m.center.z).toBeGreaterThanOrEqual(zMin - 1e-6);
      expect(m.center.z).toBeLessThanOrEqual(zMax + 1e-6);
    }
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run src/geometry/pocketHoles.test.ts`
Expected: FAIL — current `markForPosition` returns zeros.

- [ ] **Step 3: Implement face mapping**

Replace `markForPosition` in `src/geometry/pocketHoles.ts`:

```ts
function markForPosition(
  part: Part,
  jointId: string,
  edge: DrilledEdge,
  posAlongEdge: number,
): PocketHoleMark {
  const cx = part.center.x;
  const cy = part.center.y;
  const cz = part.center.z;
  const hx = part.box.x / 2;
  const hy = part.box.y / 2;
  const hz = part.box.z / 2;

  let center = { x: cx, y: cy, z: cz };
  let normal = { x: 0, y: 0, z: 0 };

  if (edge === "left") {
    // -x face; holes spread along z from (cz - hz) to (cz + hz)
    center = { x: cx - hx, y: cy, z: cz - hz + posAlongEdge };
    normal = { x: -1, y: 0, z: 0 };
  } else if (edge === "right") {
    center = { x: cx + hx, y: cy, z: cz - hz + posAlongEdge };
    normal = { x: 1, y: 0, z: 0 };
  } else if (edge === "bottom-edge") {
    // -z face; holes spread along x
    center = { x: cx - hx + posAlongEdge, y: cy, z: cz - hz };
    normal = { x: 0, y: 0, z: -1 };
  } else {
    // top-edge: +z face
    center = { x: cx - hx + posAlongEdge, y: cy, z: cz + hz };
    normal = { x: 0, y: 0, z: 1 };
  }

  return {
    jointId,
    partId: part.id,
    center,
    normal,
    angleDeg: ANGLE_DEG,
    entranceLong: ENTRANCE_LONG,
    entranceShort: ENTRANCE_SHORT,
    depth: Math.min(part.thickness * 0.9, 1.0),
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run src/geometry/pocketHoles.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/pocketHoles.ts src/geometry/pocketHoles.test.ts
git commit -m "Pocket holes 3D: edge-to-face mapping"
```

---

## Task 4: Explode transform — t=0 is identity

**Files:**
- Create: `src/scene/explode.ts`
- Test: `src/scene/explode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/explode.test.ts
import { describe, expect, it } from "vitest";
import { defaultBookcase, defaultCatalog } from "../domain/defaults";
import { buildCarcass } from "../geometry/carcass";
import { explodeOffset } from "./explode";

describe("explodeOffset", () => {
  it("returns zero displacement at t=0 for every part role", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    for (let i = 0; i < g.parts.length; i++) {
      const p = g.parts[i];
      const shelfCount = g.parts.filter((x) => x.role === "shelf").length;
      const shelfIdx = p.role === "shelf"
        ? g.parts.filter((x) => x.role === "shelf").indexOf(p)
        : undefined;
      const off = explodeOffset(p, c, shelfIdx, shelfCount, 0);
      expect(off.x).toBe(0);
      expect(off.y).toBe(0);
      expect(off.z).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run src/scene/explode.test.ts`
Expected: FAIL with "Cannot find module './explode'".

- [ ] **Step 3: Create module with zero-at-zero impl**

```ts
// src/scene/explode.ts
import type { Carcass } from "../domain/types";
import type { Part } from "../geometry/types";

export interface Vec3 { x: number; y: number; z: number }

/**
 * Per-part displacement for the assembly view's explode slider.
 *  - t = 0 returns zero (assembled state must be exact).
 *  - t = 1 returns the "fully exploded" offset proportional to carcass dims.
 *  - intermediate t lerps linearly.
 */
export function explodeOffset(
  _part: Part,
  _carcass: Carcass,
  _shelfIdx: number | undefined,
  _shelfCount: number,
  t: number,
): Vec3 {
  if (t === 0) return { x: 0, y: 0, z: 0 };
  return { x: 0, y: 0, z: 0 };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run src/scene/explode.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/scene/explode.ts src/scene/explode.test.ts
git commit -m "Explode transform: skeleton with t=0 identity"
```

---

## Task 5: Explode transform — per-role displacement

**Files:**
- Modify: `src/scene/explode.ts`
- Test: `src/scene/explode.test.ts`

- [ ] **Step 1: Add per-role tests**

Append to `src/scene/explode.test.ts`:

```ts
describe("explodeOffset per role at t=1", () => {
  const c = defaultBookcase();
  const cat = defaultCatalog();
  const g = buildCarcass(c, cat);
  const shelfCount = g.parts.filter((p) => p.role === "shelf").length;
  const findRole = (role: string) =>
    g.parts.find((p) => p.role === role)!;

  it("top moves +y", () => {
    const off = explodeOffset(findRole("top"), c, undefined, shelfCount, 1);
    expect(off.y).toBeGreaterThan(0);
    expect(off.x).toBe(0);
    expect(off.z).toBe(0);
  });

  it("bottom moves -y", () => {
    const off = explodeOffset(findRole("bottom"), c, undefined, shelfCount, 1);
    expect(off.y).toBeLessThan(0);
  });

  it("left side moves -x, right side moves +x", () => {
    const sides = g.parts.filter((p) => p.role === "side");
    const left = sides.find((s) => s.center.x < 0)!;
    const right = sides.find((s) => s.center.x > 0)!;
    expect(explodeOffset(left, c, undefined, shelfCount, 1).x).toBeLessThan(0);
    expect(explodeOffset(right, c, undefined, shelfCount, 1).x).toBeGreaterThan(0);
  });

  it("back moves -z", () => {
    const back = g.parts.find((p) => p.role === "back");
    if (back) {
      const off = explodeOffset(back, c, undefined, shelfCount, 1);
      expect(off.z).toBeLessThan(0);
    }
  });

  it("higher-index shelves move farther up than lower ones", () => {
    const shelves = g.parts.filter((p) => p.role === "shelf");
    if (shelves.length >= 2) {
      const offLo = explodeOffset(shelves[0], c, 0, shelves.length, 1);
      const offHi = explodeOffset(shelves[shelves.length - 1], c, shelves.length - 1, shelves.length, 1);
      expect(offHi.y).toBeGreaterThan(offLo.y);
      // Shelves also move forward (+z)
      expect(offLo.z).toBeGreaterThan(0);
    }
  });

  it("scales linearly with t (t=0.5 is half of t=1)", () => {
    const top = findRole("top");
    const half = explodeOffset(top, c, undefined, shelfCount, 0.5);
    const full = explodeOffset(top, c, undefined, shelfCount, 1);
    expect(half.y).toBeCloseTo(full.y / 2, 6);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run src/scene/explode.test.ts`
Expected: FAIL — current impl always returns zeros.

- [ ] **Step 3: Implement per-role offsets**

Replace the function body in `src/scene/explode.ts`:

```ts
export function explodeOffset(
  part: Part,
  carcass: Carcass,
  shelfIdx: number | undefined,
  shelfCount: number,
  t: number,
): Vec3 {
  if (t === 0) return { x: 0, y: 0, z: 0 };
  const W = carcass.width;
  const H = carcass.height;
  const D = carcass.depth;
  const toe = carcass.toeKickHeight;

  switch (part.role) {
    case "side": {
      const sign = part.center.x < 0 ? -1 : 1;
      return { x: sign * W * 0.6 * t, y: 0, z: 0 };
    }
    case "top":
      return { x: 0, y: H * 0.5 * t, z: 0 };
    case "bottom": {
      const dy = toe > 0 ? -toe * 2 * t : -H * 0.15 * t;
      return { x: 0, y: dy, z: 0 };
    }
    case "toe-kick":
      return { x: 0, y: -H * 0.35 * t, z: 0 };
    case "shelf": {
      const n = Math.max(1, shelfCount);
      const i = shelfIdx ?? 0;
      return { x: 0, y: H * 0.2 * t * (1 + i / n), z: D * 0.5 * t };
    }
    case "back":
      return { x: 0, y: 0, z: -D * 0.8 * t };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run src/scene/explode.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scene/explode.ts src/scene/explode.test.ts
git commit -m "Explode transform: per-role displacements"
```

---

## Task 6: PocketHoleMesh component

**Files:**
- Create: `src/scene/PocketHoleMesh.tsx`

This is React Three Fiber JSX. There is no useful unit test for a pure-render component — verification is visual in the Assembly view (Task 8). The component contract:

- Renders an entrance ellipse on the part face + an angled cylinder going inward.
- Dark color, polygon-offset enabled to avoid z-fighting with the part face.
- Position/orientation given by `PocketHoleMark`.

- [ ] **Step 1: Create the component**

```tsx
// src/scene/PocketHoleMesh.tsx
import { useMemo } from "react";
import * as THREE from "three";
import type { PocketHoleMark } from "../geometry/pocketHoles";

const COLOR = "#1a1410";

/** Visualises one Kreg pocket hole as a flat dark entrance ellipse plus a
 *  short angled cylinder going into the wood. Not subtractive — the part's
 *  box geometry is unchanged underneath. Polygon offset keeps the entrance
 *  from z-fighting with the host face. */
export function PocketHoleMesh({ mark }: { mark: PocketHoleMark }) {
  // Orientation: build a rotation that maps +Z (the entrance circle's local
  // normal) to the mark's outward normal, and aligns the long axis of the
  // ellipse with the edge the holes run along.
  const { entranceQuat, cylinderQuat } = useMemo(() => {
    const n = new THREE.Vector3(mark.normal.x, mark.normal.y, mark.normal.z).normalize();

    // Long axis of the entrance ellipse: along whichever in-face axis the
    // holes spread on. For ±x normals that's z (long edge runs front-back);
    // for ±z normals that's x (long edge runs left-right). Convention: pick
    // the in-face axis with the largest magnitude when projected onto the
    // standard basis.
    const longAxis = new THREE.Vector3();
    if (Math.abs(n.x) > 0.5) longAxis.set(0, 0, 1);
    else longAxis.set(1, 0, 0);
    // Make sure it's perpendicular to n (it already is for axis-aligned n).
    longAxis.crossVectors(n, longAxis.clone().cross(n)).normalize();

    const up = longAxis.clone();
    const right = new THREE.Vector3().crossVectors(n, up).normalize();
    // CircleGeometry lies in the XY plane with normal +Z. Build a matrix
    // whose columns are (right, up, n).
    const m = new THREE.Matrix4().makeBasis(right, up, n);
    const entranceQuat = new THREE.Quaternion().setFromRotationMatrix(m);

    // Cylinder: its local +Y is the axis. We want the axis to point along
    // (-n) tilted by ANGLE toward the mate. Without a "which way is mate",
    // we just tilt around the long axis by mark.angleDeg toward the
    // part's interior; for purely axis-aligned marks the tilt is small
    // visually — what matters is the dark shape sitting on the face.
    const cylAxis = n.clone().multiplyScalar(-1);
    const tiltAxis = up.clone();
    const angleRad = (mark.angleDeg * Math.PI) / 180;
    cylAxis.applyAxisAngle(tiltAxis, angleRad).normalize();
    // Map +Y to cylAxis
    const cylinderQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      cylAxis,
    );
    return { entranceQuat, cylinderQuat };
  }, [mark.normal.x, mark.normal.y, mark.normal.z, mark.angleDeg]);

  const entranceSx = mark.entranceShort / 2;
  const entranceSy = mark.entranceLong / 2;

  // Cylinder positioned so its top cap sits AT the entrance, extending
  // inward by `depth/2` along its axis.
  const cylAxis = new THREE.Vector3(0, -1, 0).applyQuaternion(cylinderQuat);
  const cylCenter = {
    x: mark.center.x + cylAxis.x * (mark.depth / 2),
    y: mark.center.y + cylAxis.y * (mark.depth / 2),
    z: mark.center.z + cylAxis.z * (mark.depth / 2),
  };

  return (
    <group>
      <mesh
        position={[mark.center.x, mark.center.y, mark.center.z]}
        quaternion={entranceQuat}
        scale={[entranceSx, entranceSy, 1]}
      >
        <circleGeometry args={[1, 24]} />
        <meshStandardMaterial
          color={COLOR}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh
        position={[cylCenter.x, cylCenter.y, cylCenter.z]}
        quaternion={cylinderQuat}
      >
        <cylinderGeometry
          args={[entranceSx * 0.85, entranceSx * 0.85, mark.depth, 16]}
        />
        <meshStandardMaterial color={COLOR} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scene/PocketHoleMesh.tsx
git commit -m "Pocket holes 3D: PocketHoleMesh component"
```

---

## Task 7: AssemblyView — empty state

**Files:**
- Create: `src/scene/AssemblyView.tsx`

- [ ] **Step 1: Create the component with empty-state branch only**

```tsx
// src/scene/AssemblyView.tsx
import { useState } from "react";
import type { Project } from "../domain/types";

/**
 * Self-contained 3D view of one carcass: parts can explode outward via a
 * 0..1 slider and pocket-hole geometry is rendered on the right faces.
 * Independent camera from the main 3D tab.
 */
export function AssemblyView({
  project,
  carcassId,
}: {
  project: Project;
  carcassId: string;
}) {
  const carcass = project.carcasses.find((c) => c.id === carcassId);
  const [explodeT, setExplodeT] = useState(0);

  if (!carcass) {
    return (
      <div style={{ padding: 24 }}>
        <p className="label">
          Select a bookcase in another tab to see it exploded.
        </p>
      </div>
    );
  }

  // Carcass scene comes in Task 8.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ExplodeControl t={explodeT} onChange={setExplodeT} />
      <div style={{ padding: 24 }}>
        <p className="label">Assembly: {carcass.label} (placeholder)</p>
      </div>
    </div>
  );
}

function ExplodeControl({
  t,
  onChange,
}: {
  t: number;
  onChange: (v: number) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 1,
        background: "#0008",
        color: "#fff",
        padding: "8px 10px",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12 }}>Exploded: {Math.round(t * 100)}%</div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={t}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scene/AssemblyView.tsx
git commit -m "AssemblyView: empty state + explode slider control"
```

---

## Task 8: AssemblyView — 3D carcass renderer with explode + transparency + edges + pocket holes

**Files:**
- Modify: `src/scene/AssemblyView.tsx`

- [ ] **Step 1: Replace the placeholder body with the actual canvas**

Replace the entire contents of `src/scene/AssemblyView.tsx` with:

```tsx
// src/scene/AssemblyView.tsx
import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Edges } from "@react-three/drei";
import type { Project } from "../domain/types";
import type { Part } from "../geometry/types";
import { buildCarcass } from "../geometry/carcass";
import { pocketHoleMarks } from "../geometry/pocketHoles";
import { explodeOffset } from "./explode";
import { PocketHoleMesh } from "./PocketHoleMesh";

const ROLE_COLOR: Record<string, string> = {
  side: "#c8a877",
  top: "#d8bd92",
  bottom: "#d8bd92",
  "toe-kick": "#b9975b",
  back: "#9c8157",
  shelf: "#e3cda0",
};

/** Self-contained 3D view of one carcass with a 0..1 explode slider, real
 *  pocket-hole geometry and edge outlines. Independent camera. */
export function AssemblyView({
  project,
  carcassId,
}: {
  project: Project;
  carcassId: string;
}) {
  const carcass = project.carcasses.find((c) => c.id === carcassId);
  const [explodeT, setExplodeT] = useState(0);

  const geometry = useMemo(() => {
    if (!carcass) return null;
    const g = buildCarcass(carcass, project.catalog);
    const marks = pocketHoleMarks(g.parts, g.joints, project.catalog);
    const marksByPart = new Map<string, typeof marks>();
    for (const m of marks) {
      const arr = marksByPart.get(m.partId) ?? [];
      arr.push(m);
      marksByPart.set(m.partId, arr);
    }
    const shelfParts = g.parts.filter((p) => p.role === "shelf");
    return { parts: g.parts, marksByPart, shelfParts };
  }, [carcass, project.catalog]);

  if (!carcass || !geometry) {
    return (
      <div style={{ padding: 24 }}>
        <p className="label">
          Select a bookcase in another tab to see it exploded.
        </p>
      </div>
    );
  }

  const { parts, marksByPart, shelfParts } = geometry;
  const span = Math.max(carcass.width, carcass.height, carcass.depth);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ExplodeControl t={explodeT} onChange={setExplodeT} />
      <Canvas
        shadows
        camera={{
          position: [carcass.width * 1.5, carcass.height * 0.9, carcass.depth * 1.8],
          fov: 45,
        }}
        style={{ background: "#1b1b1f" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[span, span * 1.4, span]}
          intensity={1.1}
          castShadow
        />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          receiveShadow
        >
          <planeGeometry args={[span * 4, span * 4]} />
          <meshStandardMaterial color="#2a2a30" />
        </mesh>
        <group position={[0, 0, 0]}>
          {parts.map((p) => (
            <AssemblyPart
              key={p.id}
              part={p}
              carcass={carcass}
              shelfIdx={p.role === "shelf" ? shelfParts.indexOf(p) : undefined}
              shelfCount={shelfParts.length}
              t={explodeT}
              marks={marksByPart.get(p.id) ?? []}
            />
          ))}
        </group>
        <OrbitControls
          makeDefault
          target={[0, carcass.height / 2, 0]}
        />
      </Canvas>
    </div>
  );
}

function AssemblyPart({
  part,
  carcass,
  shelfIdx,
  shelfCount,
  t,
  marks,
}: {
  part: Part;
  carcass: Project["carcasses"][number];
  shelfIdx: number | undefined;
  shelfCount: number;
  t: number;
  marks: ReturnType<typeof pocketHoleMarks>;
}) {
  const off = explodeOffset(part, carcass, shelfIdx, shelfCount, t);
  const color = ROLE_COLOR[part.role] ?? "#bbb";
  const opacity = 1 - 0.4 * t;
  return (
    <group
      position={[part.center.x + off.x, part.center.y + off.y, part.center.z + off.z]}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[part.box.x, part.box.y, part.box.z]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
        <Edges threshold={15} color="#332b1c" />
      </mesh>
      {/* Pocket holes were computed in carcass-local coords. We're rendering
          inside the same parent group (the assembly group), so we have to
          subtract the part's exploded position to land them on the part's
          surface. Simpler: render the pocket meshes as siblings outside
          this <group> by passing an absolute transform — but to keep
          parenting clean, we add a sibling group whose origin matches the
          part's PRE-OFFSET position. Easiest: render pocket holes via an
          absolute group offset by `off` and let their carcass-local
          coordinates inside that group carry the rest. */}
      {marks.length > 0 && (
        <group position={[-part.center.x, -part.center.y, -part.center.z]}>
          {/* Inside this group, world-equivalent coords are carcass-local
              minus the part's center, then the outer group adds the part
              center + explode offset back. So coordinates passed to
              <PocketHoleMesh> are already in carcass-local space. */}
          {marks.map((m, i) => (
            <PocketHoleMesh key={i} mark={m} />
          ))}
        </group>
      )}
    </group>
  );
}

function ExplodeControl({
  t,
  onChange,
}: {
  t: number;
  onChange: (v: number) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 1,
        background: "#0008",
        color: "#fff",
        padding: "8px 10px",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12 }}>Exploded: {Math.round(t * 100)}%</div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={t}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (no Assembly-specific tests yet; existing 191 stay green).

- [ ] **Step 4: Commit**

```bash
git add src/scene/AssemblyView.tsx
git commit -m "AssemblyView: 3D carcass with explode + transparency + pocket holes"
```

---

## Task 9: Add the Assembly tab to App.tsx

**Files:**
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Update the Tab union type**

Find the line `type Tab = "3D" | "Plan" | "Cut list" | "Pocket plan" | "Materials";` in `src/ui/App.tsx` and replace with:

```ts
type Tab = "3D" | "Plan" | "Assembly" | "Cut list" | "Pocket plan" | "Materials";
```

- [ ] **Step 2: Add "Assembly" to the tab strip**

Find the `<nav className="tabs">` block. Change:

```tsx
(["3D", "Plan", "Cut list", "Pocket plan", "Materials"] as Tab[])
```

to:

```tsx
(["3D", "Plan", "Assembly", "Cut list", "Pocket plan", "Materials"] as Tab[])
```

- [ ] **Step 3: Import AssemblyView**

Add to the imports at the top of `src/ui/App.tsx`:

```ts
import { AssemblyView } from "../scene/AssemblyView";
```

- [ ] **Step 4: Render the AssemblyView when tab is active**

Find the `{tab === "Plan" && (...)}` block. Right after it, insert:

```tsx
{tab === "Assembly" && (
  <div className="canvas-wrap" style={{ position: "relative", width: "100%", height: "100%" }}>
    <AssemblyView project={project} carcassId={sel} />
  </div>
)}
```

- [ ] **Step 5: Run typecheck + tests + production build**

Run in order:
```bash
npx tsc -b --noEmit
npx vitest run
npx vite build
```

Expected: typecheck clean, all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/ui/App.tsx
git commit -m "App: add Assembly tab wired to AssemblyView"
```

---

## Self-Review

**Spec coverage check** (against [the spec](../specs/2026-06-01-assembly-view-3d-pocket-holes-design.md)):

| Spec section | Covered by |
|--------------|-----------|
| Goal 1 (Assembly tab scoped to one carcass) | Tasks 7, 9 |
| Goal 2 (3D pocket holes on right faces) | Tasks 1-3, 6 |
| Goal 3 (explode slider 0-1) | Tasks 4-5, 7, 8 |
| Goal 4 (alpha + edge outlines) | Task 8 |
| Goal 5 (independent camera, empty state) | Tasks 7, 8 |
| Pocket geometry types | Task 1 |
| Pocket geometry mapping rules | Task 3 |
| `<PocketHoleMesh>` z-fight safety | Task 6 |
| `explodeOffset` per-role table | Task 5 |
| `<AssemblyView>` floor, lights, orbit | Task 8 |
| Tab wiring + empty state | Tasks 7, 9 |
| Pure-module tests | Tasks 1-5 |

No gaps.

**Type consistency check:**
- `PocketHoleMark` shape matches between Task 1 (definition), Task 2 (population), Task 6 (consumption). ✓
- `explodeOffset` signature `(part, carcass, shelfIdx, shelfCount, t)` is consistent across Tasks 4, 5, 8. ✓
- `Tab` union extended consistently. ✓

**Placeholder scan:** all code blocks contain real code, no TBDs or "implement later" markers. ✓

---

## Risks and notes

- **Z-fight risk** on pocket entrance ellipses: handled via `polygonOffset` in the material. If artifacts remain, increase the offset factor.
- **Edges from drei** may render slightly differently across GPUs. If outlines flicker, the alternative is `LineSegmentsGeometry` from drei. Not addressed in this plan.
- **Initial camera position** assumes the carcass is centered at origin (it is, in carcass-local coords). If the user later wants to also see the carcass in its room position, that'd require a separate "place in room" mode — out of scope here.
- The pocket-hole cylinder tilts toward the part's interior by `angleDeg`, but without knowing the mate-edge direction we don't tilt *toward the mate* specifically. The result is visually adequate (a tilted dark stub poking into the wood) and we can refine later if needed.
