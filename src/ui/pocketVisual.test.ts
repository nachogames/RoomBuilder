import { describe, expect, it } from "vitest";
import type { PartPocketGroup } from "../pockets/byPart";
import { partHeading, partSubtitle, renderPartSvg } from "./pocketVisual";

const fixtureGroup: PartPocketGroup = {
  partId: "p1",
  carcassId: "c1",
  partLabel: "Top",
  partLength: 19.25,
  partWidth: 14,
  partThickness: 0.75,
  edges: [
    {
      edge: "left",
      edgeLength: 14,
      holes: [2, 7, 12],
      jointId: "j1",
      jointLabel: "Top to left side",
      mateLabel: "Left side",
      setting: {
        thickness: 0.75,
        guideSetting: '3/4"',
        collarDepth: 0.75,
        screwLength: 1.25,
        screwType: "coarse",
      },
    },
    {
      edge: "right",
      edgeLength: 14,
      holes: [2, 7, 12],
      jointId: "j2",
      jointLabel: "Top to right side",
      mateLabel: "Right side",
      setting: {
        thickness: 0.75,
        guideSetting: '3/4"',
        collarDepth: 0.75,
        screwLength: 1.25,
        screwType: "coarse",
      },
    },
  ],
};

const fmt = (n: number) => `${n}"`;

describe("pocketVisual", () => {
  it("heading is the part label", () => {
    expect(partHeading(fixtureGroup)).toBe("Top");
  });

  it("subtitle includes dims and hole/edge counts", () => {
    const s = partSubtitle(fixtureGroup, fmt);
    expect(s).toContain("19.25\"");
    expect(s).toContain("14\"");
    expect(s).toContain("6 pocket holes");
    expect(s).toContain("2 edges");
  });

  it("svg renders one circle per hole", () => {
    const svg = renderPartSvg(fixtureGroup, fmt, "screen");
    const circleCount = (svg.match(/<circle/g) || []).length;
    expect(circleCount).toBe(6);
  });

  it("svg renders one leader line per hole", () => {
    const svg = renderPartSvg(fixtureGroup, fmt, "screen");
    const lineCount = (svg.match(/<line/g) || []).length;
    expect(lineCount).toBe(6);
  });

  it("screen mode uses 100% width, print mode uses physical inches", () => {
    const screen = renderPartSvg(fixtureGroup, fmt, "screen");
    expect(screen).toContain('width="100%"');
    const print = renderPartSvg(fixtureGroup, fmt, "print");
    expect(print).toMatch(/width="[\d.]+in"/);
  });

  it("dims to the nearer end", () => {
    // For a 14"-edge with holes at [2, 7, 12], dims should be 2, 7, 2
    // (12 is 2 from the far end).
    const svg = renderPartSvg(fixtureGroup, fmt, "screen");
    // Dims are inside <text> elements with content like `2&quot;` (the
    // quote in our fmt fn gets HTML-escaped).
    const dimMatches = [...svg.matchAll(/>([\d.]+)&quot;</g)].map((m) =>
      parseFloat(m[1]),
    );
    expect(dimMatches).toContain(2);
    expect(dimMatches).toContain(7);
  });
});
