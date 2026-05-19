import { describe, it, expect } from "vitest";
import {
  addJut,
  baseboardLengthInches,
  pointInRoom,
  polygonPerimeterInches,
  roomReferenceSlabs,
  setJutDepthSymmetric,
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

describe("addJut (precise 90° rectangular jut)", () => {
  const walls = rectWalls(100, 80); // edge 0: (-50,-40)->(50,-40), len 100

  it("inserts 4 corners forming a square jut at exact offsets", () => {
    const w = addJut(walls, 0, 20.75, 27.5, 6, "out");
    expect(w).toHaveLength(8);
    const [P1, Q1, Q2, P2] = w.slice(1, 5);
    // breakpoints land exactly at the typed offsets from corner A(-50)
    expect(P1.x).toBeCloseTo(-50 + 20.75, 6);
    expect(P2.x).toBeCloseTo(-50 + 27.5, 6);
    // returns are perpendicular to the wall (dot with wall dir == 0)
    const dot1 = (Q1.x - P1.x) * 1 + (Q1.z - P1.z) * 0;
    const dot2 = (Q2.x - P2.x) * 1 + (Q2.z - P2.z) * 0;
    expect(dot1).toBeCloseTo(0, 6);
    expect(dot2).toBeCloseTo(0, 6);
    // jut face width == offB-offA, depth == 6, and it juts away (z<-40)
    expect(Math.hypot(Q2.x - Q1.x, Q2.z - Q1.z)).toBeCloseTo(6.75, 6);
    expect(Math.abs(Q1.z - P1.z)).toBeCloseTo(6, 6);
    expect(Q1.z).toBeLessThan(-40);
  });

  it("dir 'in' carves the recess toward the room", () => {
    const w = addJut(walls, 0, 10, 30, 8, "in");
    const Q1 = w[2];
    expect(Q1.z).toBeGreaterThan(-40); // recess goes inward
  });

  it("is a no-op for zero/!valid depth or empty span", () => {
    expect(addJut(walls, 0, 20, 20, 6, "out")).toHaveLength(4);
    expect(addJut(walls, 0, 10, 30, 0, "out")).toHaveLength(4);
  });
});

describe("setJutDepthSymmetric", () => {
  const base = addJut(rectWalls(100, 80), 0, 20, 40, 6, "out");
  // edges: E1 and E3 are the two perpendicular returns

  it("sets both returns to the same length, face stays parallel", () => {
    const w = setJutDepthSymmetric(base, 1, 10)!;
    expect(w).not.toBeNull();
    const elen = (k: number) =>
      Math.hypot(
        w[(k + 1) % w.length].x - w[k].x,
        w[(k + 1) % w.length].z - w[k].z,
      );
    expect(elen(1)).toBeCloseTo(10, 6);
    expect(elen(3)).toBeCloseTo(10, 6);
    // face Q1->Q2 still axis-aligned (equal z)
    expect(w[2].z).toBeCloseTo(w[3].z, 6);
  });

  it("editing the OTHER return is also symmetric", () => {
    const w = setJutDepthSymmetric(base, 3, 9)!;
    const elen = (k: number) =>
      Math.hypot(
        w[(k + 1) % w.length].x - w[k].x,
        w[(k + 1) % w.length].z - w[k].z,
      );
    expect(elen(1)).toBeCloseTo(9, 6);
    expect(elen(3)).toBeCloseTo(9, 6);
  });

  it("returns null for a normal (non-return) wall", () => {
    expect(setJutDepthSymmetric(rectWalls(100, 80), 0, 30)).toBeNull();
  });
});

describe("pointInRoom", () => {
  const w = rectWalls(100, 80);
  it("is true inside, false outside", () => {
    expect(pointInRoom(w, 0, 0)).toBe(true);
    expect(pointInRoom(w, 200, 0)).toBe(false);
    expect(pointInRoom(w, 0, 100)).toBe(false);
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
