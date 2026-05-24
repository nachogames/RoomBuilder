import { describe, it, expect } from "vitest";
import {
  addJut,
  baseboardLengthInches,
  pointInRoom,
  rectInsideRoom,
  polygonPerimeterInches,
  roomReferenceSlabs,
  setJutDepthSymmetric,
  setWallLength,
} from "./room";
import { defaultProject, rectWalls } from "./defaults";

describe("rectInsideRoom flush/exact fit", () => {
  const walls = rectWalls(100, 100); // interior -50..50 on both axes

  it("allows a footprint exactly the size of the opening (flush)", () => {
    expect(rectInsideRoom(walls, 0, 0, 100, 100)).toBe(true);
  });

  it("still blocks a footprint larger than the opening", () => {
    expect(rectInsideRoom(walls, 0, 0, 101, 100)).toBe(false);
  });

  it("allows a comfortably smaller footprint", () => {
    expect(rectInsideRoom(walls, 0, 0, 50, 50)).toBe(true);
  });
});

describe("roomReferenceSlabs wall placement", () => {
  it("puts the wall's inner face on the polygon line (wall sits outside)", () => {
    const room = {
      length: 100,
      width: 80,
      ceilingHeight: 96,
      wallThickness: 4.5,
      walls: rectWalls(100, 80), // centroid at origin; top edge at z=-40
      baseboard: null,
    };
    const top = roomReferenceSlabs(room).find((s) => s.id === "w0")!;
    const fp = top.footprint!;
    // inner edge (first two points) is on the polygon line z = -40
    expect(fp[0].z).toBeCloseTo(-40, 6);
    expect(fp[1].z).toBeCloseTo(-40, 6);
    // every footprint point is on or outside the line (z <= -40)
    for (const p of fp) expect(p.z).toBeLessThanOrEqual(-40 + 1e-9);
    // outer edge sits one thickness out
    expect(Math.min(...fp.map((p) => p.z))).toBeCloseTo(-40 - 4.5, 6);
    // extruded full height
    expect(top.height).toBe(96);
  });

  it("renders the baseboard as a mitered band inside the wall, full height", () => {
    const room = {
      length: 100,
      width: 80,
      ceilingHeight: 96,
      wallThickness: 4.5,
      walls: rectWalls(100, 80), // top edge z = -40
      baseboard: { height: 5.5, thickness: 0.5 },
    };
    const bb = roomReferenceSlabs(room).find((s) => s.id === "bb0")!;
    expect(bb.height).toBe(5.5);
    const fp = bb.footprint!;
    // outer face on the polygon line (z = -40), inner face 0.5" into the room
    expect(fp[0].z).toBeCloseTo(-40, 6);
    expect(fp[1].z).toBeCloseTo(-40, 6);
    expect(Math.max(...fp.map((p) => p.z))).toBeCloseTo(-40 + 0.5, 6);
  });

  it("keeps every wall slab OUTSIDE the room, even around a notch", () => {
    // square 100x100 with a notch carved out of the right wall (x80-100, z20-40)
    const room = {
      length: 100,
      width: 100,
      ceilingHeight: 96,
      wallThickness: 4.5,
      walls: [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
        { x: 100, z: 20 },
        { x: 80, z: 20 },
        { x: 80, z: 40 },
        { x: 100, z: 40 },
        { x: 100, z: 100 },
        { x: 0, z: 100 },
      ],
      baseboard: null,
    };
    const walls = roomReferenceSlabs(room).filter((s) => s.kind === "wall");
    for (const w of walls) {
      // a wall slab's centre sits half a thickness OUTSIDE the polygon
      expect(pointInRoom(room.walls, w.center.x, w.center.z)).toBe(false);
    }
  });
});

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

describe("rectInsideRoom (footprint, not just center)", () => {
  const w = rectWalls(100, 80); // x in [-50,50], z in [-40,40]
  it("true when the whole footprint fits", () => {
    expect(rectInsideRoom(w, 0, 0, 20, 10)).toBe(true);
  });
  it("false when an edge crosses the wall even if the center is inside", () => {
    // center x=45 is inside, but half-width 10 -> corner at 55 > 50
    expect(rectInsideRoom(w, 45, 0, 20, 10)).toBe(false);
  });
  it("accounts for rotation", () => {
    // 90 long x 10 deep: fits along X (±45 < 50) but not rotated 90°
    // (±45 > 40 in the Z direction)
    expect(rectInsideRoom(w, 0, 0, 90, 10, 0)).toBe(true);
    expect(rectInsideRoom(w, 0, 0, 90, 10, 90)).toBe(false);
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
