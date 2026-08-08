import { useRef, useState } from "react";
import type { Project, Pt } from "../domain/types";
import { translateGroup } from "../geometry/group";
import { findContainer, clampToInterior } from "../geometry/container";
import { attemptToteMove } from "../geometry/totePush";
import { resolveMove } from "./dragMath";
import { carcassRoomRect } from "./placement";
import {
  baseboardLengthInches,
  centroid,
  collisionWalls,
  innerOffsetVertices,
  setWallLength,
  setJutDepthSymmetric,
  rectInsideRoom,
  wallEdges,
} from "../domain/room";
import { useUnits } from "../ui/units";
import { personFootprint } from "../domain/person";

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
  | { kind: "carcass" | "box" | "runner" | "person"; id: string; dx: number; dz: number }
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
  hidden = new Set<string>(),
  onSelect,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  showDims: boolean;
  /** Ids hidden via the browser-tree eye toggles; not drawn or draggable. */
  hidden?: ReadonlySet<string>;
  onSelect: (id: string) => void;
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
      const c = project.carcasses.find((k) => k.id === drag.id);
      if (!c) return;
      // apply the grab offset so the piece tracks the cursor (no jump)
      const tx = x + drag.dx;
      const tz = z + drag.dz;
      // wall resistance with slide: block only the axis that would push the
      // footprint through a wall, so you can still run along it. The
      // footprint includes the surface-mounted back panel hanging off the
      // carcass's rear.
      const cWalls = collisionWalls(room, c.baseHeight ?? 0);
      const ok = (px: number, pz: number) => {
        const r = carcassRoomRect(c, project, px, pz);
        return rectInsideRoom(cWalls, r.cx, r.cz, r.w, r.d, c.rotationDeg);
      };
      const p0 = c.position;
      const pos = resolveMove(ok, tx, tz, p0, false);
      if (pos === p0) return;
      setProject((pr) => ({
        ...pr,
        carcasses: pr.carcasses.map((k) =>
          k.id === drag.id ? { ...k, position: pos } : k,
        ),
      }));
    } else if (drag.kind === "runner") {
      const r = project.runners.find((k) => k.id === drag.id);
      if (!r) return;
      // Constrain by the runner's OWN footprint (like a carcass) so it always
      // drags — even a runner spanning far-apart cabinets. Owned cabinets
      // follow via translateGroup; drag a cabinet alone to nudge it after.
      const tx = x + drag.dx;
      const tz = z + drag.dz;
      const p0 = r.position;
      // If the shelf fits inside a bookcase it overlaps, clamp to that
      // bookcase's interior (sides + back, front open); else use room walls.
      const container = findContainer(
        { id: r.id, w: r.length, d: r.depth, cx: tx, cz: tz, rotationDeg: r.rotationDeg, prevPos: p0, excludeIds: r.spannedCarcassIds },
        project,
      );
      const ok = (px: number, pz: number) =>
        rectInsideRoom(
          collisionWalls(room, r.baseHeight ?? 0),
          px,
          pz,
          r.length,
          r.depth,
          r.rotationDeg,
        );
      // Wall-slide when a respecting position exists, but NEVER freeze: a long
      // shelf that can't fit any in-room position still follows the cursor.
      const pos = container
        ? clampToInterior(container, r.length, r.depth, tx, tz, project, r.rotationDeg)
        : resolveMove(ok, tx, tz, p0, true);
      if (r.groupDrag && !container) {
        // desk top: carry the spanned cabinets along
        const t = translateGroup(r, project, pos.x - p0.x, pos.z - p0.z);
        setProject((pr) => ({
          ...pr,
          runners: pr.runners.map((k) => (k.id === r.id ? t.runner : k)),
          carcasses: pr.carcasses.map((k) =>
            t.carcassPos[k.id] ? { ...k, position: t.carcassPos[k.id] } : k,
          ),
        }));
      } else {
        // a shelf: move the runner alone, leave the carcasses put
        setProject((pr) => ({
          ...pr,
          runners: pr.runners.map((k) =>
            k.id === r.id ? { ...k, position: pos } : k,
          ),
        }));
      }
    } else if (drag.kind === "box") {
      const bx = project.refBoxes.find((k) => k.id === drag.id);
      if (!bx) return;
      const tx = x + drag.dx;
      const tz = z + drag.dz;
      // use the larger (top) outline — the tote's outermost visible edge — for
      // both room walls and the bookcase interior, so that edge stops at walls.
      const bw = Math.max(bx.width, bx.topWidth ?? bx.width);
      const bd = Math.max(bx.depth, bx.topDepth ?? bx.depth);
      const p0 = bx.position;
      const okFn = (px: number, pz: number) =>
        rectInsideRoom(
          collisionWalls(room, bx.baseHeight ?? 0),
          px,
          pz,
          bw,
          bd,
          bx.rotationDeg,
        );
      const container = findContainer(
        { id: bx.id, w: bw, d: bd, cx: tx, cz: tz, rotationDeg: bx.rotationDeg, prevPos: p0 },
        project,
      );
      // Clamp the cursor target to the mover's own room/container constraint;
      // the cascade handles tote-vs-tote collision (with partial-push when the
      // chain bottoms out against a wall).
      const clampTarget = (cx: number, cz: number) =>
        container
          ? clampToInterior(container, bw, bd, cx, cz, project, bx.rotationDeg)
          : resolveMove(okFn, cx, cz, p0, false);
      // Try diagonal first; if the chain bottoms out and produces no movement,
      // try each axis alone so the mover can still slide along the constraint.
      const tryAttempt = (cx: number, cz: number) => {
        const c = clampTarget(cx, cz);
        if (Math.abs(c.x - p0.x) < 1e-6 && Math.abs(c.z - p0.z) < 1e-6) return null;
        const r = attemptToteMove(project, bx.id, c.x, c.z);
        if (!r.ok || !r.moverPos) return null;
        const moved =
          Math.abs(r.moverPos.x - p0.x) > 1 / 64 ||
          Math.abs(r.moverPos.z - p0.z) > 1 / 64 ||
          Object.keys(r.updates).length > 0;
        if (!moved) return null;
        return { r, clamped: c };
      };
      const attempt =
        tryAttempt(tx, tz) ?? tryAttempt(tx, p0.z) ?? tryAttempt(p0.x, tz);
      if (!attempt) {
        // Mover can't move at all this tick. Still re-anchor the grab to the
        // current position so the cursor doesn't accumulate offset and produce
        // a rubber-band jump when the user reverses direction.
        if (Math.abs(p0.x - tx) > 1 / 64 || Math.abs(p0.z - tz) > 1 / 64) {
          setDrag({ ...drag, dx: p0.x - x, dz: p0.z - z });
        }
        return;
      }
      const { r: result } = attempt;
      const pos = result.moverPos!;
      // Re-anchor the grab offset so the next mousemove tracks from where the
      // mover actually ended up — prevents the rubber-band that would otherwise
      // build up whenever the cursor outruns the mover (chain hits a wall, axis
      // slide, etc.).
      if (Math.abs(pos.x - tx) > 1 / 64 || Math.abs(pos.z - tz) > 1 / 64) {
        setDrag({ ...drag, dx: pos.x - x, dz: pos.z - z });
      }
      const updates = { ...result.updates, [bx.id]: pos };
      setProject((pr) => ({
        ...pr,
        refBoxes: pr.refBoxes.map((k) =>
          updates[k.id] ? { ...k, position: updates[k.id] } : k,
        ),
      }));
    } else {
      // person
      const pn = project.people.find((k) => k.id === drag.id);
      if (!pn) return;
      const tx = x + drag.dx;
      const tz = z + drag.dz;
      const fp = personFootprint(pn);
      const p0 = pn.position;
      const ok = (px: number, pz: number) =>
        rectInsideRoom(
          collisionWalls(room, pn.baseHeight ?? 0),
          px,
          pz,
          fp.width,
          fp.depth,
          pn.rotationDeg,
        );
      const pos = resolveMove(ok, tx, tz, p0, false);
      if (pos === p0) return;
      setProject((pr) => ({
        ...pr,
        people: pr.people.map((k) =>
          k.id === drag.id ? { ...k, position: pos } : k,
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

        {/* baseboard band: the strip items at floor level can't enter. Drawn
            as wall polygon minus the inward-offset polygon (even-odd fill). */}
        {room.baseboard && room.baseboard.thickness > 0 && (() => {
          const inner = innerOffsetVertices(walls, room.baseboard.thickness);
          const ring = (pts: Pt[]) =>
            `M ${pts.map((p) => `${p.x} ${p.z}`).join(" L ")} Z`;
          return (
            <path
              d={`${ring(walls)} ${ring(inner)}`}
              fillRule="evenodd"
              fill="#caa46a"
              fillOpacity={0.35}
              stroke="#caa46a"
              strokeOpacity={0.6}
              strokeWidth={S * 0.6}
              pointerEvents="none"
            />
          );
        })()}

        {/* runners / desktops (draggable; drags the desk group) */}
        {project.runners.filter((r) => !hidden.has(r.id)).map((r) => (
          <g key={r.id}>
            <g
              transform={`rotate(${r.rotationDeg} ${r.position.x} ${r.position.z})`}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                onSelect(r.id);
                const rp = toRoom(e);
                setDrag({
                  kind: "runner",
                  id: r.id,
                  dx: rp ? r.position.x - rp.x : 0,
                  dz: rp ? r.position.z - rp.z : 0,
                });
              }}
            >
              <rect
                x={r.position.x - r.length / 2}
                y={r.position.z - r.depth / 2}
                width={r.length}
                height={r.depth}
                fill="#caa46a55"
                stroke="#caa46a"
                strokeWidth={S}
              />
            </g>
            {showDims && (
              <>
                <text
                  className="dim edit"
                  x={r.position.x}
                  y={r.position.z - r.depth / 2 - fontPx * 0.4}
                  fontSize={fontPx}
                  textAnchor="middle"
                  onClick={() =>
                    openEdit(
                      r.position.x,
                      r.position.z - r.depth / 2,
                      r.length,
                      (n) =>
                        setProject((pr) => ({
                          ...pr,
                          runners: pr.runners.map((x) =>
                            x.id === r.id ? { ...x, length: n } : x,
                          ),
                        })),
                    )
                  }
                >
                  L {fmt(r.length)}
                </text>
                <text
                  className="dim edit"
                  x={r.position.x + r.length / 2 + fontPx * 0.4}
                  y={r.position.z}
                  fontSize={fontPx}
                  dominantBaseline="middle"
                  onClick={() =>
                    openEdit(
                      r.position.x + r.length / 2,
                      r.position.z,
                      r.depth,
                      (n) =>
                        setProject((pr) => ({
                          ...pr,
                          runners: pr.runners.map((x) =>
                            x.id === r.id ? { ...x, depth: n } : x,
                          ),
                        })),
                    )
                  }
                >
                  D {fmt(r.depth)}
                </text>
              </>
            )}
          </g>
        ))}

        {/* carcasses */}
        {project.carcasses.filter((cc) => !hidden.has(cc.id)).map((cc) => (
          <g key={cc.id}>
            <g
              transform={`rotate(${cc.rotationDeg} ${cc.position.x} ${cc.position.z})`}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                onSelect(cc.id);
                const rp = toRoom(e);
                setDrag({
                  kind: "carcass",
                  id: cc.id,
                  dx: rp ? cc.position.x - rp.x : 0,
                  dz: rp ? cc.position.z - rp.z : 0,
                });
              }}
            >
              {/* body fill */}
              <rect
                x={cc.position.x - cc.width / 2}
                y={cc.position.z - cc.depth / 2}
                width={cc.width}
                height={cc.depth}
                fill="#c8a87766"
              />
              {/* U-outline: solid back + two sides; open front (local +Z =
                  bottom edge of this un-rotated path) drawn as a dashed line
                  so you can see which side of the cabinet is open. */}
              <path
                d={`M ${cc.position.x - cc.width / 2} ${cc.position.z + cc.depth / 2}
                    L ${cc.position.x - cc.width / 2} ${cc.position.z - cc.depth / 2}
                    L ${cc.position.x + cc.width / 2} ${cc.position.z - cc.depth / 2}
                    L ${cc.position.x + cc.width / 2} ${cc.position.z + cc.depth / 2}`}
                fill="none"
                stroke="#e3cda0"
                strokeWidth={S}
                strokeLinejoin="round"
              />
              <line
                x1={cc.position.x - cc.width / 2}
                y1={cc.position.z + cc.depth / 2}
                x2={cc.position.x + cc.width / 2}
                y2={cc.position.z + cc.depth / 2}
                stroke="#e3cda0"
                strokeOpacity={0.5}
                strokeWidth={S}
                strokeDasharray={`${S * 2} ${S * 1.5}`}
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
        {project.refBoxes.filter((b) => !hidden.has(b.id)).map((b) => (
          <g
            key={b.id}
            transform={`rotate(${b.rotationDeg} ${b.position.x} ${b.position.z})`}
            style={{ cursor: "grab" }}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              onSelect(b.id);
              const rp = toRoom(e);
              setDrag({
                kind: "box",
                id: b.id,
                dx: rp ? b.position.x - rp.x : 0,
                dz: rp ? b.position.z - rp.z : 0,
              });
            }}
          >
            {(() => {
              const topW = b.topWidth ?? b.width;
              const topD = b.topDepth ?? b.depth;
              // outer footprint = the larger (top) outline; bottom nests inside
              const outW = Math.max(b.width, topW);
              const outD = Math.max(b.depth, topD);
              const inW = Math.min(b.width, topW);
              const inD = Math.min(b.depth, topD);
              const tapered = inW !== outW || inD !== outD;
              return (
                <>
                  <rect
                    x={b.position.x - outW / 2}
                    y={b.position.z - outD / 2}
                    width={outW}
                    height={outD}
                    fill="#5fa8d355"
                    stroke="#5fa8d3"
                    strokeWidth={S}
                  />
                  {tapered && (
                    <rect
                      x={b.position.x - inW / 2}
                      y={b.position.z - inD / 2}
                      width={inW}
                      height={inD}
                      fill="none"
                      stroke="#5fa8d3"
                      strokeWidth={S}
                      strokeDasharray={`${S * 3} ${S * 2}`}
                      pointerEvents="none"
                    />
                  )}
                </>
              );
            })()}
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

        {/* people — oval footprint with a tick on the +Z side (facing forward) */}
        {project.people.filter((pn) => !hidden.has(pn.id)).map((pn) => {
          const fp = personFootprint(pn);
          const color = "#8aa0a8"; // muted cool gray
          return (
            <g
              key={pn.id}
              transform={`rotate(${pn.rotationDeg} ${pn.position.x} ${pn.position.z})`}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                onSelect(pn.id);
                const rp = toRoom(e);
                setDrag({
                  kind: "person",
                  id: pn.id,
                  dx: rp ? pn.position.x - rp.x : 0,
                  dz: rp ? pn.position.z - rp.z : 0,
                });
              }}
            >
              <ellipse
                cx={pn.position.x}
                cy={pn.position.z}
                rx={fp.width / 2}
                ry={fp.depth / 2}
                fill={`${color}55`}
                stroke={color}
                strokeWidth={S}
              />
              {/* small triangle on the +Z (front) side to show facing direction */}
              {(() => {
                const cx = pn.position.x;
                const cz = pn.position.z;
                const tip = fp.depth / 2 + fontPx * 0.6;
                const base = fp.depth / 2 - fontPx * 0.1;
                const half = fontPx * 0.5;
                return (
                  <polygon
                    points={`${cx},${cz + tip} ${cx - half},${cz + base} ${cx + half},${cz + base}`}
                    fill={color}
                    pointerEvents="none"
                  />
                );
              })()}
              <text
                x={pn.position.x}
                y={pn.position.z}
                fill="#fff"
                fontSize={fontPx * 0.85}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {pn.pose === "sitting" ? "Sit" : "Stand"}
              </text>
            </g>
          );
        })}

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
