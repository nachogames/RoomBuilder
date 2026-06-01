import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport, TransformControls } from "@react-three/drei";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadViewState, saveViewState } from "../ui/viewState";
import type { Carcass, Person, Project, RefBox, Runner } from "../domain/types";
import { PERSON_SEAT_HEIGHT, personFootprint, personTopY } from "../domain/person";
import { buildCarcass } from "../geometry/carcass";
import { buildRunner } from "../geometry/runner";
import { surfaceUnderPoint } from "../geometry/stacking";
import { frustumGeometry } from "./frustum";
import { prismGeometry } from "./prism";
import { wallFacesCamera, viewIsShallow } from "./dollhouse";
import type { MovableKind } from "./placement";

const _dir = new THREE.Vector3();
import { roomReferenceSlabs, type RefSlab } from "../domain/room";
import type { Part, PartRole } from "../geometry/types";

/** Ref registry so MoveGizmo can attach to whichever group is selected.
 *  Each movable group registers/unregisters itself by id. */
type RefRegistry = {
  register: (id: string, obj: THREE.Object3D | null) => void;
  get: (id: string) => THREE.Object3D | null;
};
const RefRegistryCtx = createContext<RefRegistry | null>(null);

/** Selection context — what's selected, how to select, how to patch on drop. */
export interface PatchEntityArg {
  /** desired baseHeight (Y); undefined for people or when only XZ moved */
  y?: number;
  x: number;
  z: number;
}
export interface SubSel {
  kind: "shelf";
  carcassId: string;
  idx: number;
}
interface SelectionCtxValue {
  sel: string;
  extras: ReadonlySet<string>;
  subSel: SubSel | null;
  onSelect: (id: string, opts?: { toggle?: boolean }) => void;
  onSelectShelf: (carcassId: string, idx: number) => void;
}
const SelectionCtx = createContext<SelectionCtxValue>({
  sel: "",
  extras: new Set(),
  subSel: null,
  onSelect: () => {},
  onSelectShelf: () => {},
});

function useRegisterGroupRef(id: string, obj: THREE.Object3D | null) {
  const reg = useContext(RefRegistryCtx);
  useEffect(() => {
    if (!reg) return;
    reg.register(id, obj);
    return () => reg.register(id, null);
  }, [reg, id, obj]);
}

/** Module-level flag flipped while the move gizmo is being dragged. R3F's
 *  scene-level event system delivers pointerdowns to whatever mesh is behind
 *  the gizmo arrow, so without this guard, grabbing a gizmo handle that sits
 *  over a different item would steal selection mid-drag. */
const gizmoBusy = { current: false };

/** True if this id is the active selection or part of the multi-selection. */
function isSelected(
  id: string,
  sel: string,
  extras: ReadonlySet<string>,
): boolean {
  return sel === id || extras.has(id);
}

/** Click handler factory: select this id on pointerdown and stop the event so
 *  it doesn't also fire the deselect plane behind us. Skips when the gizmo
 *  is mid-drag. Cmd/Ctrl-click toggles into a multi-selection. */
function selectHandler(
  id: string,
  onSelect: (id: string, opts?: { toggle?: boolean }) => void,
) {
  return (e: ThreeEvent<PointerEvent>) => {
    if (gizmoBusy.current) return;
    e.stopPropagation();
    const native = e.nativeEvent as PointerEvent | undefined;
    const toggle = !!(native && (native.metaKey || native.ctrlKey));
    onSelect(id, { toggle });
  };
}

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

function PartMesh({
  part,
  onPointerDown,
}: {
  part: Part;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}) {
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
    <mesh
      position={[part.center.x, part.center.y, part.center.z]}
      castShadow
      onPointerDown={onPointerDown}
    >
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
  const { sel, extras, onSelect, onSelectShelf } = useContext(SelectionCtx);
  const ref = useRef<THREE.Group>(null);
  useRegisterGroupRef(carcass.id, ref.current);
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
  // Index shelf parts in the order they appear (matches `carcass.shelves` order).
  let shelfCount = 0;
  return (
    <group
      ref={ref}
      position={[px, py, pz]}
      rotation={[0, (-carcass.rotationDeg * Math.PI) / 180, 0]}
      onPointerDown={selectHandler(carcass.id, onSelect)}
    >
      {parts.map((p) => {
        if (p.role === "shelf") {
          const idx = shelfCount++;
          return (
            <PartMesh
              key={p.id}
              part={p}
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                if (gizmoBusy.current) return;
                e.stopPropagation();
                onSelectShelf(carcass.id, idx);
              }}
            />
          );
        }
        return <PartMesh key={p.id} part={p} />;
      })}
      {isSelected(carcass.id, sel, extras) && <SelectionOutline />}
    </group>
  );
}

