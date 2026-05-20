import { describe, it, expect } from "vitest";
import { objectTop, snapHeight } from "./stacking";
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
