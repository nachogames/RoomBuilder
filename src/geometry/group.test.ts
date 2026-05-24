import { describe, it, expect } from "vitest";
import {
  ownedCarcasses,
  groupAABB,
  translateGroup,
  fitRunnerToCarcasses,
} from "./group";
import { defaultBookcase } from "../domain/defaults";
import type { Carcass } from "../domain/types";
import { deskAssembly, defaultProject, defaultRunner } from "../domain/defaults";
import type { Project } from "../domain/types";

function deskProject(): { project: Project; runnerId: string } {
  const { carcasses, runner } = deskAssembly();
  return {
    project: { ...defaultProject(), carcasses, runners: [runner] },
    runnerId: runner.id,
  };
}

describe("ownedCarcasses", () => {
  it("returns the cabinets the desktop owns", () => {
    const { project, runnerId } = deskProject();
    const r = project.runners.find((x) => x.id === runnerId)!;
    expect(ownedCarcasses(r, project).map((c) => c.label).sort()).toEqual([
      "Desk cabinet L",
      "Desk cabinet R",
    ]);
  });
});

describe("groupAABB", () => {
  it("unions the desktop (incl. overhang) with the owned cabinets", () => {
    const { project, runnerId } = deskProject();
    const r = project.runners.find((x) => x.id === runnerId)!;
    const bb = groupAABB(r, project);
    // desktop length 70 centred at 0 → ±35; cabinets outer ±33 → desktop wins
    expect(bb.minX).toBeCloseTo(-35, 6);
    expect(bb.maxX).toBeCloseTo(35, 6);
    // depth: desktop 24 vs cabinet 22 → desktop wins
    expect(bb.maxZ - bb.minZ).toBeCloseTo(24, 6);
  });
});

describe("fitRunnerToCarcasses", () => {
  it("spans the owned cabinets, centred, resting on top", () => {
    const a: Carcass = {
      ...defaultBookcase(),
      id: "A",
      width: 20.75,
      height: 30,
      baseHeight: 0,
      position: { x: -50, z: 4 },
    };
    const b: Carcass = {
      ...defaultBookcase(),
      id: "B",
      width: 20.75,
      height: 30,
      baseHeight: 0,
      position: { x: 50, z: 4 },
    };
    // a shelf (groupDrag false) spans the GAP between the cabinets:
    // left cab right edge -39.625 .. right cab left edge 39.625 → length 79.25
    const r = { ...defaultRunner(["A", "B"]), id: "R", groupDrag: false };
    const p = { ...defaultProject(), carcasses: [a, b], runners: [r] };
    const patch = fitRunnerToCarcasses(r, p);
    expect(patch.length).toBeCloseTo(79.25, 6);
    expect(patch.position!.x).toBeCloseTo(0, 6);
    expect(patch.position!.z).toBeCloseTo(4, 6);
    expect(patch.baseHeight).toBeCloseTo(30, 6); // top of the cabinets
  });

  it("a desk top (groupDrag) covers the cabinets to their outer edges", () => {
    const a: Carcass = { ...defaultBookcase(), id: "A", width: 20.75, height: 30, baseHeight: 0, position: { x: -50, z: 0 } };
    const b: Carcass = { ...defaultBookcase(), id: "B", width: 20.75, height: 30, baseHeight: 0, position: { x: 50, z: 0 } };
    const r = { ...defaultRunner(["A", "B"]), id: "R", groupDrag: true };
    const p = { ...defaultProject(), carcasses: [a, b], runners: [r] };
    // outer extent: -60.375 .. 60.375 → length 120.75
    expect(fitRunnerToCarcasses(r, p).length).toBeCloseTo(120.75, 6);
  });

  it("returns {} with no owned cabinets", () => {
    const r = { ...defaultRunner([]), id: "R" };
    const p = { ...defaultProject(), runners: [r] };
    expect(fitRunnerToCarcasses(r, p)).toEqual({});
  });
});

describe("translateGroup", () => {
  it("shifts the desktop and every owned cabinet by the same delta", () => {
    const { project, runnerId } = deskProject();
    const r = project.runners.find((x) => x.id === runnerId)!;
    const before = ownedCarcasses(r, project).map((c) => ({
      id: c.id,
      x: c.position.x,
      z: c.position.z,
    }));
    const out = translateGroup(r, project, 10, -4);
    expect(out.runner.position).toEqual({
      x: r.position.x + 10,
      z: r.position.z - 4,
    });
    for (const b of before) {
      expect(out.carcassPos[b.id]).toEqual({ x: b.x + 10, z: b.z - 4 });
    }
  });

  it("does not touch carcasses the desktop does not own", () => {
    const { project, runnerId } = deskProject();
    const r = project.runners.find((x) => x.id === runnerId)!;
    const out = translateGroup(r, project, 5, 5);
    const ownedIds = new Set(r.spannedCarcassIds);
    for (const c of project.carcasses) {
      if (!ownedIds.has(c.id)) expect(out.carcassPos[c.id]).toBeUndefined();
    }
  });
});