function RunnerGroup({ r, parts }: { r: Runner; parts: Part[] }) {
  const { sel, extras, onSelect } = useContext(SelectionCtx);
  const ref = useRef<THREE.Group>(null);
  useRegisterGroupRef(r.id, ref.current);
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
      ref={ref}
      position={[px, py, pz]}
      rotation={[0, (-r.rotationDeg * Math.PI) / 180, 0]}
      onPointerDown={selectHandler(r.id, onSelect)}
    >
      {parts.map((p) => (
        <PartMesh key={p.id} part={p} />
      ))}
      {isSelected(r.id, sel, extras) && <SelectionOutline />}
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
      {groups.map(({ r, parts }) => (
        <RunnerGroup key={r.id} r={r} parts={parts} />
      ))}
    </>
  );
}

function ToteMesh({ b }: { b: RefBox }) {
  const tapered = b.topWidth != null && b.topDepth != null;
  const { sel, extras, onSelect } = useContext(SelectionCtx);
  const ref = useRef<THREE.Group>(null);
  useRegisterGroupRef(b.id, ref.current);
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

  // Group at the tote's bottom-center; mesh offset up by height/2 keeps the
  // existing render appearance unchanged. Gizmo binds to the group, so its
  // origin sits at the tote's footprint center, which matches the entity's
  // (position.x, baseHeight, position.z) and round-trips cleanly.
  const gx = b.position.x;
  const gy = b.baseHeight ?? 0;
  const gz = b.position.z;
  if (
    !allFinite(gx, gy, gz, b.width, b.height, b.depth, b.rotationDeg) ||
    (tapered &&
      !allFinite(b.topWidth as number, b.topDepth as number))
  ) {
    console.warn("Skipping tote with non-finite dims/position", b);
    return null;
  }
  return (
    <group
      ref={ref}
      position={[gx, gy, gz]}
      rotation={[0, (-b.rotationDeg * Math.PI) / 180, 0]}
      onPointerDown={selectHandler(b.id, onSelect)}
    >
      <mesh
        position={[0, b.height / 2, 0]}
        geometry={geom ?? undefined}
      >
        {!tapered && <boxGeometry args={[b.width, b.height, b.depth]} />}
        <meshStandardMaterial
          color="#5fa8d3"
          side={THREE.DoubleSide}
        />
      </mesh>
      {isSelected(b.id, sel, extras) && <SelectionOutline />}
    </group>
  );
}

/** Boxy person: torso block above the seat (sitting) or full standing body,
 *  plus a forward-extending thigh/leg block when sitting. */
