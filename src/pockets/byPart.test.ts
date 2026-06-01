import { describe, expect, it } from "vitest";
import { defaultBookcase, defaultCatalog } from "../domain/defaults";
import { buildCarcass } from "../geometry/carcass";
import { buildPocketPlan } from "./plan";
import { groupPocketsByPart } from "./byPart";

describe("groupPocketsByPart", () => {
  it("produces one group per drilled part with one edge per joint", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const plan = buildPocketPlan(g.joints, g.parts, cat);
    const groups = groupPocketsByPart(plan, g.joints, g.parts);

    // Default bookcase: top + bottom each get pocket holes on both sides
    // (2 edges each). Shelves (default attachment = pocket-screw) likewise.
    // No toe-kick in defaults but shelves exist.
    const topGroup = groups.find((x) => x.partLabel === "Top");
    const botGroup = groups.find((x) => x.partLabel === "Bottom");
    expect(topGroup).toBeDefined();
    expect(botGroup).toBeDefined();
    expect(topGroup!.edges).toHaveLength(2);
    expect(botGroup!.edges).toHaveLength(2);
    expect(new Set(topGroup!.edges.map((e) => e.edge))).toEqual(
      new Set(["left", "right"]),
    );
  });

  it("resolves mate labels correctly", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const plan = buildPocketPlan(g.joints, g.parts, cat);
    const groups = groupPocketsByPart(plan, g.joints, g.parts);

    const topGroup = groups.find((x) => x.partLabel === "Top")!;
    const mates = topGroup.edges.map((e) => e.mateLabel).sort();
    expect(mates).toEqual(["Left side", "Right side"]);
  });

  it("orders edges deterministically (left, right, bottom, top)", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const plan = buildPocketPlan(g.joints, g.parts, cat);
    const groups = groupPocketsByPart(plan, g.joints, g.parts);

    for (const group of groups) {
      const order = group.edges.map((e) => e.edge);
      const sorted = [...order].sort((a, b) => {
        const o: Record<string, number> = {
          left: 0, right: 1, "bottom-edge": 2, "top-edge": 3, unknown: 4,
        };
        return o[a] - o[b];
      });
      expect(order).toEqual(sorted);
    }
  });

  it("excludes parts whose only joinery is non-pocket (e.g. shelf-pin)", () => {
    const c = defaultBookcase();
    // Switch shelves to shelf-pin so they aren't drilled.
    c.shelves = c.shelves.map((s) => ({ ...s, attachment: "shelf-pin" }));
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const plan = buildPocketPlan(g.joints, g.parts, cat);
    const groups = groupPocketsByPart(plan, g.joints, g.parts);

    const shelfGroups = groups.filter((x) => x.partLabel.startsWith("Shelf"));
    expect(shelfGroups).toHaveLength(0);
  });

  it("sorts groups by length desc (longest part first)", () => {
    const c = defaultBookcase();
    const cat = defaultCatalog();
    const g = buildCarcass(c, cat);
    const plan = buildPocketPlan(g.joints, g.parts, cat);
    const groups = groupPocketsByPart(plan, g.joints, g.parts);

    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].partLength).toBeGreaterThanOrEqual(
        groups[i].partLength,
      );
    }
  });
});
