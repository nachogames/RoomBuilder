import type { Carcass, StockCatalog } from "../domain/types";
import type { CarcassGeometry, Joint, Part } from "./types";
import { materialThickness } from "./types";

function mkPart(
  p: Omit<Part, "length" | "width"> & { major: number; minor: number },
): Part {
  const { major, minor, ...rest } = p;
  return { ...rest, length: Math.max(major, minor), width: Math.min(major, minor) };
}

/**
 * Generate every physical part and every joint for one carcass.
 * Carcass-local coords: origin at footprint center on the floor, y is up.
 */
export function buildCarcass(
  c: Carcass,
  catalog: StockCatalog,
): CarcassGeometry {
  const M = catalog.materials;
  const t = materialThickness(M, c.carcassMaterialId);
  const tb = materialThickness(M, c.backMaterialId);
  const ts = materialThickness(M, c.shelfMaterialId);
  const { width: W, height: H, depth: D } = c;
  const toe = c.toeKickHeight;
  const backT = c.hasBack ? tb : 0;
  const innerW = W - 2 * t;
  const shelfDepth = D - backT;

  const parts: Part[] = [];
  const joints: Joint[] = [];
  let n = 0;
  const pid = () => `${c.id}-p${++n}`;
  let j = 0;
  const jid = () => `${c.id}-j${++j}`;

  // --- Sides ---
  const sideIds: string[] = [];
  for (const sign of [-1, 1]) {
    const id = pid();
    sideIds.push(id);
    parts.push(
      mkPart({
        id,
        carcassId: c.id,
        role: "side",
        label: sign < 0 ? "Left side" : "Right side",
        materialId: c.carcassMaterialId,
        thickness: t,
        grainMatters: true,
        box: { x: t, y: H, z: D },
        center: { x: sign * (W / 2 - t / 2), y: H / 2, z: 0 },
        major: H,
        minor: D,
      }),
    );
  }

  // --- Top & Bottom ---
  const topId = pid();
  parts.push(
    mkPart({
      id: topId,
      carcassId: c.id,
      role: "top",
      label: "Top",
      materialId: c.carcassMaterialId,
      thickness: t,
      grainMatters: true,
      box: { x: innerW, y: t, z: D },
      center: { x: 0, y: H - t / 2, z: 0 },
      major: innerW,
      minor: D,
    }),
  );
  const bottomId = pid();
  parts.push(
    mkPart({
      id: bottomId,
      carcassId: c.id,
      role: "bottom",
      label: "Bottom",
      materialId: c.carcassMaterialId,
      thickness: t,
      grainMatters: true,
      box: { x: innerW, y: t, z: D },
      center: { x: 0, y: toe + t / 2, z: 0 },
      major: innerW,
      minor: D,
    }),
  );

  for (const [sideId, side] of sideIds.entries()) {
    const sideLabel = sideId === 0 ? "left" : "right";
    joints.push({
      id: jid(),
      carcassId: c.id,
      method: c.carcassJoinery,
      label: `Top to ${sideLabel} side`,
      members: [
        { partId: topId, role: "top" },
        { partId: side, role: "side" },
      ],
      drilledPartId: topId,
      edgeLength: D,
    });
    joints.push({
      id: jid(),
      carcassId: c.id,
      method: c.carcassJoinery,
      label: `Bottom to ${sideLabel} side`,
      members: [
        { partId: bottomId, role: "bottom" },
        { partId: side, role: "side" },
      ],
      drilledPartId: bottomId,
      edgeLength: D,
    });
  }

  // --- Toe kick ---
  if (toe > 0) {
    const kickId = pid();
    parts.push(
      mkPart({
        id: kickId,
        carcassId: c.id,
        role: "toe-kick",
        label: "Toe kick rail",
        materialId: c.carcassMaterialId,
        thickness: t,
        grainMatters: true,
        box: { x: innerW, y: toe, z: t },
        center: { x: 0, y: toe / 2, z: D / 2 - t / 2 },
        major: innerW,
        minor: toe,
      }),
    );
    for (const side of sideIds) {
      joints.push({
        id: jid(),
        carcassId: c.id,
        method: c.carcassJoinery,
        label: "Toe kick to side",
        members: [
          { partId: kickId, role: "toe-kick" },
          { partId: side, role: "side" },
        ],
        drilledPartId: kickId,
        edgeLength: toe,
      });
    }
  }

  // --- Back ---
  if (c.hasBack) {
    const backH = H - toe;
    const backId = pid();
    parts.push(
      mkPart({
        id: backId,
        carcassId: c.id,
        role: "back",
        label: "Back panel",
        materialId: c.backMaterialId,
        thickness: tb,
        grainMatters: false,
        box: { x: W, y: backH, z: tb },
        center: { x: 0, y: toe + backH / 2, z: -D / 2 + tb / 2 },
        major: W,
        minor: backH,
      }),
    );
    joints.push({
      id: jid(),
      carcassId: c.id,
      method: "screw-through",
      label: "Back to carcass",
      members: [
        { partId: backId, role: "back" },
        { partId: sideIds[0], role: "side" },
        { partId: sideIds[1], role: "side" },
        { partId: topId, role: "top" },
        { partId: bottomId, role: "bottom" },
      ],
      edgeLength: 2 * (W + backH),
    });
  }

  // --- Shelves ---
  const interiorFloorY = toe + t;
  c.shelves.forEach((sh, i) => {
    const id = pid();
    parts.push(
      mkPart({
        id,
        carcassId: c.id,
        role: "shelf",
        label: `Shelf ${i + 1}`,
        materialId: c.shelfMaterialId,
        thickness: ts,
        grainMatters: true,
        box: { x: innerW, y: ts, z: shelfDepth },
        center: {
          x: 0,
          y: interiorFloorY + sh.offsetFromBottom + ts / 2,
          z: D / 2 - shelfDepth / 2,
        },
        major: innerW,
        minor: shelfDepth,
      }),
    );
    for (const side of sideIds) {
      joints.push({
        id: jid(),
        carcassId: c.id,
        method: sh.attachment,
        label: `Shelf ${i + 1} to side`,
        members: [
          { partId: id, role: "shelf" },
          { partId: side, role: "side" },
        ],
        drilledPartId:
          sh.attachment === "shelf-pin" ? undefined : id,
        edgeLength: shelfDepth,
      });
    }
  });

  return { parts, joints };
}

export function buildAll(
  carcasses: Carcass[],
  catalog: StockCatalog,
): CarcassGeometry {
  const all: CarcassGeometry = { parts: [], joints: [] };
  for (const c of carcasses) {
    const g = buildCarcass(c, catalog);
    all.parts.push(...g.parts);
    all.joints.push(...g.joints);
  }
  return all;
}
