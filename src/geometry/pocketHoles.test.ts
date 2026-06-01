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
