import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Carcass, Project, RefBox } from "../domain/types";
import { buildCarcass } from "../geometry/carcass";
import { buildRunner } from "../geometry/runner";
import { frustumGeometry } from "./frustum";
import { wallFacesCamera } from "./dollhouse";
import { roomReferenceSlabs, type RefSlab } from "../domain/room";
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
      position={[carcass.position.x, carcass.baseHeight ?? 0, carcass.position.z]}
      rotation={[0, (carcass.rotationDeg * Math.PI) / 180, 0]}
    >
      {parts.map((p) => (
        <PartMesh key={p.id} part={p} />
      ))}
    </group>
  );
}

function RunnerMeshes({ project }: { project: Project }) {
  const groups = useMemo(
    () =>
      project.runners.map((r) => ({
        r,
        parts: buildRunner(r, project.carcasses, project.catalog).parts,
      })),
    [project],
  );
  return (
    <>
      {groups.map(({ r, parts }) => (
        <group
          key={r.id}
          position={[r.position.x, r.baseHeight ?? 0, r.position.z]}
          rotation={[0, (r.rotationDeg * Math.PI) / 180, 0]}
        >
          {parts.map((p) => (
            <PartMesh key={p.id} part={p} />
          ))}
        </group>
      ))}
    </>
  );
}

function ToteMesh({ b }: { b: RefBox }) {
  const tapered = b.topWidth != null && b.topDepth != null;
  const geom = useMemo(() => {
    if (!tapered) return null;
    const { positions, indices } = frustumGeometry(
      b.width,
      b.depth,
      b.topWidth as number,
      b.topDepth as number,
      b.height,
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [tapered, b.width, b.depth, b.topWidth, b.topDepth, b.height]);

  return (
    <mesh
      position={[
        b.position.x,
        (b.baseHeight ?? 0) + b.height / 2,
        b.position.z,
      ]}
      rotation={[0, (b.rotationDeg * Math.PI) / 180, 0]}
      geometry={geom ?? undefined}
    >
      {!tapered && <boxGeometry args={[b.width, b.height, b.depth]} />}
      <meshStandardMaterial
        color="#5fa8d3"
        transparent
        opacity={0.45}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function RefBoxes({ project }: { project: Project }) {
  return (
    <>
      {project.refBoxes.map((b) => (
        <ToteMesh key={b.id} b={b} />
      ))}
    </>
  );
}

const SLAB_COLOR = {
  wall: "#3a6ea5",
  baseboard: "#6a6a72",
} as const;

function SlabMesh({ s, dollhouse }: { s: RefSlab; dollhouse: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    m.visible =
      !dollhouse || !s.normal
        ? true
        : !wallFacesCamera(
            s.normal,
            { x: s.center.x, z: s.center.z },
            { x: camera.position.x, z: camera.position.z },
          );
  });
  return (
    <mesh
      ref={ref}
      position={[s.center.x, s.center.y, s.center.z]}
      rotation={[0, s.rotY, 0]}
      renderOrder={-1}
    >
      <boxGeometry args={[s.size.x, s.size.y, s.size.z]} />
      <meshStandardMaterial
        color={SLAB_COLOR[s.kind]}
        transparent
        opacity={s.kind === "baseboard" ? 0.85 : 0.16}
        side={2}
      />
    </mesh>
  );
}

function RoomShell({
  project,
  dollhouse,
}: {
  project: Project;
  dollhouse: boolean;
}) {
  const { length, width } = project.room;
  const slabs = useMemo(
    () => roomReferenceSlabs(project.room),
    [project.room],
  );
  return (
    <group>
      <gridHelper
        args={[Math.max(length, width) * 1.5, 24, "#444", "#2a2a2a"]}
      />
      {slabs.map((s) => (
        <SlabMesh key={s.id} s={s} dollhouse={dollhouse} />
      ))}
    </group>
  );
}

export function Scene({
  project,
  dollhouse = true,
}: {
  project: Project;
  dollhouse?: boolean;
}) {
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
      <RoomShell project={project} dollhouse={dollhouse} />
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
