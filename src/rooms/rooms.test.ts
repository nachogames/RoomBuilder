import { describe, it, expect } from "vitest";
import { STARTER_ROOM_NAME, starterFirst, starterProject } from "./index";

describe("starterProject", () => {
  it("loads the bundled room as a normalized schema-1 project", () => {
    const p = starterProject();
    expect(p.schemaVersion).toBe(1);
    expect(p.name).toBe(STARTER_ROOM_NAME);
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

describe("starterFirst", () => {
  it("pins the starter room to the top and sorts the rest", () => {
    expect(starterFirst(["Zed", "My Room", STARTER_ROOM_NAME, "Attic"])).toEqual([
      STARTER_ROOM_NAME,
      "Attic",
      "My Room",
      "Zed",
    ]);
  });

  it("leaves the list sorted when the starter is not saved", () => {
    expect(starterFirst(["Zed", "Attic"])).toEqual(["Attic", "Zed"]);
  });
});
