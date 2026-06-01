import { describe, expect, it } from "vitest";
import { pocketHoleMarks } from "./pocketHoles";
import { defaultCatalog, defaultBookcase } from "../domain/defaults";
import { buildCarcass } from "./carcass";
import { holePositions } from "../pockets/kreg";

describe("pocketHoleMarks", () => {
  it("returns no marks for empty input", () => {
    expect(pocketHoleMarks([], [], defaultCatalog())).toEqual([]);
  });
});

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
