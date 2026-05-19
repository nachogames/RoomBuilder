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

describe("snapHeight", () => {
  it("snaps a bookcase onto an overlapping desktop runner", () => {
    const top = {
      ...defaultRunner([]),
      id: "TOP",
      position: { x: 0, z: 0 },
      length: 70,
      depth: 24,
      baseHeight: 28.5,
    };
    const shelf: Carcass = {
      ...defaultBookcase(),
      id: "S",
      position: { x: 10, z: 0 },
      width: 20,
      depth: 11,
    };
    const p = projectWith([shelf], [top]);
    expect(snapHeight(shelf, p)).toBeCloseTo(28.5 + 1.5, 6);
  });

  it("snaps a tote onto an overlapping carcass", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 24,
      depth: 24,
      height: 28.5,
      baseHeight: 0,
    };
    const tote = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 16,
      depth: 16,
    };
    expect(snapHeight(tote, projectWith([cab], [], [tote]))).toBeCloseTo(
      28.5,
      6,
    );
  });

  it("returns 0 when nothing overlaps below", () => {
    const a: Carcass = { ...defaultBookcase(), id: "A", position: { x: -100, z: 0 } };
    const b: Carcass = { ...defaultBookcase(), id: "B", position: { x: 100, z: 0 } };
    expect(snapHeight(b, projectWith([a, b]))).toBe(0);
  });

  it("excludes the object itself", () => {
    const only: Carcass = { ...defaultBookcase(), id: "ONLY" };
    expect(snapHeight(only, projectWith([only]))).toBe(0);
  });

  it("picks the highest overlapping surface", () => {
    const low: Carcass = {
      ...defaultBookcase(),
      id: "LOW",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 30,
      height: 20,
    };
    const high: Carcass = {
      ...defaultBookcase(),
      id: "HIGH",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 30,
      height: 36,
    };
    const obj: Carcass = {
      ...defaultBookcase(),
      id: "OBJ",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 10,
    };
    expect(snapHeight(obj, projectWith([low, high, obj]))).toBeCloseTo(36, 6);
  });
});
