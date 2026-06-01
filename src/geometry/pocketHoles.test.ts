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
  it("top-panel marks sit on the underside (-y) of the top, inset from the end", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const marks = pocketHoleMarks(g.parts, g.joints, cat);

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

    // Underside of the top panel is at center.y - thickness/2.
    const underside = topPart.center.y - topPart.box.y / 2;
    for (const m of leftMarks) {
      expect(m.center.y).toBeCloseTo(underside, 5);
      // Face normal points -y (out of the underside)
      expect(m.normal.x).toBeCloseTo(0, 5);
      expect(m.normal.y).toBeCloseTo(-1, 5);
      expect(m.normal.z).toBeCloseTo(0, 5);
      // The entrance is INSET from the -x end of the part, not flush
      // with the end-grain face.
      const minusXEnd = topPart.center.x - topPart.box.x / 2;
      expect(m.center.x).toBeGreaterThan(minusXEnd);
    }
  });

  it("right-edge top marks are inset from the +x end", () => {
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
      const plusXEnd = topPart.center.x + topPart.box.x / 2;
      expect(m.center.x).toBeLessThan(plusXEnd);
      // Drill axis tilts toward the +x end (the mate side)
      expect(m.drillAxis.x).toBeGreaterThan(0);
      // and primarily points up into the part
      expect(m.drillAxis.y).toBeGreaterThan(0);
    }
  });

  it("bottom panel marks sit on the underside (-y) of the bottom", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const marks = pocketHoleMarks(g.parts, g.joints, cat);

    const bottomJoint = g.joints.find(
      (j) =>
        j.method === "pocket-screw" &&
        j.drilledPartId !== undefined &&
        j.label.startsWith("Bottom"),
    )!;
    const bottomPart = g.parts.find((p) => p.id === bottomJoint.drilledPartId)!;
    const bMarks = marks.filter((m) => m.jointId === bottomJoint.id);
    expect(bMarks.length).toBeGreaterThan(0);

    const underside = bottomPart.center.y - bottomPart.box.y / 2;
    for (const m of bMarks) {
      expect(m.center.y).toBeCloseTo(underside, 5);
      expect(m.normal.y).toBeCloseTo(-1, 5);
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
