import { describe, it, expect } from "vitest";
import { buildCarcass } from "../geometry/carcass";
import { defaultBookcase, defaultCatalog } from "../domain/defaults";
import { buildCutList } from "../cutlist";
import { buildPocketPlan } from "../pockets/plan";
import { buildBom } from "./aggregate";

describe("buildBom (default bookcase)", () => {
  const c = defaultBookcase();
  const cat = defaultCatalog();
  const g = buildCarcass(c, cat);
  const cl = buildCutList(g.parts, cat);
  const plan = buildPocketPlan(g.joints, g.parts, cat);
  const bom = buildBom(g.joints, cl, plan);

  it("lists sheet goods, pocket screws, and back screws", () => {
    const cats = new Set(bom.lines.map((l) => l.category));
    expect(cats.has("Sheet goods")).toBe(true);
    expect(cats.has("Hardware")).toBe(true);

    const screws = bom.lines.find((l) => l.item.includes("pocket screw"));
    expect(screws).toBeDefined();
    expect(screws!.qty).toBeGreaterThan(20);

    const backScrews = bom.lines.find(
      (l) => l.category === "Hardware" && l.item.includes("(back)"),
    );
    expect(backScrews).toBeDefined();
    expect(backScrews!.qty).toBeGreaterThanOrEqual(4);
  });

  it("never lists a zero-qty line", () => {
    expect(bom.lines.every((l) => l.qty > 0)).toBe(true);
  });
});