function PersonMesh({ p }: { p: Person }) {
  const fp = personFootprint(p);
  const color = "#8aa0a8";
  const opacity = 0.55;
  const base = p.baseHeight ?? 0;
  const rotY = (-p.rotationDeg * Math.PI) / 180;
  const { sel, extras, onSelect } = useContext(SelectionCtx);
  const ref = useRef<THREE.Group>(null);
  useRegisterGroupRef(p.id, ref.current);
  if (
    !allFinite(p.position.x, p.position.z, base, p.height, fp.width, fp.depth)
  ) {
    console.warn("Skipping person with non-finite dims/position", p);
    return null;
  }
  const click = selectHandler(p.id, onSelect);
  if (p.pose === "sitting") {
    const seat = PERSON_SEAT_HEIGHT;
    const headTop = personTopY(p) - PERSON_SEAT_HEIGHT;
    const torsoD = 10;
    const torsoOffsetZ = -(fp.depth / 2 - torsoD / 2);
    return (
      <group
        ref={ref}
        position={[p.position.x, base, p.position.z]}
        rotation={[0, rotY, 0]}
        onPointerDown={click}
      >
        <mesh position={[0, seat + headTop / 2, torsoOffsetZ]}>
          <boxGeometry args={[fp.width, headTop, torsoD]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} />
        </mesh>
        <mesh
          position={[0, seat - 4 / 2, (fp.depth - torsoD) / 2 - torsoD / 2]}
        >
          <boxGeometry args={[fp.width - 4, 4, fp.depth - torsoD]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} />
        </mesh>
        {isSelected(p.id, sel, extras) && <SelectionOutline />}
      </group>
    );
  }
  return (
    <group
      ref={ref}
      position={[p.position.x, base, p.position.z]}
      rotation={[0, rotY, 0]}
      onPointerDown={click}
    >
      <mesh position={[0, p.height / 2, 0]}>
        <boxGeometry args={[fp.width, p.height, fp.depth]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      {isSelected(p.id, sel, extras) && <SelectionOutline />}
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

/** Thin yellow box drawn around the selected group's bounding box. Uses a
 *  Three BoxHelper applied to the parent group on mount — no need for the
 *  parent to pass in known dimensions. */
function SelectionOutline() {
  const ref = useRef<THREE.LineSegments>(null);
  const box = useMemo(() => new THREE.Box3(), []);
  useFrame(() => {
    const line = ref.current;
    if (!line || !line.parent) return;
    const parent = line.parent;
    box.setFromObject(parent);
    if (box.isEmpty()) {
      line.visible = false;
      return;
    }
    line.visible = true;
    // Build edges in parent-local space: subtract parent world translation,
    // then re-rotate into local. Easier: use BoxHelper-style line on a fresh
    // BufferGeometry sized to the local-frame bbox computed by clearing the
    // parent's matrix during the measure. Simpler still: measure in world,
    // place the line at world center with no rotation, by detaching it from
    // the parent transform via attach. Keep it simple: take the world bbox
    // and render a flat box at world coords by re-parenting visually.
    const sz = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(sz);
    box.getCenter(center);
    // Convert center to parent-local position
    const local = parent.worldToLocal(center.clone());
    line.position.copy(local);
    // Cancel out parent rotation so the box stays axis-aligned in world
    const q = new THREE.Quaternion();
    parent.getWorldQuaternion(q);
    line.quaternion.copy(q.invert());
    line.scale.set(sz.x, sz.y, sz.z);
  });
  const geom = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    [],
  );
  return (
    // eslint-disable-next-line react/no-unknown-property
    <lineSegments ref={ref} geometry={geom} renderOrder={999}>
      <lineBasicMaterial color="#ffd166" depthTest={false} transparent opacity={0.95} />
    </lineSegments>
  );
}

/** Invisible floor plane that catches pointer-downs in empty space and
 *  deselects. Sized far larger than the room so it always covers the camera
 *  frustum at ground level. */
function DeselectPlane({ span, onSelect }: { span: number; onSelect: (id: string) => void }) {
  const size = Math.max(span * 4, 1000);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      onPointerDown={(e) => {
        if (gizmoBusy.current) return;
        e.stopPropagation();
        onSelect("");
      }}
      renderOrder={-10}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

/** Translate-mode gizmo bound to whichever group matches `sel`. Disables
 *  OrbitControls while dragging. On release, reads the group's local position
 *  and dispatches a patch through `onPatchEntity`. */
/** Reads the latest entity position from the current project. Used so the
 *  drag proxy can re-sync when an external change happens (or the drag ends)
 *  without coupling the gizmo to React state updates mid-drag. */
function entityPos(
  project: Project,
  kind: MovableKind,
  id: string,
): { x: number; y: number; z: number } | null {
  if (kind === "carcass") {
    const c = project.carcasses.find((k) => k.id === id);
    return c ? { x: c.position.x, y: c.baseHeight ?? 0, z: c.position.z } : null;
  }
  if (kind === "runner") {
    const r = project.runners.find((k) => k.id === id);
    return r ? { x: r.position.x, y: r.baseHeight ?? 0, z: r.position.z } : null;
  }
  if (kind === "refBox") {
    const b = project.refBoxes.find((k) => k.id === id);
    return b ? { x: b.position.x, y: b.baseHeight ?? 0, z: b.position.z } : null;
  }
  const p = project.people.find((k) => k.id === id);
  return p ? { x: p.position.x, y: p.baseHeight ?? 0, z: p.position.z } : null;
}

/** World-space Y of a shelf's top surface, derived from the project tree. */
function shelfWorldY(
  project: Project,
  carcassId: string,
  shelfIdx: number,
): { x: number; y: number; z: number } | null {
  const c = project.carcasses.find((x) => x.id === carcassId);
  if (!c) return null;
  const sh = c.shelves[shelfIdx];
  if (!sh) return null;
  // Use the same datum chain as carcass build: interiorFloor = baseHeight +
  // toeKick + carcass thickness; shelf top = interiorFloor + offset + shelfT.
  // Look up thicknesses through the catalog.
  const carcassMat = project.catalog.materials.find((m) => m.id === c.carcassMaterialId);
  const shelfMat = project.catalog.materials.find((m) => m.id === c.shelfMaterialId);
  if (!carcassMat || !shelfMat) return null;
  const interiorFloor = (c.baseHeight ?? 0) + c.toeKickHeight + carcassMat.thickness;
  const y = interiorFloor + sh.offsetFromBottom + shelfMat.thickness;
  return { x: c.position.x, y, z: c.position.z };
}

function MoveGizmo({
  project,
  sel,
  subSel,
  kind,
  onPatchEntity,
  onPatchShelf,
  onCommitHistory,
  onEndInteraction,
}: {
  project: Project;
  sel: string;
  subSel: SubSel | null;
  kind: MovableKind | null;
  onPatchEntity: (id: string, kind: MovableKind, patch: PatchEntityArg) => void;
  onPatchShelf: (carcassId: string, idx: number, newOffsetFromBottom: number) => void;
  onCommitHistory: () => void;
  onEndInteraction: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbit = useThree((s) => s.controls) as any;
  const gl = useThree((s) => s.gl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tcRef = useRef<any>(null);
  const draggingRef = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const subSelRef = useRef(subSel);
  subSelRef.current = subSel;
  const kindRef = useRef<MovableKind | null>(kind);
  kindRef.current = kind;
  const selRef = useRef(sel);
  selRef.current = sel;

  // Invisible proxy: gizmo writes here, we read it and route through the
  // resolver. The scene group's actual position is driven by project state.
  const proxy = useMemo(() => new THREE.Object3D(), []);

  // Pick the right "current position" source based on mode.
  const getCurrentTarget = useCallback((): { x: number; y: number; z: number } | null => {
    const sub = subSelRef.current;
    if (sub && sub.kind === "shelf") {
      return shelfWorldY(projectRef.current, sub.carcassId, sub.idx);
    }
    const k = kindRef.current;
    const id = selRef.current;
    if (!k || !id) return null;
    return entityPos(projectRef.current, k, id);
  }, []);

  // Re-sync the proxy when selection / project state changes outside a drag.
  useEffect(() => {
    if (draggingRef.current) return;
    const cur = getCurrentTarget();
    if (!cur) return;
    proxy.position.set(cur.x, cur.y, cur.z);
  }, [project, sel, subSel, kind, proxy, getCurrentTarget]);

  // Capture-phase listener: when user presses on a gizmo handle, suppress
  // SelectableGroup's onPointerDown so it doesn't steal selection.
  useEffect(() => {
    const dom = gl.domElement;
    const onDown = () => {
      const tc = tcRef.current;
      if (tc && tc.axis) gizmoBusy.current = true;
    };
    const onUp = () => {
      setTimeout(() => { gizmoBusy.current = false; }, 0);
    };
    dom.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    return () => {
      dom.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
    };
  }, [gl]);

  const isShelf = subSel?.kind === "shelf";
  const visible = isShelf || (!!sel && !!kind);
  if (!visible) return null;

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={tcRef as any}
        object={proxy}
        mode="translate"
        size={0.75}
        // No translationSnap: 1\" snapping in 3D meant the carcass could
        // land 0.125-1\" short of a wall depending on where the drag
        // started (the wall clamp can't pull a snapped position to an
        // arbitrary fractional one). Free drag matches Plan view.
        // Shelf: Y-only. Person: hide Y. Otherwise: all axes.
        showX={!isShelf && kind !== null}
        showY={isShelf || (kind !== null && kind !== "person")}
        showZ={!isShelf && kind !== null}
        onMouseDown={() => {
          draggingRef.current = true;
          gizmoBusy.current = true;
          if (orbit) orbit.enabled = false;
          const cur = getCurrentTarget();
          if (cur) proxy.position.set(cur.x, cur.y, cur.z);
          onCommitHistory();
        }}
        onObjectChange={() => {
          if (!draggingRef.current) return;
          const sub = subSelRef.current;
          const p = proxy.position;
          if (sub && sub.kind === "shelf") {
            // Convert the proxy's world Y back to an offsetFromBottom.
            const c = projectRef.current.carcasses.find((x) => x.id === sub.carcassId);
            if (!c) return;
            const carcassMat = projectRef.current.catalog.materials.find((m) => m.id === c.carcassMaterialId);
            const shelfMat = projectRef.current.catalog.materials.find((m) => m.id === c.shelfMaterialId);
            if (!carcassMat || !shelfMat) return;
            const interiorFloor = (c.baseHeight ?? 0) + c.toeKickHeight + carcassMat.thickness;
            const newOffset = p.y - interiorFloor - shelfMat.thickness;
            onPatchShelf(sub.carcassId, sub.idx, newOffset);
            return;
          }
          const k = kindRef.current;
          const id = selRef.current;
          if (!k || !id) return;
          onPatchEntity(id, k, {
            x: p.x,
            z: p.z,
            y: k === "person" ? undefined : p.y,
          });
        }}
        onMouseUp={() => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          if (orbit) orbit.enabled = true;
          const cur = getCurrentTarget();
          if (cur) proxy.position.set(cur.x, cur.y, cur.z);
          onEndInteraction();
        }}
      />
    </>
  );
}

const NUDGE_DEFAULT = 1;
const NUDGE_FINE = 0.125;
const NUDGE_COARSE = 6;

/** Window keydown handler: arrows nudge the selected entity. Skips if a text
 *  input has focus so typing dimensions in the inspector isn't intercepted. */
function KeyboardNudge({
  sel,
  kind,
  resolve,
  onPatchEntity,
  onSelect,
}: {
  sel: string;
  kind: MovableKind | null;
  resolve: (id: string, kind: MovableKind) => { x: number; z: number; y: number } | null;
  onPatchEntity: (id: string, kind: MovableKind, patch: PatchEntityArg) => void;
  onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (!sel || !kind) return;
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae) {
        const tag = ae.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable) return;
      }
      if (e.key === "Escape") {
        onSelect("");
        e.preventDefault();
        return;
      }
      const isArrow =
        e.key === "ArrowLeft" || e.key === "ArrowRight" ||
        e.key === "ArrowUp" || e.key === "ArrowDown";
      if (!isArrow) return;
      const step = e.altKey
        ? (e.shiftKey ? NUDGE_COARSE : NUDGE_FINE)
        : (e.shiftKey ? NUDGE_COARSE : NUDGE_DEFAULT);
      const cur = resolve(sel, kind);
      if (!cur) return;
      let { x, y, z } = cur;
      const verticalY = e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown");
      if (verticalY && kind !== "person") {
        if (e.key === "ArrowUp") y += step;
        else y -= step;
      } else if (e.key === "ArrowLeft") x -= step;
      else if (e.key === "ArrowRight") x += step;
      else if (e.key === "ArrowUp") z -= step;
      else if (e.key === "ArrowDown") z += step;
      onPatchEntity(sel, kind, { x, z, y: kind === "person" ? undefined : y });
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, kind, resolve, onPatchEntity, onSelect]);
  return null;
}

