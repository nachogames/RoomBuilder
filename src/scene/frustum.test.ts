import { describe, it, expect } from "vitest";
import { frustumGeometry } from "./frustum";

describe("frustumGeometry", () => {
  it("produces 8 vertices and 12 triangles", () => {
    const g = frustumGeometry(10, 6, 14, 8, 4);
    expect(g.positions).toHaveLength(8 * 3);
    expect(g.indices).toHaveLength(12 * 3);
  });

  it("places the bottom rect at -h/2 and the top rect at +h/2", () => {
    const g = frustumGeometry(10, 6, 14, 8, 4);
    const ys = Array.from({ length: 8 }, (_, i) => g.positions[i * 3 + 1]);
    expect(Math.min(...ys)).toBeCloseTo(-2, 6); // -h/2
    expect(Math.max(...ys)).toBeCloseTo(2, 6); // +h/2
  });

  it("uses bottom W/D for the lower corners and top W/D for the upper", () => {
    const g = frustumGeometry(10, 6, 14, 8, 4);
    // lower corners: |x| = 5 (10/2), |z| = 3 (6/2)
    // upper corners: |x| = 7 (14/2), |z| = 4 (8/2)
    const xs = Array.from({ length: 8 }, (_, i) => Math.abs(g.positions[i * 3]));
    expect(Math.max(...xs)).toBeCloseTo(7, 6); // top half-width
    expect(Math.min(...xs)).toBeCloseTo(5, 6); // bottom half-width
  });
});
