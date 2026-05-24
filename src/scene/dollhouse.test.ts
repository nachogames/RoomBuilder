import { describe, it, expect } from "vitest";
import { wallFacesCamera } from "./dollhouse";

describe("wallFacesCamera", () => {
  // a wall whose exterior (outward normal) points +z, centred at z=0
  const normal = { x: 0, z: 1 };
  const center = { x: 0, z: 0 };

  it("hides the wall when the camera is on its exterior side", () => {
    expect(wallFacesCamera(normal, center, { x: 0, z: 50 })).toBe(true);
  });

  it("keeps the wall when the camera is on the interior side", () => {
    expect(wallFacesCamera(normal, center, { x: 0, z: -50 })).toBe(false);
  });

  it("keeps the wall when the camera is parallel (edge-on)", () => {
    expect(wallFacesCamera(normal, center, { x: 50, z: 0 })).toBe(false);
  });
});
