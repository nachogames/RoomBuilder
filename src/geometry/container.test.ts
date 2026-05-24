import { describe, it, expect } from "vitest";
import { findContainer, clampToInterior } from "./container";
import { defaultBookcase, defaultProject } from "../domain/defaults";
import type { Carcass, Project } from "../domain/types";

function proj(carcasses: Carcass[]): Project {
  return { ...defaultProject(), carcasses };
}
// bookcase: 20.75 wide, 11.25 deep, 3/4" sides, 1/4" back
// innerW = 20.75 - 1.5 = 19.25 ; interiorD = 11.25 - 0.25 = 11
const book = (over: Partial<Carcass> = {}): Carcass => ({
  ...defaultBookcase(),
  id: "BK",
  position: { x: 0, z: 0 },
  rotationDeg: 0,
  ...over,
});

describe("findContainer", () => {
  it("captures a small item whose footprint fits and overlaps", () => {
    const p = proj([book()]);
    const c = findContainer(
      { id: "T", w: 16, d: 8, cx: 0, cz: 0 },
      p,
    );
    expect(c?.id).toBe("BK");
  });

  it("does not capture an item too wide for the cavity", () => {
    const p = proj([book()]);
    expect(findContainer({ id: "T", w: 30, d: 8, cx: 0, cz: 0 }, p)).toBeNull();
  });

  it("captures a deep-but-narrow item (front open; it sticks out)", () => {
    const p = proj([book()]);
    expect(findContainer({ id: "T", w: 16, d: 30, cx: 0, cz: 0 }, p)?.id).toBe(
      "BK",
    );
  });

  it("does not capture when the centre isn't over the bookcase", () => {
    const p = proj([book()]);
    expect(
      findContainer({ id: "T", w: 16, d: 8, cx: 100, cz: 0 }, p),
    ).toBeNull();
  });

  it("excludes itself and excludeIds", () => {
    const p = proj([book()]);
    expect(findContainer({ id: "BK", w: 16, d: 8, cx: 0, cz: 0 }, p)).toBeNull();
    expect(
      findContainer(
        { id: "T", w: 16, d: 8, cx: 0, cz: 0, excludeIds: ["BK"] },
        p,
      ),
    ).toBeNull();
  });
});

describe("clampToInterior (sides + back, front open)", () => {
  const c = book();
  const p = proj([c]);

  it("clamps to the inner side walls", () => {
    // innerW 19.25, item 16 → centre limited to ±1.625
    const r = clampToInterior(c, 16, 8, 100, 0, p);
    expect(r.x).toBeCloseTo(1.625, 6);
    expect(r.z).toBeCloseTo(0, 6);
  });

  it("stops at the back wall", () => {
    // backInner = -11.25/2 + 0.25 = -5.375 ; minLz = -5.375 + 4 = -1.375
    const r = clampToInterior(c, 16, 8, 0, -100, p);
    expect(r.z).toBeCloseTo(-1.375, 6);
  });

  it("leaves the front open (no clamp toward +z)", () => {
    const r = clampToInterior(c, 16, 8, 0, 100, p);
    expect(r.z).toBeCloseTo(100, 6);
  });

  it("does not back-clamp an item deeper than the cavity (no forward snap)", () => {
    // itemD 30 > cavity 11 → z follows the target freely, sides still clamp
    expect(clampToInterior(c, 16, 30, 0, -100, p).z).toBeCloseTo(-100, 6);
    expect(clampToInterior(c, 16, 30, 0, 2, p).z).toBeCloseTo(2, 6);
    expect(clampToInterior(c, 100, 30, 100, 0, p).x).toBeCloseTo(0, 6);
  });
});
