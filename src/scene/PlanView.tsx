import { useRef, useState } from "react";
import type { Project } from "../domain/types";
import { runnerLayout } from "../geometry/runner";
import { baseboardLengthInches, bumpPlanRect } from "../domain/room";
import { useUnits } from "../ui/units";

type Drag =
  | { kind: "carcass" | "box"; id: string }
  | null;

/**
 * Top-down room layout. Room length runs left→right (world X), room width
 * runs top→bottom (world Z). Drag carcasses and totes to place them; runners
 * are drawn read-only because they follow the carcasses they sit on.
 */
export function PlanView({
  project,
  setProject,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
}) {
  const { fmt } = useUnits();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);

  const { length: L, width: W, wallThickness: WT } = project.room;
  const pad = Math.max(L, W) * 0.08 + WT + 6;
  const bbIn = baseboardLengthInches(project.room);
  const bbFt = Math.floor(bbIn / 12);
  const bbRem = Math.round(bbIn - bbFt * 12);

  function toRoom(e: React.PointerEvent): { x: number; z: number } {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM()!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.max(-L / 2, Math.min(L / 2, Math.round(p.x * 100) / 100)),
      z: Math.max(-W / 2, Math.min(W / 2, Math.round(p.y * 100) / 100)),
    };
  }

  function onMove(e: React.PointerEvent) {
    if (!drag) return;
    const { x, z } = toRoom(e);
    if (drag.kind === "carcass") {
      setProject((p) => ({
        ...p,
        carcasses: p.carcasses.map((c) =>
          c.id === drag.id ? { ...c, position: { x, z } } : c,
        ),
      }));
    } else {
      setProject((p) => ({
        ...p,
        refBoxes: p.refBoxes.map((b) =>
          b.id === drag.id ? { ...b, position: { x, z } } : b,
        ),
      }));
    }
  }

  return (
    <div className="plan">
      <p className="label" style={{ padding: "8px 12px 0" }}>
        Drag pieces to place them in the room. Room ={" "}
        {fmt(L)} (L) × {fmt(W)} (W).
        {project.room.baseboard && (
          <>
            {" "}
            Baseboard run ≈ <b>{bbFt}&apos; {bbRem}&quot;</b> (reference only —
            not in the cut list).
          </>
        )}{" "}
        Set room/walls and bump-outs in the left panel; runners follow their
        carcasses automatically.
      </p>
      <svg
        ref={svgRef}
        className="plan-svg"
        viewBox={`${-L / 2 - pad} ${-W / 2 - pad} ${L + 2 * pad} ${
          W + 2 * pad
        }`}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {/* wall outer face */}
        <rect
          x={-L / 2 - WT}
          y={-W / 2 - WT}
          width={L + 2 * WT}
          height={W + 2 * WT}
          fill="#2a2a31"
          stroke="#3a6ea5"
          strokeWidth={Math.max(L, W) / 360}
        />
        {/* room interior */}
        <rect
          x={-L / 2}
          y={-W / 2}
          width={L}
          height={W}
          fill="#15151a"
          stroke="#3a6ea5"
          strokeWidth={Math.max(L, W) / 360}
        />
        {/* bump-outs */}
        {project.room.bumpOuts.map((b) => {
          const r = bumpPlanRect(project.room, b);
          return (
            <g key={b.id}>
              <rect
                x={r.x}
                y={r.z}
                width={r.w}
                height={r.d}
                fill={b.dir === "out" ? "#b06a3a55" : "#15151a"}
                stroke="#b06a3a"
                strokeWidth={Math.max(L, W) / 400}
              />
              <text
                x={r.x + r.w / 2}
                y={r.z + r.d / 2}
                fill="#e0a070"
                fontSize={Math.max(L, W) / 70}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {b.label}
              </text>
            </g>
          );
        })}
        {/* baseboard inner line */}
        {project.room.baseboard && (
          <rect
            x={-L / 2 + project.room.baseboard.thickness}
            y={-W / 2 + project.room.baseboard.thickness}
            width={L - 2 * project.room.baseboard.thickness}
            height={W - 2 * project.room.baseboard.thickness}
            fill="none"
            stroke="#6a6a72"
            strokeDasharray={`${Math.max(L, W) / 90} ${Math.max(L, W) / 120}`}
            strokeWidth={Math.max(L, W) / 500}
          />
        )}
        {/* runners (read-only) */}
        {project.runners.map((r) => {
          const Ly = runnerLayout(r, project.carcasses, project.catalog);
          return (
            <rect
              key={r.id}
              x={Ly.worldLeft}
              y={Ly.z - r.depth / 2}
              width={Ly.length}
              height={r.depth}
              fill="#caa46a55"
              stroke="#caa46a"
              strokeWidth={Math.max(L, W) / 400}
            />
          );
        })}
        {/* carcasses */}
        {project.carcasses.map((c) => (
          <g
            key={c.id}
            transform={`rotate(${c.rotationDeg} ${c.position.x} ${c.position.z})`}
            style={{ cursor: "grab" }}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag({ kind: "carcass", id: c.id });
            }}
          >
            <rect
              x={c.position.x - c.width / 2}
              y={c.position.z - c.depth / 2}
              width={c.width}
              height={c.depth}
              fill="#c8a87766"
              stroke="#e3cda0"
              strokeWidth={Math.max(L, W) / 320}
            />
            <text
              x={c.position.x}
              y={c.position.z}
              fill="#fff"
              fontSize={Math.max(L, W) / 55}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {c.label}
            </text>
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
              strokeWidth={Math.max(L, W) / 400}
            />
            <text
              x={b.position.x}
              y={b.position.z}
              fill="#fff"
              fontSize={Math.max(L, W) / 60}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {b.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
