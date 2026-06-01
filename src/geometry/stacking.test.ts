import { describe, it, expect } from "vitest";
import {
  objectTop,
  snapHeight,
  surfaceUnderPoint,
  dependentsOf,
  shelfSurfaceId,
} from "./stacking";
import {
  defaultBookcase,
  defaultRunner,
  defaultRefBox,
  defaultProject,
} from "../domain/defaults";
import type { Carcass, Project } from "../domain/types";

function projectWith(
  carcasses: Carcass[],
  runners = [] as Project["runners"],
  refBoxes = [] as Project["refBoxes"],
): Project {
  return { ...defaultProject(), carcasses, runners, refBoxes };
}

describe("objectTop", () => {
  it("carcass top = baseHeight + height", () => {
    const c: Carcass = { ...defaultBookcase(), id: "C", height: 30, baseHeight: 5 };
    expect(objectTop(c, projectWith([c]))).toBeCloseTo(35, 6);
  });
  it("runner top = baseHeight + board thickness (2x12 = 1.5)", () => {
    const r = { ...defaultRunner([]), id: "R", baseHeight: 28.5 };
    expect(objectTop(r, projectWith([], [r]))).toBeCloseTo(30, 6);
  });
  it("tote top = baseHeight + height", () => {
    const b = { ...defaultRefBox(), id: "B", height: 12, baseHeight: 3 };
    expect(objectTop(b, projectWith([], [], [b]))).toBeCloseTo(15, 6);
  });
});

describe("snapHeight — surfaces at or below current Y", () => {
  it("drops a tote (Y high) onto the highest shelf below it inside a bookcase", () => {
    // Bookcase: toeKick 3, carcass 0.75 → interior floor 3.75. Three evenly
    // spaced shelves inside a 72" cabinet give shelf tops at known Ys; we
    // override shelves explicitly to make the test deterministic.
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      shelves: [
        { offsetFromBottom: 20, attachment: "pocket-screw" },
        { offsetFromBottom: 40, attachment: "pocket-screw" },
        { offsetFromBottom: 60, attachment: "pocket-screw" },
      ],
    };
    // 3/4" carcass + 3/4" shelves; interior floor at 3 + 0.75 = 3.75
    // Shelf top Ys (absolute, baseHeight 0): 3.75 + 20 + 0.75 = 24.5,
    // 44.5, 64.5. Cabinet top is 72.
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 50, // sitting above the middle shelf, below the top one
    };
    expect(snapHeight(tote, projectWith([cab], [], [tote]))).toBeCloseTo(
      44.5,
      6,
    );
  });

  it("snaps to the bookcase's cavity floor (above the toe kick) when nothing else is below", () => {
    // toeKick 3 + 0.75" carcass bottom = cavity floor at 3.75 ; the only shelf
    // is at offsetFromBottom 30 → shelf top 34.5, well above Pos Y. The cavity
    // floor is now the highest surface ≤ Pos Y.
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      shelves: [{ offsetFromBottom: 30, attachment: "pocket-screw" }],
    };
    const runner = {
      ...defaultRunner([]),
      id: "R",
      position: { x: 0, z: 0 },
      length: 20,
      depth: 10,
      baseHeight: 10,
    };
    expect(snapHeight(runner, projectWith([cab], [runner]))).toBeCloseTo(
      3.75,
      6,
    );
  });

  it("snaps to the cabinet top when Pos Y is above every shelf", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 90,
    };
    expect(snapHeight(tote, projectWith([cab], [], [tote]))).toBeCloseTo(
      72,
      6,
    );
  });

  it("returns 0 (floor) when current Y is below every overlapping surface", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 0,
    };
    expect(snapHeight(tote, projectWith([cab], [], [tote]))).toBe(0);
  });

  it("stays put when already sitting on a surface (epsilon)", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 28.5,
      shelves: [],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 28.5,
    };
    expect(snapHeight(tote, projectWith([cab], [], [tote]))).toBeCloseTo(
      28.5,
      6,
    );
  });

  it("snaps a bookcase onto a desktop runner it overlaps (Y above runner top)", () => {
    const top = {
      ...defaultRunner([]),
      id: "TOP",
      position: { x: 0, z: 0 },
      length: 70,
      depth: 24,
      baseHeight: 28.5, // top surface 30 (28.5 + 1.5)
    };
    const shelf: Carcass = {
      ...defaultBookcase(),
      id: "S",
      position: { x: 10, z: 0 },
      width: 20,
      depth: 11,
      baseHeight: 50,
    };
    expect(snapHeight(shelf, projectWith([shelf], [top]))).toBeCloseTo(30, 6);
  });

  it("excludes the target's own shelves and own surfaces", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
      baseHeight: 10,
    };
    expect(snapHeight(cab, projectWith([cab]))).toBe(0);
  });
});