export function Scene({
  project,
  dollhouse = true,
  sel = "",
  extras = new Set<string>(),
  subSel = null,
  onSelect = () => {},
  onSelectShelf = () => {},
  onPatchEntity = () => {},
  onPatchShelf = () => {},
  onCommitHistory = () => {},
  onEndInteraction = () => {},
}: {
  project: Project;
  dollhouse?: boolean;
  sel?: string;
  /** Additional items in a multi-selection. Same outline as `sel`. */
  extras?: ReadonlySet<string>;
  /** Sub-selection inside the selected carcass (e.g. a specific shelf). */
  subSel?: SubSel | null;
  onSelect?: (id: string, opts?: { toggle?: boolean }) => void;
  /** Sets sel to carcassId and subSel to { shelf, idx }. */
  onSelectShelf?: (carcassId: string, idx: number) => void;
  onPatchEntity?: (id: string, kind: MovableKind, patch: PatchEntityArg) => void;
  /** Patch a shelf's offsetFromBottom (stack-follow runs in the resolver). */
  onPatchShelf?: (carcassId: string, idx: number, newOffsetFromBottom: number) => void;
  /** Called once at the start of a gizmo drag so subsequent per-frame
   *  patches coalesce into a single history entry. */
  onCommitHistory?: () => void;
  /** Called on drag release so a brand-new edit after the drag becomes its
   *  own history entry instead of merging in. */
  onEndInteraction?: () => void;
}) {
  const span = Math.max(
    project.room.length,
    project.room.width,
    project.room.ceilingHeight,
  );

  // Ref registry: each movable group registers its <group> by id so the
  // gizmo can attach to whichever id matches `sel`. We use a state Map so
  // that registration changes trigger a re-render and the gizmo binds as
  // soon as the group mounts.
  const [refMap, setRefMap] = useState<Map<string, THREE.Object3D>>(new Map());
  const registry = useMemo<RefRegistry>(
    () => ({
      register: (id, obj) => {
        setRefMap((prev) => {
          const next = new Map(prev);
          if (obj) next.set(id, obj);
          else next.delete(id);
          return next;
        });
      },
      get: (id) => refMap.get(id) ?? null,
    }),
    [refMap],
  );

  const kind: MovableKind | null = useMemo(() => {
    if (!sel) return null;
    if (project.carcasses.some((c) => c.id === sel)) return "carcass";
    if (project.runners.some((r) => r.id === sel)) return "runner";
    if (project.refBoxes.some((b) => b.id === sel)) return "refBox";
    if (project.people.some((p) => p.id === sel)) return "person";
    return null;
  }, [sel, project.carcasses, project.runners, project.refBoxes, project.people]);

  const resolveCurrent = useCallback(
    (id: string, k: MovableKind) => {
      if (k === "carcass") {
        const c = project.carcasses.find((x) => x.id === id);
        return c ? { x: c.position.x, z: c.position.z, y: c.baseHeight ?? 0 } : null;
      }
      if (k === "runner") {
        const r = project.runners.find((x) => x.id === id);
        return r ? { x: r.position.x, z: r.position.z, y: r.baseHeight ?? 0 } : null;
      }
      if (k === "refBox") {
        const b = project.refBoxes.find((x) => x.id === id);
        return b ? { x: b.position.x, z: b.position.z, y: b.baseHeight ?? 0 } : null;
      }
      const p = project.people.find((x) => x.id === id);
      return p ? { x: p.position.x, z: p.position.z, y: p.baseHeight ?? 0 } : null;
    },
    [project.carcasses, project.runners, project.refBoxes, project.people],
  );

  const selectionCtx = useMemo(
    () => ({ sel, extras, subSel, onSelect, onSelectShelf }),
    [sel, extras, subSel, onSelect, onSelectShelf],
  );

  return (
    <Canvas
      shadows
      camera={{ position: [span * 0.9, span * 0.8, span * 1.1], fov: 45 }}
      style={{ background: "#1b1b1f" }}
    >
      <RefRegistryCtx.Provider value={registry}>
        <SelectionCtx.Provider value={selectionCtx}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[100, 200, 120]} intensity={1.1} castShadow />
          <RoomShell project={project} dollhouse={dollhouse} />
          {project.carcasses.map((c) => (
            <CarcassGroup key={c.id} carcass={c} project={project} />
          ))}
          <RunnerMeshes project={project} />
          <RefBoxes project={project} />
          <People project={project} />
          <DeselectPlane span={span} onSelect={onSelect} />
          <MoveGizmo
            project={project}
            sel={sel}
            subSel={subSel}
            kind={kind}
            onPatchEntity={onPatchEntity}
            onPatchShelf={onPatchShelf}
            onCommitHistory={onCommitHistory}
            onEndInteraction={onEndInteraction}
          />
          <KeyboardNudge
            sel={sel}
            kind={kind}
            resolve={resolveCurrent}
            onPatchEntity={onPatchEntity}
            onSelect={onSelect}
          />
          <OrbitControls makeDefault target={[0, project.room.ceilingHeight / 3, 0]} />
          <CameraPersistence />
          <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
            <GizmoViewport labelColor="white" axisHeadScale={1} />
          </GizmoHelper>
        </SelectionCtx.Provider>
      </RefRegistryCtx.Provider>
    </Canvas>
  );
}
