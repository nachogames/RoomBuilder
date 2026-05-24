import { describe, it, expect } from "vitest";
import { outerWallVertices } from "./room";

describe("outerWallVertices (mitered outward offset)", () => {
  it("offsets a rectangle's corners diagonally outward by t", () => {
    // clockwise rect, interior inside; top-left corner at (0,0)
    const walls = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 80 },
      { x: 0, z: 80 },
    ];
    const q = outerWallVertices(walls, 4);
    expect(q[0].x).toBeCloseTo(-4, 6);
    expect(q[0].z).toBeCloseTo(-4, 6);
    expect(q[1].x).toBeCloseTo(104, 6);
    expect(q[1].z).toBeCloseTo(-4, 6);
    expect(q[2].x).toBeCloseTo(104, 6);
    expect(q[2].z).toBeCloseTo(84, 6);
  });

  it("returns one outer vertex per input vertex", () => {
    const walls = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 20 },
      { x: 80, z: 20 },
      { x: 80, z: 40 },
      { x: 100, z: 40 },
      { x: 100, z: 100 },
      { x: 0, z: 100 },
    ];
    expect(outerWallVertices(walls, 4.5)).toHaveLength(walls.length);
  });
});
