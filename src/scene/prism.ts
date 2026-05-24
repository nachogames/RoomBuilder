/** A vertical prism: a 4-point footprint (x/z) extruded from y=0 to y=height.
 *  Pure data so it's testable; the scene wraps it in a BufferGeometry. */
export function prismGeometry(
  footprint: Array<{ x: number; z: number }>,
  height: number,
): { positions: Float32Array; indices: number[] } {
  const p = footprint;
  const positions = new Float32Array(8 * 3);
  for (let i = 0; i < 4; i++) {
    // bottom ring (y=0)
    positions[i * 3] = p[i].x;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = p[i].z;
    // top ring (y=height)
    positions[(i + 4) * 3] = p[i].x;
    positions[(i + 4) * 3 + 1] = height;
    positions[(i + 4) * 3 + 2] = p[i].z;
  }
  const indices: number[] = [
    // bottom + top faces
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
  ];
  // four side quads
  for (let k = 0; k < 4; k++) {
    const a = k;
    const b = (k + 1) % 4;
    indices.push(a, b, b + 4, a, b + 4, a + 4);
  }
  return { positions, indices };
}
