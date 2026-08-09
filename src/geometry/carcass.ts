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
  // Back panel is surface-mounted (nailed onto the rear) so it sits
  // BEHIND the framing at z = -D/2 - tb/2 and doesn't eat into the
  // carcass interior depth. Shelves use the full depth D.
  const innerW = W - 2 * t;
  const shelfDepth = D;
  // "capped": top/bottom overlap the sides (full W); the sides stand on the
  // bottom panel and stop under the top. Default: sides run full height.
  const capped = c.construction === "capped";
  const sideH = capped ? H - toe - 2 * t : H;
  const sideY = capped ? toe + t + sideH / 2 : H / 2;
  const capW = capped ? W : innerW;

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
        box: { x: t, y: sideH, z: D },
        center: { x: sign * (W / 2 - t / 2), y: sideY, z: 0 },
        major: sideH,
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
      box: { x: capW, y: t, z: D },
      center: { x: 0, y: H - t / 2, z: 0 },
      major: capW,
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
      box: { x: capW, y: t, z: D },
      center: { x: 0, y: toe + t / 2, z: 0 },
      major: capW,
      minor: D,
    }),
  );

  for (const [sideIdx, side] of sideIds.entries()) {
    const sideLabel = sideIdx === 0 ? "left" : "right";
    const edge = sideIdx === 0 ? "left" : "right";
    // tall-sides: pockets go in the top/bottom panels' side edges.
    // capped: the panels overlap the sides, so pockets go in the side ends.
    joints.push({
      id: jid(),
      carcassId: c.id,
      method: c.carcassJoinery,
      label: `Top to ${sideLabel} side`,
      members: [
        { partId: topId, role: "top" },
        { partId: side, role: "side" },
      ],
      drilledPartId: capped ? side : topId,
      drilledEdge: capped ? "top-edge" : edge,
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
      drilledPartId: capped ? side : bottomId,
      drilledEdge: capped ? "bottom-edge" : edge,
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
        box: { x: capW, y: toe, z: t },
        center: { x: 0, y: toe / 2, z: D / 2 - t / 2 },
        major: capW,
        minor: toe,
      }),
    );
    if (capped) {
      // The sides stop at the bottom panel, so the rail fastens up into it.
      joints.push({
        id: jid(),
        carcassId: c.id,
        method: c.carcassJoinery,
        label: "Toe kick to bottom",
        members: [
          { partId: kickId, role: "toe-kick" },
          { partId: bottomId, role: "bottom" },
        ],
        drilledPartId: kickId,
        drilledEdge: "top-edge",
        edgeLength: capW,
      });
    } else {
      for (const [sideIdx, side] of sideIds.entries()) {
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
          drilledEdge: sideIdx === 0 ? "left" : "right",
          edgeLength: toe,
        });
      }
    }
  }

  // --- Back ---
  // Surface-mounted: the back panel is sized to the carcass's full
  // exterior W x H and sits BEHIND the rear edges of sides/top/bottom,
  // nailed (or screwed) on. Its front face touches the back edges of
  // the framing at z = -D/2, so center.z = -D/2 - tb/2.
  if (c.hasBack) {
    const backH = H;
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
        center: { x: 0, y: backH / 2, z: -D / 2 - tb / 2 },
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
    for (const [sideIdx, side] of sideIds.entries()) {
      const drilled = sh.attachment === "shelf-pin" ? undefined : id;
      joints.push({
        id: jid(),
        carcassId: c.id,
        method: sh.attachment,
        label: `Shelf ${i + 1} to side`,
        members: [
          { partId: id, role: "shelf" },
          { partId: side, role: "side" },
        ],
        drilledPartId: drilled,
        drilledEdge: drilled ? (sideIdx === 0 ? "left" : "right") : undefined,
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
