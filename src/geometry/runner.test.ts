import { describe, it, expect } from "vitest";
import { buildRunner, runnerLayout } from "./runner";
import {
  defaultBookcase,
  defaultCatalog,
  defaultRunner,
  deskAssembly,
} from "../domain/defaults";
import { maxUnsupportedSpan, checkRunnerSag } from "../domain/sag";
import type { Carcass } from "../domain/types";

function twoBookcases(): Carcass[] {
  const a = { ...defaultBookcase(), id: "A", position: { x: -50, z: 0 } };
  const b = { ...defaultBookcase(), id: "B", position: { x: 50, z: 0 } };
  return [a, b];
}

describe("runnerLayout", () => {
  it("derives length from spanned carcasses + overhang", () => {
    const cs = twoBookcases();
    const r = defaultRunner(["A", "B"]);
    r.overhangEachEnd = 1;
    const L = runnerLayout(r, cs, defaultCatalog());
    // A left = -50-10.375, B right = 50+10.375, +1 overhang each end
    expect(L.worldLeft).toBeCloseTo(-50 - 10.375 - 1, 6);
    expect(L.worldRight).toBeCloseTo(50 + 10.375 + 1, 6);
    expect(L.length).toBeCloseTo(L.worldRight - L.worldLeft, 6);
  });
});

describe("buildRunner", () => {
  it("emits one board part and a fastening joint per spanned carcass", () => {
    const cs = twoBookcases();
    const r = defaultRunner(["A", "B"]);
    const g = buildRunner(r, cs, defaultCatalog());
    expect(g.parts.filter((p) => p.role === "runner")).toHaveLength(1);
    expect(g.joints.filter((j) => j.label.includes("to"))).toHaveLength(2);
    expect(g.parts[0].world).toBe(true);
  });

  it("adds a wood support part for a leg, hardware-only for a bracket", () => {
    const cs = twoBookcases();
    const r = defaultRunner(["A", "B"]);
    r.supports = [
      { id: "s1", kind: "leg", offsetFromLeft: 60 },
      { id: "s2", kind: "bracket", offsetFromLeft: 30 },
    ];
    const g = buildRunner(r, cs, defaultCatalog());
    expect(g.parts.filter((p) => p.role === "support")).toHaveLength(1); // leg only
    expect(g.joints.some((j) => j.method === "bracket")).toBe(true);
  });
});

describe("sag check", () => {
  it("warns on a long unsupported 2x12 span and clears once a support splits it", () => {
    const cs = twoBookcases(); // ~80\" gap between the two carcasses
    const r = defaultRunner(["A", "B"]);
    const cat = defaultCatalog();
    const before = maxUnsupportedSpan(r, cs, cat);
    expect(before).toBeGreaterThan(48);
    expect(checkRunnerSag(r, cs, cat).level).toBe("warn");

    // add a mid support
    const L0 = runnerLayout(r, cs, cat);
    r.supports = [
      { id: "s", kind: "leg", offsetFromLeft: (L0.length) / 2 },
    ];
    expect(maxUnsupportedSpan(r, cs, cat)).toBeLessThan(before);
  });
});

describe("desk preset", () => {
  it("produces two cabinets and a spanning top", () => {
    const { carcasses, runner } = deskAssembly();
    expect(carcasses).toHaveLength(2);
    expect(runner.spannedCarcassIds).toEqual(carcasses.map((c) => c.id));
    const L = runnerLayout(runner, carcasses, defaultCatalog());
    expect(L.length).toBeGreaterThan(0);
  });
});
