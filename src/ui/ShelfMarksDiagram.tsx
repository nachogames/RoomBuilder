import type { Carcass, StockCatalog } from "../domain/types";
import { shelfMarks } from "../domain/shelves";
import { useUnits } from "./units";

/** 2D front elevation of a carcass with a dimension tape down the left:
 *  each shelf's layout mark measured from the side panel's bottom edge
 *  (the same datum the Assembly table uses), clear openings labeled in
 *  the gaps. Drawn in the Plan view's drafting style. */
export function ShelfMarksDiagram({
  c,
  catalog,
}: {
  c: Carcass;
  catalog: StockCatalog;
}) {
  const { fmt } = useUnits();
  const t = catalog.materials.find((m) => m.id === c.carcassMaterialId)!
    .thickness;
  const ts = catalog.materials.find((m) => m.id === c.shelfMaterialId)!
    .thickness;
  const { marks, topClear } = shelfMarks(c, catalog);
  const W = c.width;
  const H = c.height;
  const toe = c.toeKickHeight;
  const interiorFloor = toe + t;
  const capped = c.construction === "capped";
  const sideBottomY = capped ? interiorFloor : 0;
  const sideTopY = capped ? H - t : H;
  const Y = (y: number) => H - y; // floor-up world y → svg y (down)

  const fs = Math.max(2.4, H / 30); // label font size in inches
  const tapeX = -fs * 1.1; // vertical tape line
  const leftM = fs * 8.5; // room for the mark labels
  const S = H / 260; // hairline weight

  const wood = "#c8a877";
  const shelfFill = "#e3cda0";
  const kick = "#b9975b";
  const line = "#6f6f7a";
  const dimText = "#e0a458";
  const mono = "ui-monospace, Menlo, Consolas, monospace";

  const openings: Array<{ mid: number; clear: number }> = [];
  {
    let prevTop = interiorFloor;
    const sorted = [...marks].sort(
      (a, b) => a.fromFloor - b.fromFloor,
    );
    for (const m of sorted) {
      openings.push({ mid: (prevTop + m.fromFloor) / 2, clear: m.clearBelow });
      prevTop = m.fromFloor + ts;
    }
    openings.push({ mid: (prevTop + (H - t)) / 2, clear: topClear });
  }

  return (
    <svg
      viewBox={`${-leftM} ${-fs * 1.5} ${W + leftM + fs} ${H + fs * 3}`}
      width="100%"
      style={{ display: "block" }}
    >
      {/* frame: sides, top, bottom, toe rail — per construction */}
      <rect x={0} y={Y(sideTopY)} width={t} height={sideTopY - sideBottomY} fill={wood} stroke={line} strokeWidth={S} />
      <rect x={W - t} y={Y(sideTopY)} width={t} height={sideTopY - sideBottomY} fill={wood} stroke={line} strokeWidth={S} />
      <rect x={capped ? 0 : t} y={Y(H)} width={capped ? W : W - 2 * t} height={t} fill={wood} stroke={line} strokeWidth={S} />
      <rect x={capped ? 0 : t} y={Y(interiorFloor)} width={capped ? W : W - 2 * t} height={t} fill={wood} stroke={line} strokeWidth={S} />
      {toe > 0 && (
        <rect x={capped ? 0 : t} y={Y(toe)} width={capped ? W : W - 2 * t} height={toe} fill={kick} stroke={line} strokeWidth={S} />
      )}
      {/* shelves */}
      {marks.map((m) => (
        <rect
          key={m.shelfNumber}
          x={t}
          y={Y(m.fromFloor + ts)}
          width={W - 2 * t}
          height={ts}
          fill={shelfFill}
          stroke={line}
          strokeWidth={S}
        />
      ))}
      {/* clear-opening labels */}
      {openings.map((o, i) => (
        <text
          key={i}
          x={W / 2}
          y={Y(o.mid)}
          fontSize={fs * 0.85}
          fill="#8a8a96"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={mono}
        >
          {fmt(o.clear)}
        </text>
      ))}
      {/* dimension tape: datum at the side panel's bottom edge */}
      <line
        x1={tapeX}
        y1={Y(sideBottomY)}
        x2={tapeX}
        y2={Y(marks.length ? marks[marks.length - 1].fromFloor : sideBottomY)}
        stroke={line}
        strokeWidth={S}
      />
      {/* datum tick */}
      <line x1={tapeX} y1={Y(sideBottomY)} x2={t} y2={Y(sideBottomY)} stroke={line} strokeWidth={S} />
      <text
        x={tapeX - fs * 0.4}
        y={Y(sideBottomY)}
        fontSize={fs * 0.85}
        fill="#8a8a96"
        textAnchor="end"
        dominantBaseline="middle"
        fontFamily={mono}
      >
        0
      </text>
      {/* one mark per shelf: dashed reach into the case at the shelf's
          bottom face + the tape measurement */}
      {marks.map((m) => (
        <g key={m.shelfNumber}>
          <line
            x1={tapeX}
            y1={Y(m.fromFloor)}
            x2={W - t}
            y2={Y(m.fromFloor)}
            stroke={dimText}
            strokeOpacity={0.55}
            strokeWidth={S}
            strokeDasharray={`${S * 3} ${S * 2}`}
          />
          <text
            x={tapeX - fs * 0.4}
            y={Y(m.fromFloor)}
            fontSize={fs}
            fill={dimText}
            textAnchor="end"
            dominantBaseline="middle"
            fontFamily={mono}
          >
            {fmt(m.markFromSideBottom)}
          </text>
        </g>
      ))}
    </svg>
  );
}
