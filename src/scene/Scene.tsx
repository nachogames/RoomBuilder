import { Canvas } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useMemo } from "react";
import type { Carcass, Project } from "../domain/types";
import { buildCarcass } from "../geometry/carcass";
import { buildRunner } from "../geometry/runner";
import { roomReferenceSlabs } from "../domain/room";
import type { Part, PartRole } from "../geometry/types";

const ROLE_COLOR: Record<PartRole, string> = {
  side: "#c8a877",
  top: "#d8bd92",
  bottom: "#d8bd92",
  "toe-kick": "#b9975b",
  back: "#9c8157",
  shelf: "#e3cda0",
  runner: "#caa46a",
  support: "#8a6f44",
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

function RunnerMeshes({ project }: { project: Project }) {
  const parts = useMemo(() => {
    const out: Part[] = [];
    for (const r of project.runners) {
      out.push(
        ...buildRunner(r, project.carcasses, project.catalog).parts,
      );
    }
    return out;
  }, [project]);
  return (
    <>
      {parts.map((p) => (
        <PartMesh key={p.id} part={p} />
      ))}
    </>
  );
}

function RefBoxes({ project }: { project: Project }) {
  return (
    <>
      {project.refBoxes.map((b) => (
        <mesh
          key={b.id}
          position={[b.position.x, b.height / 2, b.position.z]}
        >
          <boxGeometry args={[b.width, b.height, b.depth]} />
          <meshStandardMaterial
            color="#5fa8d3"
            transparent
            opacity={0.45}
          />
        </mesh>
      ))}
    </>
  );
}

function RoomShell({ project }: { project: Project }) {
  const { length, width } = project.room;
  const slabs = useMemo(
    () => roomReferenceSlabs(project.room),
    [project.room],
  );
  const COLOR = {
    wall: "#3a6ea5",
    bump: "#b06a3a",
    baseboard: "#6a6a72",
  } as const;
  return (
    <group>
      <gridHelper
        args={[Math.max(length, width) * 1.5, 24, "#444", "#2a2a2a"]}
      />
      {slabs.map((s) => (
        <mesh
          key={s.id}
          position={[s.center.x, s.center.y, s.center.z]}
          rotation={[0, s.rotY, 0]}
          renderOrder={-1}
        >
          <boxGeometry args={[s.size.x, s.size.y, s.size.z]} />
          <meshStandardMaterial
            color={COLOR[s.kind]}
            transparent
            opacity={s.kind === "baseboard" ? 0.85 : 0.16}
            side={2}
          />
        </mesh>
      ))}
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
      <RunnerMeshes project={project} />
      <RefBoxes project={project} />
      <OrbitControls makeDefault target={[0, project.room.ceilingHeight / 3, 0]} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </Canvas>
  );
}
