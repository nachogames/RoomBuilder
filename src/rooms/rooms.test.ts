import { describe, it, expect } from "vitest";
import { starterProject } from "./index";

describe("starterProject", () => {
  it("loads the bundled room as a normalized schema-1 project", () => {
    const p = starterProject();
    expect(p.schemaVersion).toBe(1);
    expect(p.carcasses.length).toBeGreaterThan(0);
    expect(p.room.width).toBeGreaterThan(0);
  });

  it("returns a fresh copy each call", () => {
    const a = starterProject();
    const b = starterProject();
    expect(a).not.toBe(b);
    expect(a.carcasses).not.toBe(b.carcasses);
  });
});
