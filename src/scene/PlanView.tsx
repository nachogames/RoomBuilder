import { useRef, useState } from "react";
import type { Project, Pt } from "../domain/types";
import { runnerLayout } from "../geometry/runner";
import {
  baseboardLengthInches,
  centroid,
  setWallLength,
  wallEdges,
} from "../domain/room";
import { useUnits } from "../ui/units";

type Drag =
  | { kind: "corner"; index: number }
  | { kind: "carcass" | "box"; id: string }
  | null;

interface Edit {
  sx: number;
  sy: number;
  value: string;
  commit: (n: number) => void;
}

export function PlanView({
  project,
  setProject,
  showDims,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  showDims: boolean;
}) {
  const { fmt, parse, units } = useUnits();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [edit, setEdit] = useState<Edit | null>(null);

  const room = project.room;
  const walls = room.walls;
  const xs = walls.map((p) => p.x);
  const zs = walls.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ);
  const pad = span * 0.12 + room.wallThickness + 8;
  const S = span / 280; // line-weight scale
  const fontPx = span / 42;

  const bbIn = baseboardLengthInches(room);
  const bbFt = Math.floor(bbIn / 12);
  const bbRem = Math.round(bbIn - bbFt * 12);

  function screenOf(ux: number, uz: number) {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM()!;
    const pt = svg.createSVGPoint();
    pt.x = ux;
    pt.y = uz;
    const s = pt.matrixTransform(ctm);
    const r = wrapRef.current!.getBoundingClientRect();
    return { sx: s.x - r.left, sy: s.y - r.top };
  }
  function toRoom(e: React.PointerEvent) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    // SVGPoint is 2D: screen Y maps to the room's Z axis.
    return { x: Math.round(p.x * 100) / 100, z: Math.round(p.y * 100) / 100 };
  }

  function onMove(e: React.PointerEvent) {
    if (!drag) return;
    const rp = toRoom(e);
    if (!rp) return;
    const { x, z } = rp;
    if (drag.kind === "corner") {
      setProject((pr) => ({
        ...pr,
        room: {
          ...pr.room,
          walls: pr.room.walls.map((p, i) =>
            i === drag.index ? { x, z } : p,
          ),
        },
      }));
    } else if (drag.kind === "carcass") {
      setProject((pr) => ({
        ...pr,
        carcasses: pr.carcasses.map((c) =>
          c.id === drag.id ? { ...c, position: { x, z } } : c,
        ),
      }));
    } else {
      setProject((pr) => ({
        ...pr,
        refBoxes: pr.refBoxes.map((b) =>
          b.id === drag.id ? { ...b, position: { x, z } } : b,
        ),
      }));
    }
  }

  function openEdit(ux: number, uz: number, current: number, commit: (n: number) => void) {
    const { sx, sy } = screenOf(ux, uz);
    setEdit({
      sx,
      sy,
      value: units === "mm" ? String(Math.round(current * 25.4)) : String(current),
      commit,
    });
  }

  function addCornerOnEdge(i: number) {
    const a = walls[i];
    const b = walls[(i + 1) % walls.length];
    const mid: Pt = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    setProject((pr) => {
      const w = [...pr.room.walls];
      w.splice(i + 1, 0, mid);
      return { ...pr, room: { ...pr.room, walls: w } };
    });
  }
  function deleteCorner(i: number) {
    if (walls.length <= 3) return;
    setProject((pr) => ({
      ...pr,
      room: {
        ...pr.room,
        walls: pr.room.walls.filter((_, idx) => idx !== i),
      },
    }));
  }

  const c = centroid(walls);
  const polyPts = walls.map((p) => `${p.x},${p.z}`).join(" ");

  return (
    <div className="plan" ref={wrapRef}>
      <p className="label" style={{ padding: "8px 12px 0" }}>
        Drag corners to shape the room. Click a wall's <b>+</b> to add a
        corner; double-click a corner to remove it. Drag cabinets/totes to
        place them.
        {room.baseboard && (
          <>
            {" "}
            Baseboard run ≈ <b>
              {bbFt}&apos; {bbRem}&quot;
            </b>{" "}
            (reference only).
          </>
        )}{" "}
        Dimensions: <b>{showDims ? "on" : "off"}</b> — click any dimension to
        type a new value.
      </p>
      <svg
        ref={svgRef}
        className="plan-svg"
        viewBox={`${minX - pad} ${minZ - pad} ${maxX - minX + 2 * pad} ${
          maxZ - minZ + 2 * pad
        }`}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {/* wall band (thick stroke) + interior fill */}
        <polygon
          points={polyPts}
          fill="#15151a"
          stroke="#3a6ea5"
          strokeWidth={room.wallThickness}
          strokeLinejoin="round"
          opacity={0.55}
        />
        <polygon
          points={polyPts}
          fill="#15151a"
          stroke="#5b86ad"
          strokeWidth={S}
        />

        {/* runners (read-only, follow carcasses) */}
        {project.runners.map((r) => {
          const Ly = runnerLayout(r, project.carcasses, project.catalog);
          return (
            <g key={r.id}>
              <rect
                x={Ly.worldLeft}
                y={Ly.z - r.depth / 2}
                width={Ly.length}
                height={r.depth}
                fill="#caa46a55"
                stroke="#caa46a"
                strokeWidth={S}
              />
              {showDims && (
                <text
                  className="dim ro"
                  x={Ly.worldLeft + Ly.length / 2}
                  y={Ly.z - r.depth / 2 - fontPx * 0.4}
                  fontSize={fontPx}
                  textAnchor="middle"
                >
                  {r.label}: {fmt(Ly.length)} (auto)
                </text>
              )}
            </g>
          );
        })}

        {/* carcasses */}
        {project.carcasses.map((cc) => (
          <g key={cc.id}>
            <g
              transform={`rotate(${cc.rotationDeg} ${cc.position.x} ${cc.position.z})`}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDrag({ kind: "carcass", id: cc.id });
              }}
            >
              <rect
                x={cc.position.x - cc.width / 2}
                y={cc.position.z - cc.depth / 2}
                width={cc.width}
                height={cc.depth}
                fill="#c8a87766"
                stroke="#e3cda0"
                strokeWidth={S}
              />
              <text
                x={cc.position.x}
                y={cc.position.z}
                fill="#fff"
                fontSize={fontPx}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {cc.label}
              </text>
            </g>
            {showDims && (
              <>
                <text
                  className="dim edit"
                  x={cc.position.x}
                  y={cc.position.z - cc.depth / 2 - fontPx * 0.4}
                  fontSize={fontPx}
                  textAnchor="middle"
                  onClick={() =>
                    openEdit(
                      cc.position.x,
                      cc.position.z - cc.depth / 2,
                      cc.width,
                      (n) =>
                        setProject((pr) => ({
                          ...pr,
                          carcasses: pr.carcasses.map((x) =>
                            x.id === cc.id ? { ...x, width: n } : x,
                          ),
                        })),
                    )
                  }
                >
                  W {fmt(cc.width)}
                </text>
                <text
                  className="dim edit"
                  x={cc.position.x + cc.width / 2 + fontPx * 0.4}
                  y={cc.position.z}
                  fontSize={fontPx}
                  dominantBaseline="middle"
                  onClick={() =>
                    openEdit(
                      cc.position.x + cc.width / 2,
                      cc.position.z,
                      cc.depth,
                      (n) =>
                        setProject((pr) => ({
                          ...pr,
                          carcasses: pr.carcasses.map((x) =>
                            x.id === cc.id ? { ...x, depth: n } : x,
                          ),
                        })),
                    )
                  }
                >
                  D {fmt(cc.depth)}
                </text>
              </>
            )}
          </g>
        ))}

        {/* totes */}
        {project.refBoxes.map((b) => (
          <g
            key={b.id}
            style={{ cursor: "grab" }}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag({ kind: "box", id: b.id });
            }}
          >
            <rect
              x={b.position.x - b.width / 2}
              y={b.position.z - b.depth / 2}
              width={b.width}
              height={b.depth}
              fill="#5fa8d355"
              stroke="#5fa8d3"
              strokeWidth={S}
            />
            <text
              x={b.position.x}
              y={b.position.z}
              fill="#fff"
              fontSize={fontPx * 0.9}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {b.label}
            </text>
          </g>
        ))}

        {/* wall dimensions + add-corner handles */}
        {wallEdges(walls).map(([a, b], i) => {
          const mx = (a.x + b.x) / 2;
          const mz = (a.z + b.z) / 2;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          // outward offset for label so it sits off the wall
          let nx = -(b.z - a.z) / (len || 1);
          let nz = (b.x - a.x) / (len || 1);
          if ((c.x - mx) * nx + (c.z - mz) * nz > 0) {
            nx = -nx;
            nz = -nz;
          }
          const lx = mx + nx * fontPx * 1.6;
          const lz = mz + nz * fontPx * 1.6;
          return (
            <g key={i}>
              {showDims && (
                <text
                  className="dim edit wall"
                  x={lx}
                  y={lz}
                  fontSize={fontPx}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  onClick={() =>
                    openEdit(lx, lz, len, (n) =>
                      setProject((pr) => ({
                        ...pr,
                        room: {
                          ...pr.room,
                          walls: setWallLength(pr.room.walls, i, n),
                        },
                      })),
                    )
                  }
                >
                  {fmt(len)}
                </text>
              )}
              <circle
                cx={mx}
                cy={mz}
                r={fontPx * 0.5}
                className="addpt"
                onClick={() => addCornerOnEdge(i)}
              />
              <text
                x={mx}
                y={mz}
                fontSize={fontPx * 0.8}
                fill="#0f0f12"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ pointerEvents: "none" }}
              >
                +
              </text>
            </g>
          );
        })}

        {/* corner handles */}
        {walls.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.z}
            r={fontPx * 0.55}
            className="corner"
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag({ kind: "corner", index: i });
            }}
            onDoubleClick={() => deleteCorner(i)}
          />
        ))}
      </svg>

      {edit && (
        <input
          className="dim-input"
          autoFocus
          defaultValue={edit.value}
          style={{ left: edit.sx, top: edit.sy }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEdit(null);
          }}
          onBlur={(e) => {
            const n = parse(e.target.value);
            if (n != null && n > 0) edit.commit(n);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}
