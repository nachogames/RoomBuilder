import { describe, it, expect } from "vitest";
import { baseboardLengthInches, roomReferenceSlabs } from "./room";
import { defaultProject, defaultBumpOut } from "./defaults";

describe("baseboardLengthInches", () => {
  it("is the room perimeter with no bump-outs", () => {
    const r = defaultProject().room; // 128 x 120
    expect(baseboardLengthInches(r)).toBe(2 * (128 + 120));
  });
  it("adds two returns per bump-out", () => {
    const r = defaultProject().room;
    r.bumpOuts = [{ ...defaultBumpOut("N"), depth: 12 }];
    expect(baseboardLengthInches(r)).toBe(2 * (128 + 120) + 24);
  });
});

describe("roomReferenceSlabs", () => {
  it("emits 4 walls + 4 baseboard bands by default, plus a slab per bump-out", () => {
    const r = defaultProject().room;
    let s = roomReferenceSlabs(r);
    expect(s.filter((x) => x.kind === "wall")).toHaveLength(4);
    expect(s.filter((x) => x.kind === "baseboard")).toHaveLength(4);

    r.bumpOuts = [defaultBumpOut("S")];
    s = roomReferenceSlabs(r);
    expect(s.filter((x) => x.kind === "bump")).toHaveLength(1);
  });
  it("omits baseboard slabs when baseboard is null", () => {
    const r = defaultProject().room;
    r.baseboard = null;
    expect(
      roomReferenceSlabs(r).filter((x) => x.kind === "baseboard"),
    ).toHaveLength(0);
  });
});
