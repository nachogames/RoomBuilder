import { describe, it, expect } from "vitest";
import { prismGeometry } from "./prism";

describe("prismGeometry", () => {
  const quad = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 2 },
    { x: 0, z: 2 },
  ];

  it("produces 8 vertices and 12 triangles", () => {
    const g = prismGeometry(quad, 96);
    expect(g.positions).toHaveLength(8 * 3);
    expect(g.indices).toHaveLength(12 * 3);
  });

  it("extrudes from y=0 to y=height", () => {
    const g = prismGeometry(quad, 96);
    const ys = Array.from({ length: 8 }, (_, i) => g.positions[i * 3 + 1]);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(96);
  });

  it("keeps the footprint x/z on the bottom ring", () => {
    const g = prismGeometry(quad, 96);
    // first 4 vertices are the bottom ring
    expect(g.positions[0]).toBe(0);
    expect(g.positions[2]).toBe(0);
    expect(g.positions[3]).toBe(10);
  });
});
