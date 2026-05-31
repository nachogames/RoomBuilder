import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { loadViewState, saveViewState } from "../ui/viewState";
import type { Carcass, Person, Project, RefBox } from "../domain/types";
import { PERSON_SEAT_HEIGHT, personFootprint, personTopY } from "../domain/person";
import { buildCarcass } from "../geometry/carcass";
import { buildRunner } from "../geometry/runner";
import { surfaceUnderPoint } from "../geometry/stacking";
import { frustumGeometry } from "./frustum";
import { prismGeometry } from "./prism";
import { wallFacesCamera, viewIsShallow } from "./dollhouse";

const _dir = new THREE.Vector3();
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

/** True iff every value is a finite number. Used to skip any mesh whose geometry
 *  or position would feed NaN/Infinity into Three.js (a single bad part would
 *  otherwise spam computeBoundingSphere warnings every frame). */
function allFinite(...vs: number[]): boolean {
  for (const v of vs) if (!Number.isFinite(v)) return false;
  return true;
}

function PartMesh({ part }: { part: Part }) {
  if (
    !allFinite(
      part.box.x,
      part.box.y,
      part.box.z,
      part.center.x,
      part.center.y,
      part.center.z,
    )
  ) {
    // eslint-disable-next-line no-console
    console.warn("Skipping part with non-finite geometry", {
      id: part.id,
      label: part.label,
      role: part.role,
      box: part.box,
      center: part.center,
    });
    return null;
  }
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
  const px = carcass.position.x;
  const py = carcass.baseHeight ?? 0;
  const pz = carcass.position.z;
  if (!allFinite(px, py, pz, carcass.rotationDeg)) {
    console.warn("Skipping carcass with non-finite transform", {
      id: carcass.id,
      label: carcass.label,
      position: carcass.position,
      baseHeight: carcass.baseHeight,
      rotationDeg: carcass.rotationDeg,
    });
    return null;
  }
  return (
    <group
      position={[px, py, pz]}
      // negate so 3D matches the Plan view: positive rotationDeg appears as a
      // clockwise turn (top-down), with the open front ending where Plan
      // shows it after the same rotation.
      rotation={[0, (-carcass.rotationDeg * Math.PI) / 180, 0]}
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
        parts: buildRunner(r, project.carcasses, project.catalog, {
          surfaceUnder: (x, z, maxY) =>
            surfaceUnderPoint(x, z, maxY, project, r.id),
        }).parts,
      })),
    [project],
  );
  return (
    <>
      {groups.map(({ r, parts }) => {
        const px = r.position.x;
        const py = r.baseHeight ?? 0;
        const pz = r.position.z;
        if (!allFinite(px, py, pz, r.rotationDeg)) {
          console.warn("Skipping runner with non-finite transform", {
            id: r.id,
            label: r.label,
            position: r.position,
            baseHeight: r.baseHeight,
            rotationDeg: r.rotationDeg,
          });
          return null;
        }
        return (
          <group
            key={r.id}
            position={[px, py, pz]}
            rotation={[0, (-r.rotationDeg * Math.PI) / 180, 0]}
          >
            {parts.map((p) => (
              <PartMesh key={p.id} part={p} />
            ))}
          </group>
        );
      })}
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

  const px = b.position.x;
  const py = (b.baseHeight ?? 0) + b.height / 2;
  const pz = b.position.z;
  if (
    !allFinite(px, py, pz, b.width, b.height, b.depth, b.rotationDeg) ||
    (tapered &&
      !allFinite(b.topWidth as number, b.topDepth as number))
  ) {
    console.warn("Skipping tote with non-finite dims/position", b);
    return null;
  }
  return (
    <mesh
      position={[px, py, pz]}
      rotation={[0, (-b.rotationDeg * Math.PI) / 180, 0]}
      geometry={geom ?? undefined}
    >
      {!tapered && <boxGeometry args={[b.width, b.height, b.depth]} />}
      <meshStandardMaterial
        color="#5fa8d3"
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Boxy person: torso block above the seat (sitting) or full standing body,
 *  plus a forward-extending thigh/leg block when sitting. */
function PersonMesh({ p }: { p: Person }) {
  const fp = personFootprint(p);
  const color = "#8aa0a8";
  const opacity = 0.55;
  const base = p.baseHeight ?? 0;
  // negate rotation so 3D matches Plan (see PlanView/SVG rotate convention)
  const rotY = (-p.rotationDeg * Math.PI) / 180;
  if (
    !allFinite(p.position.x, p.position.z, base, p.height, fp.width, fp.depth)
  ) {
    console.warn("Skipping person with non-finite dims/position", p);
    return null;
  }
  if (p.pose === "sitting") {
    const seat = PERSON_SEAT_HEIGHT;
    const headTop = personTopY(p) - PERSON_SEAT_HEIGHT; // height of torso above seat
    // torso: a slimmer block at the back of the footprint (depth = body, ~10")
    const torsoD = 10;
    const torsoOffsetZ = -(fp.depth / 2 - torsoD / 2); // sit at the BACK of the footprint
    return (
      <group
        position={[p.position.x, base, p.position.z]}
        rotation={[0, rotY, 0]}
      >
        <mesh position={[0, seat + headTop / 2, torsoOffsetZ]}>
          <boxGeometry args={[fp.width, headTop, torsoD]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} />
        </mesh>
        {/* thighs/lap from torso forward to the front of the footprint */}
        <mesh
          position={[0, seat - 4 / 2, (fp.depth - torsoD) / 2 - torsoD / 2]}
        >
          <boxGeometry args={[fp.width - 4, 4, fp.depth - torsoD]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} />
        </mesh>
      </group>
    );
  }
  // standing: a single block running the full height
  return (
    <group
      position={[p.position.x, base, p.position.z]}
      rotation={[0, rotY, 0]}
    >
      <mesh position={[0, p.height / 2, 0]}>
        <boxGeometry args={[fp.width, p.height, fp.depth]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function People({ project }: { project: Project }) {
  return (
    <>
      {project.people.map((p) => (
        <PersonMesh key={p.id} p={p} />
      ))}
    </>
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
  wall: "#e8e8ec",
  baseboard: "#6a6a72",
} as const;

function SlabMesh({ s, dollhouse }: { s: RefSlab; dollhouse: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const geom = useMemo(() => {
    if (!s.footprint || s.height == null) return null;
    const { positions, indices } = prismGeometry(s.footprint, s.height);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [s.footprint, s.height]);

  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    if (!dollhouse || !s.normal) {
      m.visible = true;
      return;
    }
    camera.getWorldDirection(_dir);
    // only cull when looking roughly level; from above, keep all walls up
    m.visible =
      !viewIsShallow(_dir.y) ||
      !wallFacesCamera(
        s.normal,
        { x: s.center.x, z: s.center.z },
        { x: camera.position.x, z: camera.position.z },
      );
  });

  // prism (wall + baseboard): geometry is in absolute world coords
  if (geom) {
    return (
      <mesh ref={ref} geometry={geom} renderOrder={-1}>
        <meshStandardMaterial
          color={SLAB_COLOR[s.kind]}
          transparent={s.kind === "baseboard"}
          opacity={s.kind === "baseboard" ? 0.85 : 1}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  // box (baseboard)
  return (
    <mesh
      ref={ref}
      position={[s.center.x, s.center.y, s.center.z]}
      rotation={[0, s.rotY ?? 0, 0]}
      renderOrder={-1}
    >
      <boxGeometry args={[s.size?.x ?? 0, s.size?.y ?? 0, s.size?.z ?? 0]} />
      <meshStandardMaterial
        color={SLAB_COLOR[s.kind]}
        transparent={s.kind === "baseboard"}
        opacity={s.kind === "baseboard" ? 0.85 : 1}
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

/** Restores the saved camera on mount and saves it after each interaction. */
function CameraPersistence() {
  const camera = useThree((s) => s.camera);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useThree((s) => s.controls) as any;
  useEffect(() => {
    if (!controls) return;
    const v = loadViewState().cam;
    if (v?.pos && v?.target) {
      camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
      controls.target.set(v.target[0], v.target[1], v.target[2]);
      controls.update();
    }
    const save = () =>
      saveViewState({
        cam: {
          pos: camera.position.toArray(),
          target: controls.target.toArray(),
        },
      });
    controls.addEventListener("end", save);
    return () => controls.removeEventListener("end", save);
  }, [controls, camera]);
  return null;
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
      <People project={project} />
      <OrbitControls makeDefault target={[0, project.room.ceilingHeight / 3, 0]} />
      <CameraPersistence />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </Canvas>
  );
}
