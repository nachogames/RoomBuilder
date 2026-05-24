import { describe, it, expect } from "vitest";
import { resolveMove } from "./dragMath";

const p0 = { x: 10, z: 20 };

describe("resolveMove", () => {
  it("takes the full move when it fits", () => {
    expect(resolveMove(() => true, 5, 6, p0, false)).toEqual({ x: 5, z: 6 });
  });

  it("slides along X when only the X-axis move fits", () => {
    const fits = (_x: number, z: number) => z === p0.z; // only when z unchanged
    expect(resolveMove(fits, 5, 6, p0, false)).toEqual({ x: 5, z: 20 });
  });

  it("slides along Z when only the Z-axis move fits", () => {
    const fits = (x: number) => x === p0.x; // only when x unchanged
    expect(resolveMove(fits, 5, 6, p0, false)).toEqual({ x: 10, z: 6 });
  });

  it("freezes (returns the same p0) when nothing fits and free is off", () => {
    expect(resolveMove(() => false, 5, 6, p0, false)).toBe(p0);
  });

  it("NEVER freezes when free is on — moves to the target even if nothing fits", () => {
    const out = resolveMove(() => false, 5, 6, p0, true);
    expect(out).toEqual({ x: 5, z: 6 });
    expect(out).not.toBe(p0);
  });
});