describe("surfaceUnderPoint — highest surface ≤ maxY at a world (x,z) point", () => {
  it("returns 0 (floor) when nothing overlaps the point", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "C",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      shelves: [],
    };
    // point (100, 100) is well outside the cabinet footprint
    expect(surfaceUnderPoint(100, 100, 100, projectWith([cab]))).toBe(0);
  });

  it("returns the desktop's top surface when a runner sits below the point", () => {
    // desktop runner at baseHeight 28.5, ply-1.5 board → top surface 30
    const desktop = {
      ...defaultRunner([]),
      id: "DT",
      boardMaterialId: "ply-1.5",
      position: { x: 0, z: 0 },
      length: 70,
      depth: 24,
      baseHeight: 28.5,
    };
    // point at origin, maxY 60 (a shelf above) → top of desk = 30
    expect(
      surfaceUnderPoint(0, 0, 60, projectWith([], [desktop])),
    ).toBeCloseTo(30, 6);
  });

  it("excludes the optional excludeId so a runner doesn't see itself", () => {
    const desktop = {
      ...defaultRunner([]),
      id: "DT",
      boardMaterialId: "ply-1.5",
      position: { x: 0, z: 0 },
      length: 70,
      depth: 24,
      baseHeight: 28.5,
    };
    // excluding DT: no other surface at this point → 0
    expect(
      surfaceUnderPoint(0, 0, 60, projectWith([], [desktop]), "DT"),
    ).toBe(0);
  });

  it("picks the HIGHEST surface ≤ maxY when multiple stack up", () => {
    const desktop = {
      ...defaultRunner([]),
      id: "DT",
      boardMaterialId: "ply-1.5",
      position: { x: 0, z: 0 },
      length: 70,
      depth: 24,
      baseHeight: 28.5, // top 30
    };
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "C",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 18,
      baseHeight: 0,
      shelves: [],
      // cabinet top at 18 < 30 (desktop top) — desktop wins
    };
    expect(
      surfaceUnderPoint(0, 0, 60, projectWith([cab], [desktop])),
    ).toBeCloseTo(30, 6);
  });

  it("ignores surfaces above maxY (a leg only sees surfaces below the runner's underside)", () => {
    const desktop = {
      ...defaultRunner([]),
      id: "DT",
      boardMaterialId: "ply-1.5",
      position: { x: 0, z: 0 },
      length: 70,
      depth: 24,
      baseHeight: 50, // top 51.5
    };
    // maxY 30 < desktop top 51.5 → not a candidate → falls back to 0
    expect(surfaceUnderPoint(0, 0, 30, projectWith([], [desktop]))).toBe(0);
  });
});

describe("dependentsOf — items resting on a support", () => {
  it("returns direct dependents: tote on a shelf top", () => {
    // toeKick 3 + carcass 0.75 → interior floor 3.75
    // shelf offsetFromBottom 20 → shelf top 3.75 + 20 + 0.75 = 24.5
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 24.5,
    };
    const p = projectWith([cab], [], [tote]);
    expect(dependentsOf(p, shelfSurfaceId("CAB", 0))).toEqual(["T"]);
  });

  it("returns transitive dependents: tote on runner on shelf", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 40,
      depth: 16,
      height: 72,
      toeKickHeight: 3,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    // shelf top at 24.5; runner sits there
    const runner = {
      ...defaultRunner([]),
      id: "R",
      boardMaterialId: "ply-1.5",
      position: { x: 0, z: 0 },
      length: 30,
      depth: 12,
      baseHeight: 24.5,
    };
    // runner top at 24.5 + 1.5 = 26; tote sits on the runner
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 26,
    };
    const p = projectWith([cab], [runner], [tote]);
    const deps = dependentsOf(p, shelfSurfaceId("CAB", 0));
    expect(new Set(deps)).toEqual(new Set(["R", "T"]));
  });

  it("excludes items at the wrong Y even with overlapping footprint", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 40, // not on the shelf at 24.5
    };
    const p = projectWith([cab], [], [tote]);
    expect(dependentsOf(p, shelfSurfaceId("CAB", 0))).toEqual([]);
  });

  it("excludes items at the right Y but with non-overlapping footprint", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 200, z: 0 }, // far away
      width: 10,
      depth: 8,
      baseHeight: 24.5,
    };
    const p = projectWith([cab], [], [tote]);
    expect(dependentsOf(p, shelfSurfaceId("CAB", 0))).toEqual([]);
  });

  it("a carcass support reports dependents resting on its top", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 30, // top at 30
      baseHeight: 0,
      shelves: [],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 30,
    };
    const p = projectWith([cab], [], [tote]);
    expect(dependentsOf(p, "CAB")).toEqual(["T"]);
  });

  it("raising the carcass carries items on its shelves with it (carcass query includes shelf-resting items)", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      baseHeight: 24.5, // on shelf 0
    };
    const p = projectWith([cab], [], [tote]);
    // The tote rides up when the whole bookcase rises — it's a dependent
    // of the carcass too, via the shelf-surface seeded into the search.
    expect(dependentsOf(p, "CAB")).toEqual(["T"]);
  });
});
