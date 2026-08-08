import { describe, expect, it } from "vitest";
import { collisionWalls, rectInsideRoom } from "./room";
import type { Room } from "./types";

const rect = (l: number, w: number): Room => ({
  length: l,
  width: w,
  ceilingHeight: 96,
  wallThickness: 4.5,
  walls: [
    { x: 0, z: 0 },
    { x: l, z: 0 },
    { x: l, z: w },
    { x: 0, z: w },
  ],
  baseboard: { height: 3.5, thickness: 0.75 },
});

describe("collisionWalls", () => {
  it("returns the raw walls when the room has no baseboard", () => {
    const room = { ...rect(120, 96), baseboard: null };
    expect(collisionWalls(room, 0)).toBe(room.walls);
  });

  it("returns the raw walls when the item bottom clears the baseboard", () => {
    const room = rect(120, 96);
    expect(collisionWalls(room, 3.5)).toBe(room.walls); // exactly at the top
    expect(collisionWalls(room, 30)).toBe(room.walls); // floating desk top
  });

  it("insets the polygon by the baseboard thickness for floor-level items", () => {
    const room = rect(120, 96);
    const inset = collisionWalls(room, 0);
    // rectangle inset by 0.75 on every side
    expect(inset).toEqual([
      { x: 0.75, z: 0.75 },
      { x: 119.25, z: 0.75 },
      { x: 119.25, z: 95.25 },
      { x: 0.75, z: 95.25 },
    ]);
  });

  it("blocks a floor-level box pushed into the baseboard band", () => {
    const room = rect(120, 96);
    const w = 24;
    const d = 16;
    // flush against the raw wall: center d/2 from z=0 — fits without a
    // baseboard, but the baseboard band must reject it
    expect(rectInsideRoom(room.walls, 60, d / 2, w, d)).toBe(true);
    expect(rectInsideRoom(collisionWalls(room, 0), 60, d / 2, w, d)).toBe(false);
    // backed off by the baseboard thickness it fits again
    expect(
      rectInsideRoom(collisionWalls(room, 0), 60, d / 2 + 0.75, w, d),
    ).toBe(true);
  });

  it("lets an elevated item reach the raw wall", () => {
    const room = rect(120, 96);
    const w = 24;
    const d = 16;
    expect(rectInsideRoom(collisionWalls(room, 30), 60, d / 2, w, d)).toBe(true);
  });
});
