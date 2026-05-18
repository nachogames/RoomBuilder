import { useState } from "react";
import type { Pt } from "../domain/types";
import { addJut, wallEdges } from "../domain/room";
import { StepField } from "./fields";
import { useUnits } from "./units";

/** Numeric 90° jut creator: pick a wall, type two offsets + a depth. */
export function JutTool({
  walls,
  onApply,
}: {
  walls: Pt[];
  onApply: (next: Pt[]) => void;
}) {
  const { fmt } = useUnits();
  const [wall, setWall] = useState(0);
  const [offA, setOffA] = useState(20.75);
  const [offB, setOffB] = useState(27.5);
  const [depth, setDepth] = useState(6);
  const [dir, setDir] = useState<"out" | "in">("out");

  const edges = wallEdges(walls);
  const idx = Math.min(wall, edges.length - 1);
  const [a, b] = edges[idx];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const bad = offA === offB || depth <= 0 || Math.max(offA, offB) > len;

  return (
    <div className="sub">
      <div className="label" style={{ marginBottom: 4 }}>
        90° jut — exact offsets from the wall&apos;s start corner
      </div>
      <label className="field">
        <span>Wall</span>
        <select
          value={idx}
          onChange={(e) => setWall(Number(e.target.value))}
        >
          {edges.map(([p, q], i) => (
            <option key={i} value={i}>
              Wall {i + 1} · {fmt(Math.hypot(q.x - p.x, q.z - p.z))}
            </option>
          ))}
        </select>
      </label>
      <StepField label="Offset A" value={offA} onChange={setOffA} />
      <StepField label="Offset B" value={offB} onChange={setOffB} />
      <StepField label="Depth" value={depth} onChange={setDepth} />
      <label className="field">
        <span>Direction</span>
        <select
          value={dir}
          onChange={(e) => setDir(e.target.value as "out" | "in")}
        >
          <option value="out">juts out</option>
          <option value="in">recess in</option>
        </select>
      </label>
      <button
        disabled={bad}
        title={
          bad
            ? "Offsets must differ, be within the wall, and depth > 0"
            : "Insert a square jut"
        }
        onClick={() => onApply(addJut(walls, idx, offA, offB, depth, dir))}
      >
        Add 90° jut
      </button>
    </div>
  );
}
