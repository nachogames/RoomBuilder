import { describe, it, expect } from "vitest";
import { buildCarcass } from "../geometry/carcass";
import { defaultBookcase, defaultCatalog } from "../domain/defaults";
import { buildPocketPlan, totalPocketScrews } from "./plan";
import { kregForThickness, holePositions } from "./kreg";

describe("kregForThickness", () => {
  it("maps 3/4\" stock to the 3/4 guide and 1-1/4\" coarse screw", () => {
    const k = kregForThickness(0.75);
    expect(k.guideSetting).toBe('3/4"');
    expect(k.collarDepth).toBe(0.75);
    expect(k.screwLength).toBe(1.25);
    expect(k.screwType).toBe("coarse");
  });
});

describe("holePositions", () => {
  it("is symmetric and within the edge", () => {
    const p = holePositions(11.25);
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p[0]).toBeGreaterThan(0);
    expect(p[p.length - 1]).toBeLessThan(11.25);
    expect(p[0] + p[p.length - 1]).toBeCloseTo(11.25, 6); // symmetric
  });
  it("single centered hole for tiny edges", () => {
    expect(holePositions(1)).toEqual([0.5]);
  });
});

describe("buildPocketPlan (default bookcase)", () => {
  const c = defaultBookcase();
  const cat = defaultCatalog();
  const g = buildCarcass(c, cat);
  const plan = buildPocketPlan(g.joints, g.parts, cat);

  it("has an entry for every pocket-screw joint", () => {
    expect(plan).toHaveLength(12);
  });
  it("every entry uses the 3/4\" setting (all drilled parts are 3/4\" ply)", () => {
    expect(plan.every((e) => e.setting.guideSetting === '3/4"')).toBe(true);
  });
  it("totals pocket screws by length", () => {
    const totals = totalPocketScrews(plan);
    const sum = [...totals.values()].reduce((a, b) => a + b, 0);
    expect(totals.get(1.25)).toBe(sum); // all 3/4" -> 1-1/4" screws
    expect(sum).toBeGreaterThan(20);
  });
});
