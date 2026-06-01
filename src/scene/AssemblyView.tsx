// src/scene/AssemblyView.tsx
import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Edges } from "@react-three/drei";
import type { Project } from "../domain/types";
import type { Part } from "../geometry/types";
import { buildCarcass } from "../geometry/carcass";
import { pocketHoleMarks } from "../geometry/pocketHoles";
import { explodeOffset } from "./explode";
import { PocketHoleMesh } from "./PocketHoleMesh";

const ROLE_COLOR: Record<string, string> = {
  side: "#c8a877",
  top: "#d8bd92",
  bottom: "#d8bd92",
  "toe-kick": "#b9975b",
  back: "#9c8157",
  shelf: "#e3cda0",
};

/** Self-contained 3D view of one carcass with a 0..1 explode slider, real
 *  pocket-hole geometry and edge outlines. Independent camera. */
export function AssemblyView({
  project,
  carcassId,
}: {
  project: Project;
  carcassId: string;
}) {
  const carcass = project.carcasses.find((c) => c.id === carcassId);
  const [explodeT, setExplodeT] = useState(0);

  const geometry = useMemo(() => {
    if (!carcass) return null;
    const g = buildCarcass(carcass, project.catalog);
    const marks = pocketHoleMarks(g.parts, g.joints, project.catalog);
    const marksByPart = new Map<string, typeof marks>();
    for (const m of marks) {
      const arr = marksByPart.get(m.partId) ?? [];
      arr.push(m);
      marksByPart.set(m.partId, arr);
    }
    const shelfParts = g.parts.filter((p) => p.role === "shelf");
    return { parts: g.parts, marksByPart, shelfParts };
  }, [carcass, project.catalog]);

  if (!carcass || !geometry) {
    return (
      <div style={{ padding: 24 }}>
        <p className="label">
          Select a bookcase in another tab to see it exploded.
        </p>
      </div>
    );
  }

  const { parts, marksByPart, shelfParts } = geometry;
  const span = Math.max(carcass.width, carcass.height, carcass.depth);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ExplodeControl t={explodeT} onChange={setExplodeT} />
      <Canvas
        shadows
        camera={{
          position: [carcass.width * 1.5, carcass.height * 0.9, carcass.depth * 1.8],
          fov: 45,
        }}
        style={{ background: "#1b1b1f" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[span, span * 1.4, span]}
          intensity={1.1}
          castShadow
        />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          receiveShadow
        >
          <planeGeometry args={[span * 4, span * 4]} />
          <meshStandardMaterial color="#2a2a30" />
        </mesh>
        <group position={[0, 0, 0]}>
          {parts.map((p) => (
            <AssemblyPart
              key={p.id}
              part={p}
              carcass={carcass}
              shelfIdx={p.role === "shelf" ? shelfParts.indexOf(p) : undefined}
              shelfCount={shelfParts.length}
              t={explodeT}
              marks={marksByPart.get(p.id) ?? []}
            />
          ))}
        </group>
        <OrbitControls
          makeDefault
          target={[0, carcass.height / 2, 0]}
        />
      </Canvas>
    </div>
  );
}

function AssemblyPart({
  part,
  carcass,
  shelfIdx,
  shelfCount,
  t,
  marks,
}: {
  part: Part;
  carcass: Project["carcasses"][number];
  shelfIdx: number | undefined;
  shelfCount: number;
  t: number;
  marks: ReturnType<typeof pocketHoleMarks>;
}) {
  const off = explodeOffset(part, carcass, shelfIdx, shelfCount, t);
  const color = ROLE_COLOR[part.role] ?? "#bbb";
  const opacity = 1 - 0.4 * t;
  return (
    <group
      position={[part.center.x + off.x, part.center.y + off.y, part.center.z + off.z]}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[part.box.x, part.box.y, part.box.z]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
        <Edges threshold={15} color="#332b1c" />
      </mesh>
      {/* Pocket holes were computed in carcass-local coords. The outer
          <group> above translates by (part.center + off). Pocket marks
          have absolute carcass-local positions, so we counter-translate
          by -part.center here. The remaining +off lift naturally moves
          the pocket holes along with the part during explode. */}
      {marks.length > 0 && (
        <group position={[-part.center.x, -part.center.y, -part.center.z]}>
          {marks.map((m, i) => (
            <PocketHoleMesh key={i} mark={m} />
          ))}
        </group>
      )}
    </group>
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
