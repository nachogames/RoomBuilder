import { Canvas } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useMemo } from "react";
import type { Carcass, Project } from "../domain/types";
import { buildCarcass } from "../geometry/carcass";
import type { Part, PartRole } from "../geometry/types";

const ROLE_COLOR: Record<PartRole, string> = {
  side: "#c8a877",
  top: "#d8bd92",
  bottom: "#d8bd92",
  "toe-kick": "#b9975b",
  back: "#9c8157",
  shelf: "#e3cda0",
};

function PartMesh({ part }: { part: Part }) {
  return (
    <mesh position={[part.center.x, part.center.y, part.center.z]} castShadow>
      <boxGeometry args={[part.box.x, part.box.y, part.box.z]} />
      <meshStandardMaterial color={ROLE_COLOR[part.role]} />
    </mesh>
  );
}

function CarcassGroup({
  carcass,
  project,
}: {
  carcass: Carcass;
  project: Project;
}) {
  const parts = useMemo(
    () => buildCarcass(carcass, project.catalog).parts,
    [carcass, project.catalog],
  );
  return (
    <group
      position={[carcass.position.x, 0, carcass.position.z]}
      rotation={[0, (carcass.rotationDeg * Math.PI) / 180, 0]}
    >
      {parts.map((p) => (
        <PartMesh key={p.id} part={p} />
      ))}
    </group>
  );
}

function RoomShell({ project }: { project: Project }) {
  const { length, width, ceilingHeight } = project.room;
  return (
    <group>
      <gridHelper args={[Math.max(length, width) * 1.5, 24, "#444", "#2a2a2a"]} />
      <mesh
        position={[0, ceilingHeight / 2, 0]}
        renderOrder={-1}
      >
        <boxGeometry args={[length, ceilingHeight, width]} />
        <meshBasicMaterial color="#3a6ea5" wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

export function Scene({ project }: { project: Project }) {
  const span = Math.max(
    project.room.length,
    project.room.width,
    project.room.ceilingHeight,
  );
  return (
    <Canvas
      shadows
      camera={{ position: [span * 0.9, span * 0.8, span * 1.1], fov: 45 }}
      style={{ background: "#1b1b1f" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 200, 120]} intensity={1.1} castShadow />
      <RoomShell project={project} />
      {project.carcasses.map((c) => (
        <CarcassGroup key={c.id} carcass={c} project={project} />
      ))}
      <OrbitControls makeDefault target={[0, project.room.ceilingHeight / 3, 0]} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </Canvas>
  );
}
