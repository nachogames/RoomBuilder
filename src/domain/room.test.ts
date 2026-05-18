import { describe, it, expect } from "vitest";
import {
  baseboardLengthInches,
  polygonPerimeterInches,
  roomReferenceSlabs,
  setWallLength,
} from "./room";
import { defaultProject, rectWalls } from "./defaults";

describe("polygon perimeter / baseboard length", () => {
  it("equals the rectangle perimeter for the default room", () => {
    const r = defaultProject().room; // 128 x 120
    expect(polygonPerimeterInches(r.walls)).toBe(2 * (128 + 120));
    expect(baseboardLengthInches(r)).toBe(2 * (128 + 120));
  });
  it("grows when a corner is pulled out (an L-shaped jog)", () => {
    const walls = rectWalls(100, 100);
    const before = polygonPerimeterInches(walls);
    const jogged = [
      ...walls.slice(0, 2),
      { x: 70, z: 0 },
      ...walls.slice(2),
    ];
    expect(polygonPerimeterInches(jogged)).toBeGreaterThan(before);
  });
});

describe("setWallLength", () => {
  it("resizes one edge along its own direction, keeping the start corner", () => {
    const walls = rectWalls(100, 80); // edge 0: (-50,-40)->(50,-40), len 100
    const next = setWallLength(walls, 0, 60);
    expect(next[0]).toEqual(walls[0]); // start fixed
    expect(next[1].x).toBeCloseTo(-50 + 60, 6);
    expect(next[1].z).toBeCloseTo(-40, 6);
  });
});

describe("roomReferenceSlabs", () => {
  it("emits one wall + one baseboard slab per edge by default", () => {
    const r = defaultProject().room;
    const s = roomReferenceSlabs(r);
    expect(s.filter((x) => x.kind === "wall")).toHaveLength(4);
    expect(s.filter((x) => x.kind === "baseboard")).toHaveLength(4);
  });
  it("omits baseboard slabs when baseboard is null", () => {
    const r = defaultProject().room;
    r.baseboard = null;
    expect(
      roomReferenceSlabs(r).filter((x) => x.kind === "baseboard"),
    ).toHaveLength(0);
  });
});
