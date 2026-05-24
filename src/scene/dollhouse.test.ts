import { describe, it, expect } from "vitest";
import { wallFacesCamera, viewIsShallow } from "./dollhouse";

describe("viewIsShallow", () => {
  it("is active when looking level (cull walls)", () => {
    expect(viewIsShallow(0)).toBe(true); // horizontal
    expect(viewIsShallow(-0.3)).toBe(true); // ~17° down
  });
  it("is inactive when looking steeply down (leave walls)", () => {
    expect(viewIsShallow(-1)).toBe(false); // straight down
    expect(viewIsShallow(-0.9)).toBe(false); // steep
  });
});

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
