import { describe, expect, it } from "vitest";
import { defaultBookcase, defaultCatalog } from "./defaults";
import { shelfMarks } from "./shelves";

const catalog = defaultCatalog();
const t = catalog.materials.find(
  (m) => m.id === defaultBookcase().carcassMaterialId,
)!.thickness; // 0.75
const ts = catalog.materials.find(
  (m) => m.id === defaultBookcase().shelfMaterialId,
)!.thickness;

describe("shelfMarks", () => {
  const base = {
    ...defaultBookcase(),
    toeKickHeight: 3,
    shelves: [
      { offsetFromBottom: 12, attachment: "pocket-screw" as const },
      { offsetFromBottom: 26, attachment: "pocket-screw" as const },
    ],
  };

  it("tall sides: marks measured from the side panel's floor end", () => {
    const { marks } = shelfMarks(base, catalog);
    // side runs full height, so the mark includes toe kick + bottom panel
    expect(marks[0].markFromSideBottom).toBe(3 + t + 12);
    expect(marks[1].markFromSideBottom).toBe(3 + t + 26);
  });

  it("capped: sides start on the bottom panel, so marks equal the offsets", () => {
    const { marks } = shelfMarks(
      { ...base, construction: "capped" },
      catalog,
    );
    expect(marks[0].markFromSideBottom).toBe(12);
    expect(marks[1].markFromSideBottom).toBe(26);
  });

  it("reports clear openings between shelves and to the top", () => {
    const { marks, topClear } = shelfMarks(base, catalog);
    expect(marks[0].clearBelow).toBe(12);
    expect(marks[1].clearBelow).toBe(26 - (12 + ts));
    const interiorH = base.height - base.toeKickHeight - 2 * t;
    expect(topClear).toBe(interiorH - (26 + ts));
  });

  it("orders marks bottom-up while keeping original shelf numbers", () => {
    const scrambled = {
      ...base,
      shelves: [
        { offsetFromBottom: 26, attachment: "pocket-screw" as const },
        { offsetFromBottom: 12, attachment: "pocket-screw" as const },
      ],
    };
    const { marks } = shelfMarks(scrambled, catalog);
    expect(marks.map((m) => m.shelfNumber)).toEqual([2, 1]);
    expect(marks[0].markFromSideBottom).toBeLessThan(marks[1].markFromSideBottom);
  });
});
