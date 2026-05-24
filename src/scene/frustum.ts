/** Vertex/index data for a rectangular frustum (tapered box) centred at the
 *  origin: bottom rect (bw×bd) at y=-h/2, top rect (tw×td) at y=+h/2.
 *  Pure data so it's testable; the scene wraps it in a BufferGeometry. */
export function frustumGeometry(
  bw: number,
  bd: number,
  tw: number,
  td: number,
  h: number,
): { positions: Float32Array; indices: number[] } {
  const hw = bw / 2;
  const hd = bd / 2;
  const tw2 = tw / 2;
  const td2 = td / 2;
  const y0 = -h / 2;
  const y1 = h / 2;

  // 0-3 bottom (CCW from back-left), 4-7 top
  const positions = new Float32Array([
    -hw, y0, -hd, // 0 b0
    hw, y0, -hd, // 1 b1
    hw, y0, hd, // 2 b2
    -hw, y0, hd, // 3 b3
    -tw2, y1, -td2, // 4 t0
    tw2, y1, -td2, // 5 t1
    tw2, y1, td2, // 6 t2
    -tw2, y1, td2, // 7 t3
  ]);

  const indices = [
    // bottom (normal -y)
    0, 2, 1, 0, 3, 2,
    // top (normal +y)
    4, 5, 6, 4, 6, 7,
    // -z side
    0, 1, 5, 0, 5, 4,
    // +x side
    1, 2, 6, 1, 6, 5,
    // +z side
    2, 3, 7, 2, 7, 6,
    // -x side
    3, 0, 4, 3, 4, 7,
  ];

  return { positions, indices };
}
