import { describe, it, expect } from "vitest";
import { personFootprint, personTopY, PERSON_SEAT_HEIGHT } from "./person";
import type { Person } from "./types";

function p(over: Partial<Person> = {}): Person {
  return {
    id: "P",
    label: "Person",
    position: { x: 0, z: 0 },
    rotationDeg: 0,
    baseHeight: 0,
    pose: "standing",
    height: 70,
    ...over,
  };
}

describe("personFootprint (top-down width × depth in the person's own frame)", () => {
  it("standing: ~shoulder-by-body, feet planted", () => {
    expect(personFootprint(p({ pose: "standing" }))).toEqual({
      width: 18,
      depth: 10,
    });
  });

  it("sitting: legs extend forward → deeper footprint", () => {
    expect(personFootprint(p({ pose: "sitting" }))).toEqual({
      width: 18,
      depth: 28,
    });
  });
});

describe("personTopY (top of head above the person's baseHeight)", () => {
  it("standing: equals the height", () => {
    expect(personTopY(p({ pose: "standing", height: 70 }))).toBe(70);
    expect(personTopY(p({ pose: "standing", height: 60 }))).toBe(60);
  });

  it("sitting: seat (17) + half the standing height (≈ 52 for a 70\" person)", () => {
    expect(personTopY(p({ pose: "sitting", height: 70 }))).toBeCloseTo(52, 6);
    expect(personTopY(p({ pose: "sitting", height: 64 }))).toBeCloseTo(49, 6);
  });
});

describe("PERSON_SEAT_HEIGHT", () => {
  it("matches a standard chair (17\")", () => {
    expect(PERSON_SEAT_HEIGHT).toBe(17);
  });
});
