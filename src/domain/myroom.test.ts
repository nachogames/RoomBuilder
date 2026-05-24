import { describe, it, expect } from "vitest";
import { myRoom, normalizeProject } from "./defaults";
import { objectTop } from "../geometry/stacking";

describe("myRoom preset", () => {
  it("has the 8-corner room polygon with the notch", () => {
    const p = myRoom();
    expect(p.room.walls).toHaveLength(8);
    expect(p.room.walls).toContainEqual({ x: 114.5, z: 20.75 });
    expect(p.room.walls).toContainEqual({ x: 114.5, z: 33.75 });
    expect(p.room.walls).toContainEqual({ x: 126, z: 33.75 });
  });

  it("has two desk cabinets 27.25\" tall on the floor", () => {
    const p = myRoom();
    expect(p.carcasses).toHaveLength(2);
    for (const c of p.carcasses) {
      expect(c.height).toBeCloseTo(27.25, 6);
      expect(c.width).toBeCloseTo(14.125, 6);
      expect(c.depth).toBeCloseTo(24, 6);
      expect(c.baseHeight ?? 0).toBe(0);
    }
  });

  it("has a desktop whose top surface is at 28.75\"", () => {
    const p = myRoom();
    expect(p.runners).toHaveLength(1);
    const top = p.runners[0];
    expect(top.length).toBeCloseTo(98.25, 6);
    expect(top.depth).toBeCloseTo(26.25, 6);
    expect(top.baseHeight).toBeCloseTo(27.25, 6);
    expect(top.spannedCarcassIds).toEqual(p.carcasses.map((c) => c.id));
    // 27.25 underside + 1.5 ply = 28.75 top surface
    expect(objectTop(top, p)).toBeCloseTo(28.75, 6);
  });

  it("cabinets sit under the desktop, inset 1.75\" from its front", () => {
    const p = myRoom();
    const top = p.runners[0];
    const deskFront = top.position.z + top.depth / 2;
    for (const c of p.carcasses) {
      const cabFront = c.position.z + c.depth / 2;
      expect(deskFront - cabFront).toBeCloseTo(1.75, 6);
    }
  });

  it("has one tapered tote (top bigger than bottom)", () => {
    const p = myRoom();
    expect(p.refBoxes).toHaveLength(1);
    const t = p.refBoxes[0];
    expect(t.width).toBeCloseTo(13, 6);
    expect(t.depth).toBeCloseTo(19, 6);
    expect(t.height).toBeCloseTo(16.5, 6);
    expect(t.topWidth).toBeCloseTo(16.25, 6);
    expect(t.topDepth).toBeCloseTo(22.25, 6);
  });

  it("survives normalizeProject unchanged in shape", () => {
    const n = normalizeProject(myRoom());
    expect(n.carcasses).toHaveLength(2);
    expect(n.runners).toHaveLength(1);
    expect(n.refBoxes[0].topWidth).toBeCloseTo(16.25, 6);
  });
});
