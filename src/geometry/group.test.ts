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
  it("a shelf runs INSIDE the outermost cabinets, ending on their far inside walls, and preserves baseHeight", () => {
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
    // long board through both cabinets: inside-left of A (= -50 -10.375 + 0.75
    // = -59.625) to inside-right of B (= 50 + 10.375 - 0.75 = +59.625)
    // → length 119.25 ; centred at 0
    const r = { ...defaultRunner(["A", "B"]), id: "R", groupDrag: false, baseHeight: 18 };
    const p = { ...defaultProject(), carcasses: [a, b], runners: [r] };
    const patch = fitRunnerToCarcasses(r, p);
    expect(patch.length).toBeCloseTo(119.25, 6);
    expect(patch.position!.x).toBeCloseTo(0, 6);
    expect(patch.position!.z).toBeCloseTo(4, 6);
    // shelf vertical position is the user's job — Span must not touch it
    expect(patch.baseHeight).toBeUndefined();
  });

  it("a desk top (groupDrag) covers the cabinets to their outer edges and rests on top", () => {
    const a: Carcass = { ...defaultBookcase(), id: "A", width: 20.75, height: 30, baseHeight: 0, position: { x: -50, z: 0 } };
    const b: Carcass = { ...defaultBookcase(), id: "B", width: 20.75, height: 30, baseHeight: 0, position: { x: 50, z: 0 } };
    const r = { ...defaultRunner(["A", "B"]), id: "R", groupDrag: true };
    const p = { ...defaultProject(), carcasses: [a, b], runners: [r] };
    const patch = fitRunnerToCarcasses(r, p);
    // outer extent: -60.375 .. 60.375 → length 120.75
    expect(patch.length).toBeCloseTo(120.75, 6);
    // desk top rests on the cabinets
    expect(patch.baseHeight).toBeCloseTo(30, 6);
  });

  it("two bookcases turned 90° to face each other → shelf ends at each back-panel inside face", () => {
    // Back panels are surface-mounted so the inner face of the back IS the
    // rear of the framing. In a 128.5" gap between two bookcases facing each
    // other, the shelf spans the full 128.5" between the framing rears.
    const left: Carcass = {
      ...defaultBookcase(),
      id: "L",
      width: 20.75,
      depth: 11.25,
      height: 72,
      baseHeight: 0,
      position: { x: 5.625, z: 50 },
      rotationDeg: 270, // back faces world −x (toward room's left wall)
    };
    const right: Carcass = {
      ...defaultBookcase(),
      id: "R",
      width: 20.75,
      depth: 11.25,
      height: 72,
      baseHeight: 0,
      position: { x: 122.875, z: 50 },
      rotationDeg: 90, // back faces world +x (toward room's right wall)
    };
    const r = { ...defaultRunner(["L", "R"]), id: "R0", groupDrag: false };
    const p = { ...defaultProject(), carcasses: [left, right], runners: [r] };
    const patch = fitRunnerToCarcasses(r, p);
    expect(patch.length).toBeCloseTo(128.5, 6);
    expect(patch.position!.x).toBeCloseTo(64.25, 6);
  });

  it("a single-cabinet shelf fits the interior width and keeps its baseHeight", () => {
    // 'put the board inside the cabinet, resting on a shelf' — Span should
    // size the board wall-to-wall inside the cavity without dragging the
    // vertical position back to the cabinet top.
    const a: Carcass = {
      ...defaultBookcase(),
      id: "A",
      width: 20.75,
      height: 72,
      baseHeight: 0,
      position: { x: 0, z: 0 },
    };
    // baseHeight 24.5 = "resting on a shelf at offsetFromBottom 20" (3 + 0.75 + 20 + 0.75)
    const r = { ...defaultRunner(["A"]), id: "R", groupDrag: false, baseHeight: 24.5 };
    const p = { ...defaultProject(), carcasses: [a], runners: [r] };
    const patch = fitRunnerToCarcasses(r, p);
    // interior width = 20.75 − 2·0.75 = 19.25 ; ends touch the inner side walls
    expect(patch.length).toBeCloseTo(19.25, 6);
    expect(patch.baseHeight).toBeUndefined();
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
