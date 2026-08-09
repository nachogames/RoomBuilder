import { describe, expect, it } from "vitest";
import { defaultBookcase, defaultCatalog } from "../domain/defaults";
import { buildCarcass } from "./carcass";
import { materialThickness } from "./types";

const catalog = defaultCatalog();
const t = materialThickness(catalog.materials, defaultBookcase().carcassMaterialId);

describe("capped carcass construction (top/bottom overlap the sides)", () => {
  const c = { ...defaultBookcase(), construction: "capped" as const };
  const { width: W, height: H, toeKickHeight: toe } = c;
  const g = buildCarcass(c, catalog);
  const part = (role: string, label?: string) =>
    g.parts.find((p) => p.role === role && (!label || p.label === label))!;

  it("top and bottom run the full outside width", () => {
    expect(part("top").box.x).toBe(W);
    expect(part("bottom").box.x).toBe(W);
  });

  it("sides fit between the bottom and the top", () => {
    const side = part("side", "Left side");
    const sideH = H - toe - 2 * t;
    expect(side.box.y).toBe(sideH);
    expect(side.center.y).toBeCloseTo(toe + t + sideH / 2, 10);
    // cut-list dims: major folds into `length` (the larger of major/minor)
    expect(side.length).toBe(sideH);
  });

  it("top/bottom joints drill into the side ends, not the panels", () => {
    const sideIds = g.parts.filter((p) => p.role === "side").map((p) => p.id);
    const tb = g.joints.filter((j) => /^(Top|Bottom) to/.test(j.label));
    expect(tb).toHaveLength(4);
    for (const j of tb) {
      expect(sideIds).toContain(j.drilledPartId);
      expect(["top-edge", "bottom-edge"]).toContain(j.drilledEdge);
    }
  });

  it("toe kick rail spans the full width and joins the bottom", () => {
    expect(toe).toBeGreaterThan(0);
    expect(part("toe-kick").box.x).toBe(W);
    const j = g.joints.find((x) => x.label === "Toe kick to bottom")!;
    expect(j).toBeTruthy();
  });
});

describe("default construction stays side-caught", () => {
  const c = defaultBookcase();
  const g = buildCarcass(c, catalog);
  it("sides run full height, top fits between them", () => {
    const side = g.parts.find((p) => p.label === "Left side")!;
    expect(side.box.y).toBe(c.height);
    const top = g.parts.find((p) => p.role === "top")!;
    expect(top.box.x).toBe(c.width - 2 * t);
  });
});
