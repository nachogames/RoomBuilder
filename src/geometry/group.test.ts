import { describe, it, expect } from "vitest";
import { ownedCarcasses, groupAABB, translateGroup } from "./group";
import { deskAssembly, defaultProject } from "../domain/defaults";
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
