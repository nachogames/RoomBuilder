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
    // Surface-mounted back sits behind the framing, so backInner is just
    // -depth/2 = -5.625. minLz = -5.625 + 4 = -1.625
    const r = clampToInterior(c, 16, 8, 0, -100, p);
    expect(r.z).toBeCloseTo(-1.625, 6);
  });

  it("leaves the front open (no clamp toward +z)", () => {
    const r = clampToInterior(c, 16, 8, 0, 100, p);
    expect(r.z).toBeCloseTo(100, 6);
  });

  it("stops a deep item's rear at the back wall (extra depth pokes out front)", () => {
    // itemD 30 > cavity 11.25: backInner -5.625, hz 15 → minLz 9.375, so the
    // rear edge lands on the back inner face and the rest sticks out the
    // open front.
    expect(clampToInterior(c, 16, 30, 0, -100, p).z).toBeCloseTo(9.375, 6);
    expect(clampToInterior(c, 16, 30, 0, 2, p).z).toBeCloseTo(9.375, 6);
    // pulled toward the open front it still follows freely (front stays open)
    expect(clampToInterior(c, 16, 30, 0, 100, p).z).toBeCloseTo(100, 6);
    // sides still clamp
    expect(clampToInterior(c, 100, 30, 100, 0, p).x).toBeCloseTo(0, 6);
  });
});

describe("findContainer is rotation-aware (uses the turned footprint)", () => {
  it("rejects a box that no longer fits once rotated 90°", () => {
    // w16/d30 fits un-turned (16 ≤ 19.25); turned 90° the 30 faces the sides
    const p = proj([book()]);
    expect(
      findContainer({ id: "T", w: 16, d: 30, cx: 0, cz: 0, rotationDeg: 90 }, p),
    ).toBeNull();
  });

  it("captures a box that only fits once rotated 90°", () => {
    // w30/d16 too wide un-turned; turned 90° the 16 faces the sides (≤ 19.25)
    const p = proj([book()]);
    expect(
      findContainer({ id: "T", w: 30, d: 16, cx: 0, cz: 0, rotationDeg: 90 }, p)
        ?.id,
    ).toBe("BK");
  });
});

describe("findContainer only captures from the open-front side", () => {
  it("captures a deep item whose centre is in front of the back wall", () => {
    // back inner at -5.375 ; centre at +5.75 (the clamped resting position for
    // a 30-deep item) is in front of the back wall — captured normally
    const p = proj([book()]);
    expect(findContainer({ id: "T", w: 16, d: 30, cx: 0, cz: 5.75 }, p)?.id)
      .toBe("BK");
  });

  it("does not capture from behind the back wall (no previous position)", () => {
    // centre at -10 is past the back inner face (-5.375); without a prev
    // position in front, we don't yank the item in through the solid back
    const p = proj([book()]);
    expect(findContainer({ id: "T", w: 16, d: 30, cx: 0, cz: -10 }, p))
      .toBeNull();
  });

  it("holds capture when the previous position was in front (push-from-inside)", () => {
    // prev centre at +5 (in front of back). User shoves target far past back.
    // Capture must hold so the back clamp can pin the rear at the back wall.
    const p = proj([book()]);
    expect(
      findContainer(
        { id: "T", w: 16, d: 30, cx: 0, cz: -10, prevPos: { x: 0, z: 5 } },
        p,
      )?.id,
    ).toBe("BK");
  });

  it("does not capture when the previous position was also behind the back wall", () => {
    const p = proj([book()]);
    expect(
      findContainer(
        { id: "T", w: 16, d: 30, cx: 0, cz: -10, prevPos: { x: 0, z: -10 } },
        p,
      ),
    ).toBeNull();
  });

  it("releases once the footprint clears the carcass entirely", () => {
    // centred 25 behind: a 30-deep item (half 15) no longer overlaps the
    // 11.25-deep carcass (5.625 + 15 = 20.625 < 25) → not captured
    const p = proj([book()]);
    expect(findContainer({ id: "T", w: 16, d: 30, cx: 0, cz: -25 }, p))
      .toBeNull();
  });

  it("still requires the centre to be laterally over the carcass", () => {
    const p = proj([book()]);
    expect(findContainer({ id: "T", w: 16, d: 30, cx: 100, cz: 0 }, p))
      .toBeNull();
  });
});

describe("clampToInterior is rotation-aware (edges stay off the inner walls)", () => {
  const c = book();
  const p = proj([c]);

  it("clamps the sides by the turned footprint", () => {
    // box w8/d16 turned 90° → 16 faces the sides; centre limited to
    // ±(19.25/2 − 16/2) = ±1.625
    const r = clampToInterior(c, 8, 16, 100, 0, p, 90);
    expect(r.x).toBeCloseTo(1.625, 6);
    expect(r.z).toBeCloseTo(0, 6);
  });

  it("stops at the back by the turned footprint", () => {
    // box w8/d4 turned 90° → 8 faces front/back; minLz = -5.625 + 4 = -1.625
    const r = clampToInterior(c, 8, 4, 0, -100, p, 90);
    expect(r.z).toBeCloseTo(-1.625, 6);
  });

  it("handles an arbitrary angle (45°)", () => {
    // square 8×8 at 45° → side extent = 8/2·(cos45+sin45) = 5.65685;
    // centre limited to ±(9.625 − 5.65685) = ±3.96815
    const r = clampToInterior(c, 8, 8, 100, 0, p, 45);
    expect(r.x).toBeCloseTo(3.96815, 4);
  });

  it("uses the box angle relative to the carcass rotation", () => {
    // carcass turned 90°, box un-turned → relative −90°, so the box's depth
    // (16) faces the sides → centre limited to ±1.625 along the carcass width
    const rc = book({ rotationDeg: 90 });
    const rp = proj([rc]);
    const r = clampToInterior(rc, 8, 16, 0, 100, rp, 0);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.z).toBeCloseTo(1.625, 6);
  });
});
