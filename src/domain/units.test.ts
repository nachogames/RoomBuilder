import { describe, it, expect } from "vitest";
import { formatInches, parseInches } from "./units";

describe("formatInches", () => {
  it("renders whole numbers", () => {
    expect(formatInches(24)).toBe('24"');
  });
  it("renders common fractions reduced", () => {
    expect(formatInches(23.75)).toBe('23 3/4"');
    expect(formatInches(0.5)).toBe('1/2"');
    expect(formatInches(11.25)).toBe('11 1/4"');
  });
  it("rounds to nearest 1/16 and carries", () => {
    expect(formatInches(0.96875)).toBe('1"'); // 31/32 -> rounds to 16/16
  });
});

describe("parseInches", () => {
  it("parses decimals, fractions, mixed and dashed", () => {
    expect(parseInches("23.75")).toBe(23.75);
    expect(parseInches("3/4")).toBe(0.75);
    expect(parseInches("23 3/4")).toBe(23.75);
    expect(parseInches('23-3/4"')).toBe(23.75);
  });
  it("returns null on garbage", () => {
    expect(parseInches("abc")).toBeNull();
    expect(parseInches("")).toBeNull();
  });
});
