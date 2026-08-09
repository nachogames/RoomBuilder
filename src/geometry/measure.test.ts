import { describe, expect, it } from "vitest";
import { measureBetween, type Seg } from "./measure";

const seg = (ax: number, az: number, bx: number, bz: number): Seg => ({
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
});
const pt = (x: number, z: number): Seg => seg(x, z, x, z);

describe("measureBetween", () => {
  it("point to point", () => {
    const m = measureBetween(pt(0, 0), pt(3, 4));
    expect(m.dist).toBe(5);
    expect(m.axis.x).toBeCloseTo(0.6, 10);
    expect(m.axis.z).toBeCloseTo(0.8, 10);
  });

  it("parallel walls: perpendicular gap, axis from A toward B", () => {
    // two horizontal segments 10 apart
    const m = measureBetween(seg(0, 0, 100, 0), seg(20, 10, 80, 10));
    expect(m.dist).toBe(10);
    expect(m.axis.x).toBeCloseTo(0, 10);
    expect(m.axis.z).toBeCloseTo(1, 10);
  });

  it("point to segment: perpendicular foot, clamped to the segment", () => {
    const m = measureBetween(pt(50, 8), seg(0, 0, 100, 0));
    expect(m.dist).toBe(8);
    expect(m.pb).toEqual({ x: 50, z: 0 });
    // beyond the end: distance to the endpoint
    const m2 = measureBetween(pt(110, 0), seg(0, 0, 100, 0));
    expect(m2.dist).toBe(10);
  });

  it("crossing segments measure zero with a usable fallback axis", () => {
    const m = measureBetween(seg(-5, 0, 5, 0), seg(0, -5, 0, 5));
    expect(m.dist).toBe(0);
    expect(Math.hypot(m.axis.x, m.axis.z)).toBeCloseTo(1, 10);
  });

  it("moving B along the axis by (want - dist) satisfies the measurement", () => {
    const A = seg(0, 0, 100, 0); // wall
    const B = seg(20, 12, 44, 12); // cabinet front, 12 away, want 3
    const m = measureBetween(A, B);
    const d = 3 - m.dist;
    const moved = seg(
      B.a.x + m.axis.x * d,
      B.a.z + m.axis.z * d,
      B.b.x + m.axis.x * d,
      B.b.z + m.axis.z * d,
    );
    expect(measureBetween(A, moved).dist).toBeCloseTo(3, 10);
  });
});
