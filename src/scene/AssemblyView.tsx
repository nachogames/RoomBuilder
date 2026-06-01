import { useState } from "react";
import type { Project } from "../domain/types";

/**
 * Self-contained 3D view of one carcass: parts can explode outward via a
 * 0..1 slider and pocket-hole geometry is rendered on the right faces.
 * Independent camera from the main 3D tab.
 */
export function AssemblyView({
  project,
  carcassId,
}: {
  project: Project;
  carcassId: string;
}) {
  const carcass = project.carcasses.find((c) => c.id === carcassId);
  const [explodeT, setExplodeT] = useState(0);

  if (!carcass) {
    return (
      <div style={{ padding: 24 }}>
        <p className="label">
          Select a bookcase in another tab to see it exploded.
        </p>
      </div>
    );
  }

  // Carcass scene comes in Task 8.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ExplodeControl t={explodeT} onChange={setExplodeT} />
      <div style={{ padding: 24 }}>
        <p className="label">Assembly: {carcass.label} (placeholder)</p>
      </div>
    </div>
  );
}

function ExplodeControl({
  t,
  onChange,
}: {
  t: number;
  onChange: (v: number) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 1,
        background: "#0008",
        color: "#fff",
        padding: "8px 10px",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12 }}>Exploded: {Math.round(t * 100)}%</div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={t}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
