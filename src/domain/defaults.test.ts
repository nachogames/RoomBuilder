import { describe, it, expect } from "vitest";
import {
  normalizeProject,
  defaultProject,
  defaultBookcase,
  defaultCatalog,
  defaultRunner,
  uid,
  RUNNER_PROFILES,
} from "./defaults";
import { runnerLayout } from "../geometry/runner";

describe("uid", () => {
  it("never repeats, even across many calls", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => uid("carcass")));
    expect(ids.size).toBe(2000);
  });
});

describe("normalizeProject id de-duplication", () => {
  it("re-ids colliding objects, keeps the first, preserves runner refs", () => {
    // simulate the bug: a freshly added bookcase reused a desk cabinet's id
    const cab = { ...defaultBookcase(), id: "carcass-x", label: "Desk cab" };
    const book = {
      ...defaultBookcase(),
      id: "carcass-x",
      label: "Bookcase",
      position: { x: 0, z: 0 },
    };
    const runner = { ...defaultRunner(["carcass-x"]), id: "runner-y" };
    const p = {
      ...defaultProject(),
      carcasses: [cab, book],
      runners: [runner],
      refBoxes: [],
    };
    const n = normalizeProject(p);
    const ids = [...n.carcasses, ...n.runners, ...n.refBoxes].map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    // first occurrence keeps its id; the runner still references it
    expect(n.carcasses[0].id).toBe("carcass-x");
    expect(n.carcasses[1].id).not.toBe("carcass-x");
    expect(n.runners[0].spannedCarcassIds).toEqual(["carcass-x"]);
  });
});

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

  it("defaults groupDrag: false for plain runners, true for desk tops", () => {
    expect(defaultRunner([]).groupDrag).toBe(false);
    // a legacy runner labelled 'Desk top' migrates to groupDrag true
    const p = defaultProject();
    p.runners = [
      { id: "R", label: "Desk top", boardMaterialId: "ply-0.75", spannedCarcassIds: [], depth: 24, length: 70, position: { x: 0, z: 0 }, rotationDeg: 0, baseHeight: 28.5, fastening: "screw-through", supports: [] } as never,
    ];
    expect(normalizeProject(p).runners[0].groupDrag).toBe(true);
    p.runners = [
      { id: "S", label: "Runner shelf", boardMaterialId: "pine-2x12", spannedCarcassIds: [], depth: 11, length: 60, position: { x: 0, z: 0 }, rotationDeg: 0, baseHeight: 30, fastening: "pocket-screw", supports: [] } as never,
    ];
    expect(normalizeProject(p).runners[0].groupDrag).toBe(false);
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
