import { describe, it, expect } from "vitest";
import { defaultProject, defaultBookcase, defaultRefBox } from "../domain/defaults";
import { resolveDrop, resolveShelfDrop } from "./placement";
import type { Carcass, RefBox, Person } from "../domain/types";

function projectWithCarcass(c: Carcass) {
  const p = defaultProject();
  return { ...p, carcasses: [c] };
}

describe("resolveDrop carcass", () => {
  it("moves XZ and floors a freely-dragged Y to 0", () => {
    const c: Carcass = { ...defaultBookcase(), id: "c1", position: { x: 0, z: 0 } };
    const p0 = projectWithCarcass(c);
    const { project } = resolveDrop(p0, "carcass", "c1", { x: 24, z: 12, y: 0 });
    const moved = project.carcasses[0];
    expect(moved.position.x).toBe(24);
    expect(moved.position.z).toBe(12);
    expect(moved.baseHeight).toBe(0);
  });

  it("honors a lifted Y when nothing is beneath", () => {
    const c: Carcass = { ...defaultBookcase(), id: "c1", position: { x: 0, z: 0 } };
    const p0 = projectWithCarcass(c);
    const { project } = resolveDrop(p0, "carcass", "c1", { x: 0, z: 0, y: 18 });
    expect(project.carcasses[0].baseHeight).toBe(18);
  });

  it("snaps Y back to floor when y is omitted (no manual lift requested)", () => {
    const c: Carcass = {
      ...defaultBookcase(),
      id: "c1",
      position: { x: 0, z: 0 },
      baseHeight: 18,
    };
    const p0 = projectWithCarcass(c);
    const { project } = resolveDrop(p0, "carcass", "c1", { x: 0, z: 0 });
    expect(project.carcasses[0].baseHeight).toBe(0);
  });
});

describe("resolveDrop refBox", () => {
  it("moves a free tote XZ and accepts manual Y lift", () => {
    const base = defaultProject();
    const b: RefBox = {
      id: "b1",
      label: "Tote",
      width: 12,
      depth: 12,
      height: 8,
      position: { x: 0, z: 0 },
      rotationDeg: 0,
      baseHeight: 0,
    };
    const p0 = { ...base, carcasses: [], runners: [], refBoxes: [b], people: [] };
    const { project } = resolveDrop(p0, "refBox", "b1", { x: 12, z: 12, y: 10 });
    const moved = project.refBoxes[0];
    expect(moved.position.x).toBeCloseTo(12);
    expect(moved.position.z).toBeCloseTo(12);
    expect(moved.baseHeight).toBe(10);
  });
});

describe("resolveDrop person", () => {
  it("moves XZ and never touches baseHeight when y is undefined", () => {
    const base = defaultProject();
    const person: Person = {
      id: "p1",
      label: "Me",
      position: { x: 0, z: 0 },
      rotationDeg: 0,
      pose: "standing",
      height: 70,
    };
    const p0 = { ...base, people: [person] };
    const { project } = resolveDrop(p0, "person", "p1", { x: 24, z: 12 });
    const moved = project.people[0];
    expect(moved.position.x).toBe(24);
    expect(moved.position.z).toBe(12);
    expect(moved.baseHeight).toBeUndefined();
  });
});

describe("resolveDrop unknown id", () => {
  it("returns the project unchanged", () => {
    const p0 = defaultProject();
    const { project } = resolveDrop(p0, "carcass", "does-not-exist", { x: 0, z: 0 });
    expect(project).toBe(p0);
  });
});

describe("stack-follow: items resting on a moved support ride with it", () => {
  it("raising a refBox lifts a tote sitting on top by the same Y delta", () => {
    const base = defaultProject();
    const lower: RefBox = {
      ...defaultRefBox(),
      id: "low",
      position: { x: 0, z: 0 },
      width: 20,
      depth: 20,
      height: 10,
      baseHeight: 0,
    };
    const upper: RefBox = {
      ...defaultRefBox(),
      id: "up",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 10,
      height: 6,
      baseHeight: 10, // sitting on top of `lower`
    };
    const p0 = { ...base, carcasses: [], runners: [], refBoxes: [lower, upper], people: [] };
    const { project } = resolveDrop(p0, "refBox", "low", { x: 0, z: 0, y: 18 });
    const newLow = project.refBoxes.find((b) => b.id === "low")!;
    const newUp = project.refBoxes.find((b) => b.id === "up")!;
    expect(newLow.baseHeight).toBe(18);
    // upper rode the same +18 delta (10 -> 28), staying on top of `lower`
    expect(newUp.baseHeight).toBe(28);
  });

  it("raising a carcass carries shelf-resting totes with it", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      baseHeight: 0,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote: RefBox = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      height: 6,
      baseHeight: 24.5, // on shelf 0
    };
    const base = defaultProject();
    const p0 = { ...base, carcasses: [cab], runners: [], refBoxes: [tote], people: [] };
    const { project } = resolveDrop(p0, "carcass", "CAB", { x: 0, z: 0, y: 12 });
    expect(project.carcasses[0].baseHeight).toBe(12);
    expect(project.refBoxes[0].baseHeight).toBeCloseTo(24.5 + 12, 6);
  });
});

describe("resolveShelfDrop", () => {
  it("clamps offset within interior bounds and translates dependents by the same dy", () => {
    const cab: Carcass = {
      ...defaultBookcase(),
      id: "CAB",
      position: { x: 0, z: 0 },
      width: 30,
      depth: 12,
      height: 72,
      toeKickHeight: 3,
      baseHeight: 0,
      shelves: [{ offsetFromBottom: 20, attachment: "pocket-screw" }],
    };
    const tote: RefBox = {
      ...defaultRefBox(),
      id: "T",
      position: { x: 0, z: 0 },
      width: 10,
      depth: 8,
      height: 6,
      baseHeight: 24.5, // on shelf 0 (offset 20)
    };
    const base = defaultProject();
    const p0 = { ...base, carcasses: [cab], runners: [], refBoxes: [tote], people: [] };
    // raise the shelf 6"
    const { project } = resolveShelfDrop(p0, "CAB", 0, 26);
    expect(project.carcasses[0].shelves[0].offsetFromBottom).toBe(26);
    expect(project.refBoxes[0].baseHeight).toBeCloseTo(24.5 + 6, 6);
  });

  it("no-op for unknown carcass or shelf index", () => {
    const p = defaultProject();
    expect(resolveShelfDrop(p, "nope", 0, 5).project).toBe(p);
    const cabId = p.carcasses[0]?.id;
    if (cabId) {
      expect(resolveShelfDrop(p, cabId, 99, 5).project).toBe(p);
    }
  });
});
