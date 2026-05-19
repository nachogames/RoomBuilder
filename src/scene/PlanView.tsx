import { useRef, useState } from "react";
import type { Project, Pt } from "../domain/types";
import { runnerLayout } from "../geometry/runner";
import {
  baseboardLengthInches,
  centroid,
  setWallLength,
  setJutDepthSymmetric,
  pointInRoom,
  wallEdges,
} from "../domain/room";
import { useUnits } from "../ui/units";

type Drag =
  | { kind: "corner"; index: number }
  | {
      kind: "edge";
      index: number;
      a0: Pt;
      b0: Pt;
      start: Pt;
      nx: number;
      nz: number;
      base: Pt[]; // wall snapshot at drag start
      spawn: boolean; // straight run -> spawn jut; jut face -> translate
    }
  | { kind: "carcass" | "box"; id: string }
  | null;

/** Snap to a clean 1/4" so freehand wall edits land square. */
const snap = (v: number) => Math.round(v / 0.25) * 0.25;

function projectOnSeg(a: Pt, b: Pt, p: Pt) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, z: a.z + t * dz };
}

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
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
  const movedRef = useRef(false);

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
      // free move — markers can create angled walls between points
      movedRef.current = true;
      const nx = snap(x);
      const nz = snap(z);
      const d = drag;
      setProject((pr) => ({
        ...pr,
        room: {
          ...pr.room,
          walls: pr.room.walls.map((p, i) =>
            i === d.index ? { x: nx, z: nz } : p,
          ),
        },
      }));
    } else if (drag.kind === "edge") {
      // grab the edge → the two endpoints stay anchored on the wall line
      // and a square jut is spawned: a0 → A' → B' → b0, with A'/B' the
      // pulled segment offset along the wall's perpendicular (always 90°).
      const d = drag;
      const amt = snap((x - d.start.x) * d.nx + (z - d.start.z) * d.nz);
      if (Math.abs(amt) > 0.2) movedRef.current = true;
      const Aoff = { x: d.a0.x + d.nx * amt, z: d.a0.z + d.nz * amt };
      const Boff = { x: d.b0.x + d.nx * amt, z: d.b0.z + d.nz * amt };
      const j = (d.index + 1) % d.base.length;
      const next = d.spawn
        ? // straight wall section → spawn a square jut (anchors stay)
          [
            ...d.base.slice(0, d.index + 1),
            Aoff,
            Boff,
            ...d.base.slice(d.index + 1),
          ]
        : // jut face (or plain wall) → just move this edge in/out,
          // moving its two existing markers together (no new points)
          d.base.map((p, k) =>
            k === d.index ? Aoff : k === j ? Boff : p,
          );
      setProject((pr) => ({
        ...pr,
        room: { ...pr.room, walls: next },
      }));
    } else if (drag.kind === "carcass") {
      // wall resistance: don't let the piece leave the room
      if (!pointInRoom(walls, x, z)) return;
      setProject((pr) => ({
        ...pr,
        carcasses: pr.carcasses.map((c) =>
          c.id === drag.id ? { ...c, position: { x, z } } : c,
        ),
      }));
    } else {
      if (!pointInRoom(walls, x, z)) return;
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

  function insertCornerAt(i: number, pt: Pt) {
    setProject((pr) => {
      const w = [...pr.room.walls];
      w.splice(i + 1, 0, pt);
      return { ...pr, room: { ...pr.room, walls: w } };
    });
  }
  function startEdgeDrag(e: React.PointerEvent, i: number) {
    const rp = toRoom(e);
    if (!rp) return;
    const m = walls.length;
    const a0 = walls[i];
    const b0 = walls[(i + 1) % m];
    const len = Math.hypot(b0.x - a0.x, b0.z - a0.z) || 1;
    const ex = (b0.x - a0.x) / len;
    const ez = (b0.z - a0.z) / len;
    const nx = -ez;
    const nz = ex;
    // is a neighbour edge in-line with this one? (collinear straight wall)
    const inline = (p: Pt, q: Pt) => {
      const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const cross = ((q.x - p.x) / l) * ez - ((q.z - p.z) / l) * ex;
      return Math.abs(cross) < 0.12; // ~7°
    };
    const prev = walls[(i - 1 + m) % m];
    const nextP = walls[(i + 2) % m];
    // spawn a jut only when the grabbed edge is a section of a straight
    // wall (both neighbours in-line); a jut face's neighbours are the
    // perpendicular returns, so it just translates instead.
    const spawn = inline(prev, a0) && inline(b0, nextP);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    movedRef.current = false;
    setGhost(null);
    setDrag({
      kind: "edge",
      index: i,
      a0,
      b0,
      start: projectOnSeg(a0, b0, rp),
      nx,
      nz,
      base: walls.map((p) => ({ ...p })),
      spawn,
    });
  }
  function endDrag() {
    if (drag?.kind === "edge" && !movedRef.current) {
      // a click (no pull) drops a breakpoint at that spot on the wall
      insertCornerAt(drag.index, drag.start);
    }
    setDrag(null);
    movedRef.current = false;
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
        <b>Click a wall</b> to drop a marker. <b>Drag the wall between two
        markers</b> → spawns a square 90° jut. <b>Drag the jut&apos;s face</b>{" "}
        → moves it in/out (changes depth, no new markers). <b>Drag a
        marker</b> to change the jut width. Double-click a corner to remove
        it. Drag cabinets/totes to place them.
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
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
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
              {/* invisible thick hit-line: hover = ghost, click = add
                  breakpoint, drag = pull the wall out/in */}
              <line
                className="wall-hit"
                x1={a.x}
                y1={a.z}
                x2={b.x}
                y2={b.z}
                strokeWidth={fontPx * 1.1}
                onPointerDown={(e) => startEdgeDrag(e, i)}
                onPointerMove={(e) => {
                  if (drag) return;
                  const rp = toRoom(e);
                  if (rp) setGhost(projectOnSeg(a, b, rp));
                }}
                onPointerLeave={() => !drag && setGhost(null)}
              />
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
                          // jut returns stay symmetric; otherwise resize edge
                          walls:
                            setJutDepthSymmetric(pr.room.walls, i, n) ??
                            setWallLength(pr.room.walls, i, n),
                        },
                      })),
                    )
                  }
                >
                  {fmt(len)}
                </text>
              )}
            </g>
          );
        })}

        {/* ghost breakpoint preview where a click would drop a corner */}
        {ghost && !drag && (
          <circle
            cx={ghost.x}
            cy={ghost.z}
            r={fontPx * 0.5}
            className="ghost-pt"
          />
        )}

        {/* corner handles */}
        {walls.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.z}
            r={fontPx * 0.6}
            className="corner"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              movedRef.current = false;
              setGhost(null);
              setDrag({ kind: "corner", index: i });
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              deleteCorner(i);
            }}
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
