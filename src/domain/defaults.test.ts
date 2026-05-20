import { describe, it, expect } from "vitest";
import {
  normalizeProject,
  defaultProject,
  defaultBookcase,
  defaultCatalog,
  RUNNER_PROFILES,
} from "./defaults";
import { runnerLayout } from "../geometry/runner";

describe("normalizeProject carcass stacking defaults", () => {
  it("fills baseHeight=0 on legacy carcasses", () => {
    const p = defaultProject();
    // simulate an older saved project lacking the new fields
    const legacy = { ...defaultBookcase(), id: "OLD" } as Record<
      string,
      unknown
    >;
    delete legacy.baseHeight;
    p.carcasses = [legacy as never];

    const n = normalizeProject(p);
    expect(n.carcasses[0].baseHeight).toBe(0);
  });

  it("migrates a legacy auto-derived runner, preserving its geometry", () => {
    const p = defaultProject();
    const a = { ...defaultBookcase(), id: "A", position: { x: -50, z: 3 } };
    const b = { ...defaultBookcase(), id: "B", position: { x: 50, z: 3 } };
    p.carcasses = [a, b];
    // old shape: no position/length; derived from spanned + overhang + nudge
    p.runners = [
      {
        id: "R",
        label: "Old top",
        boardMaterialId: "pine-2x12",
        spannedCarcassIds: ["A", "B"],
        bottomHeight: 30,
        depth: 11.25,
        overhangEachEnd: 1,
        nudge: { x: 0, z: 0 },
        fastening: "pocket-screw",
        supports: [],
      } as never,
    ];
    const legacyLeft = -50 - 10.375 - 1; // a.left - overhang
    const legacyRight = 50 + 10.375 + 1;

    const n = normalizeProject(p);
    const r = n.runners[0];
    expect(r.position.x).toBeCloseTo((legacyLeft + legacyRight) / 2, 6);
    expect(r.position.z).toBeCloseTo(3, 6);
    expect(r.length).toBeCloseTo(legacyRight - legacyLeft, 6);
    expect(r.baseHeight).toBe(30);
    expect(r.rotationDeg).toBe(0);
    // new layout reproduces the legacy world extents
    const L = runnerLayout(r, n.carcasses, defaultCatalog());
    expect(L.worldLeft).toBeCloseTo(legacyLeft, 6);
    expect(L.worldRight).toBeCloseTo(legacyRight, 6);
  });

  it("defaults rotation/baseHeight on legacy totes", () => {
    const p = defaultProject();
    p.refBoxes = [
      { id: "T", label: "Tote", width: 16, height: 12, depth: 24, position: { x: 0, z: 0 } } as never,
    ];
    const n = normalizeProject(p);
    expect(n.refBoxes[0].rotationDeg).toBe(0);
    expect(n.refBoxes[0].baseHeight).toBe(0);
  });

  it("every runner profile maps to a material in defaultCatalog", () => {
    const ids = new Set(defaultCatalog().materials.map((m) => m.id));
    for (const p of RUNNER_PROFILES) expect(ids.has(p.materialId)).toBe(true);
  });

  it("preserves an explicit baseHeight", () => {
    const p = defaultProject();
    p.carcasses = [{ ...defaultBookcase(), id: "C", baseHeight: 30 }];
    const n = normalizeProject(p);
    expect(n.carcasses[0].baseHeight).toBe(30);
  });
});
