import { describe, expect, it } from "vitest";
import { defaultProject, defaultRefBox, uid } from "../domain/defaults";
import { baseboardBandRects } from "../domain/room";
import { baseboardFloorY, snapHeight } from "./stacking";
import { rectAABB } from "./group";

// defaultProject: 128x120 rect room, baseboard 5.125" tall x 0.5" thick.
function projWithTote(x: number, z: number, baseHeight: number) {
  const p = defaultProject();
  p.carcasses = []; // just the tote and the room
  const tote = {
    ...defaultRefBox(),
    id: uid("box"),
    position: { x, z },
    baseHeight,
  };
  p.refBoxes = [tote];
  return { p, tote };
}

describe("baseboardBandRects", () => {
  it("is empty without a baseboard", () => {
    const p = defaultProject();
    p.room.baseboard = null;
    expect(baseboardBandRects(p.room)).toEqual([]);
  });

  it("returns a thin strip along each wall of a rectangular room", () => {
    // room is origin-centred: x -64..64, z -60..60
    const p = defaultProject();
    const rects = baseboardBandRects(p.room);
    expect(rects).toHaveLength(4);
    // one of them is the north wall strip: z from -60 to -59.5, full length
    const north = rects.find((r) => r.minZ === -60 && r.maxZ === -59.5);
    expect(north).toBeTruthy();
    expect(north!.minX).toBe(-64);
    expect(north!.maxX).toBe(64);
  });
});

describe("baseboard top as a resting surface", () => {
  it("snapHeight lands an elevated item on the baseboard top", () => {
    // tote hugging the north wall (z=-60), hovering above the band
    const { p, tote } = projWithTote(0, -55, 20);
    expect(snapHeight(tote, p)).toBe(5.125);
  });

  it("snapHeight still returns the floor away from the walls", () => {
    const { p, tote } = projWithTote(0, 0, 20);
    expect(snapHeight(tote, p)).toBe(0);
  });

  it("does not lift an item already below the band top", () => {
    const { p, tote } = projWithTote(0, -55, 0);
    expect(snapHeight(tote, p)).toBe(0);
  });

  it("baseboardFloorY blocks descending into the band", () => {
    const { p, tote } = projWithTote(0, -55, 20);
    const foot = rectAABB(
      tote.position.x,
      tote.position.z,
      tote.width,
      tote.depth,
      tote.rotationDeg,
    );
    expect(baseboardFloorY(p, foot)).toBe(5.125);
    const midRoom = rectAABB(0, 0, tote.width, tote.depth, 0);
    expect(baseboardFloorY(p, midRoom)).toBe(0);
  });
});
