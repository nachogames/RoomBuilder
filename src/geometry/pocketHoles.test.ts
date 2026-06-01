import { describe, expect, it } from "vitest";
import { pocketHoleMarks } from "./pocketHoles";
import { defaultCatalog } from "../domain/defaults";

describe("pocketHoleMarks", () => {
  it("returns no marks for empty input", () => {
    expect(pocketHoleMarks([], [], defaultCatalog())).toEqual([]);
  });
});
