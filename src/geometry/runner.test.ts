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

describe("runnerLayout (explicit position/length)", () => {
  it("derives world extents from the runner's own position + length", () => {
    const r = defaultRunner(["A", "B"]);
    r.length = 100;
    r.position = { x: 10, z: 5 };
    const L = runnerLayout(r, twoBookcases(), defaultCatalog());
    expect(L.worldLeft).toBeCloseTo(10 - 50, 6);
    expect(L.worldRight).toBeCloseTo(10 + 50, 6);
    expect(L.length).toBeCloseTo(100, 6);
    expect(L.z).toBeCloseTo(5, 6);
  });

  it("does NOT change when an owned cabinet moves (size is explicit)", () => {
    const r = defaultRunner(["A", "B"]);
    r.length = 100;
    r.position = { x: 0, z: 0 };
    const cs = twoBookcases();
    const before = runnerLayout(r, cs, defaultCatalog());
    cs[0].position = { x: -999, z: 40 }; // yank a cabinet far away
    const after = runnerLayout(r, cs, defaultCatalog());
    expect(after.worldLeft).toBeCloseTo(before.worldLeft, 6);
    expect(after.worldRight).toBeCloseTo(before.worldRight, 6);
    expect(after.length).toBeCloseTo(before.length, 6);
  });

  it("still reports bearing intervals from the owned cabinets (for sag)", () => {
    const r = defaultRunner(["A", "B"]);
    r.length = 120;
    r.position = { x: 0, z: 0 };
    const L = runnerLayout(r, twoBookcases(), defaultCatalog());
    expect(L.bearingIntervals).toHaveLength(2);
  });
});

describe("buildRunner", () => {
  it("emits one board part (local, group-rotated) and a fastening per owned carcass", () => {
    const cs = twoBookcases();
    const r = defaultRunner(["A", "B"]);
    const g = buildRunner(r, cs, defaultCatalog());
    const board = g.parts.filter((p) => p.role === "runner");
    expect(board).toHaveLength(1);
    expect(g.joints.filter((j) => j.label.includes("to"))).toHaveLength(2);
    // parts are runner-local now (Scene wraps them in a positioned group)
    expect(board[0].world).toBeFalsy();
    expect(board[0].box.x).toBeCloseTo(r.length, 6);
    expect(board[0].box.z).toBeCloseTo(r.depth, 6);
  });

  it("places the board underside at local y=0 (group carries baseHeight)", () => {
    const r = defaultRunner(["A", "B"]);
    const g = buildRunner(r, twoBookcases(), defaultCatalog());
    const board = g.parts.find((p) => p.role === "runner")!;
    expect(board.center.y).toBeCloseTo(board.thickness / 2, 6);
  });

  it("adds a wood support part for a leg, hardware-only for a bracket", () => {
    const cs = twoBookcases();
    const r = defaultRunner(["A", "B"]);
    r.supports = [
      { id: "s1", kind: "leg", offsetFromLeft: 60 },
      { id: "s2", kind: "bracket", offsetFromLeft: 30 },
    ];
    const g = buildRunner(r, cs, defaultCatalog());
    expect(g.parts.filter((p) => p.role === "support")).toHaveLength(1);
    expect(g.joints.some((j) => j.method === "bracket")).toBe(true);
  });
});

describe("sag check", () => {
  it("warns on a long unsupported span and clears once a support splits it", () => {
    const cs = twoBookcases();
    const r = defaultRunner(["A", "B"]);
    r.length = 120;
    r.position = { x: 0, z: 0 };
    const cat = defaultCatalog();
    const before = maxUnsupportedSpan(r, cs, cat);
    expect(before).toBeGreaterThan(48);
    expect(checkRunnerSag(r, cs, cat).level).toBe("warn");
    const L0 = runnerLayout(r, cs, cat);
    r.supports = [{ id: "s", kind: "leg", offsetFromLeft: L0.length / 2 }];
    expect(maxUnsupportedSpan(r, cs, cat)).toBeLessThan(before);
  });
});

describe("desk preset", () => {
  it("produces two cabinets and an explicitly-sized spanning top", () => {
    const { carcasses, runner } = deskAssembly();
    expect(carcasses).toHaveLength(2);
    expect(runner.spannedCarcassIds).toEqual(carcasses.map((c) => c.id));
    expect(runner.length).toBeGreaterThan(0);
    const L = runnerLayout(runner, carcasses, defaultCatalog());
    expect(L.length).toBeCloseTo(runner.length, 6);
  });
});
