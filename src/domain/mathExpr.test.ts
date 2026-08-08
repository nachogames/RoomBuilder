import { describe, expect, it } from "vitest";
import { evalMathExpr, parseInches } from "./units";
import { parseLength } from "./measure";

describe("evalMathExpr", () => {
  it("evaluates + - * / with precedence", () => {
    expect(evalMathExpr("96-5.125")).toBe(90.875);
    expect(evalMathExpr("2+3*4")).toBe(14);
    expect(evalMathExpr("3/4")).toBe(0.75);
    expect(evalMathExpr("(96-5)/2")).toBe(45.5);
    expect(evalMathExpr("-4+10")).toBe(6);
    expect(evalMathExpr(" 12 * 2 ")).toBe(24);
  });

  it("rejects junk without throwing", () => {
    expect(evalMathExpr("")).toBeNull();
    expect(evalMathExpr("abc")).toBeNull();
    expect(evalMathExpr("1+")).toBeNull();
    expect(evalMathExpr("1//2")).toBeNull();
    expect(evalMathExpr("(1+2")).toBeNull();
    expect(evalMathExpr("1/0")).toBeNull();
  });
});

describe("= math in dimension parsing", () => {
  it("parses =expressions as inches", () => {
    expect(parseInches("=96-5.125")).toBe(90.875);
    expect(parseInches("= (96-5)/2")).toBe(45.5);
    expect(parseInches("=nope")).toBeNull();
  });

  it("keeps plain fraction parsing untouched (23-3/4 is a fraction, not math)", () => {
    expect(parseInches("23-3/4")).toBe(23.75);
    expect(parseInches("5 1/8")).toBe(5.125);
  });

  it("evaluates =expressions in mm mode, converting to inches", () => {
    expect(parseLength("=100+27", "mm")).toBeCloseTo(127 / 25.4, 10);
    expect(parseLength("=bad", "mm")).toBeNull();
  });
});
