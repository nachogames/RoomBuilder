import { useMemo } from "react";
import * as THREE from "three";
import type { PocketHoleMark } from "../geometry/pocketHoles";

const COLOR = "#1a1410";

/** Visualises one Kreg pocket hole as a flat dark entrance ellipse plus a
 *  short angled cylinder going into the wood. Not subtractive — the part's
 *  box geometry is unchanged underneath. Polygon offset keeps the entrance
 *  from z-fighting with the host face.
 *
 *  Orientation is driven directly by the precomputed `normal`, `longAxis`,
 *  and `drillAxis` vectors on the mark — no quaternion algebra needed
 *  here, the geometry module has already done the work. */
export function PocketHoleMesh({ mark }: { mark: PocketHoleMark }) {
  const { entranceQuat, cylinderQuat } = useMemo(() => {
    const n = new THREE.Vector3(mark.normal.x, mark.normal.y, mark.normal.z).normalize();
    const long = new THREE.Vector3(mark.longAxis.x, mark.longAxis.y, mark.longAxis.z).normalize();
    const drill = new THREE.Vector3(mark.drillAxis.x, mark.drillAxis.y, mark.drillAxis.z).normalize();

    // Entrance: circleGeometry lies in its own XY plane with normal +Z.
    // After scale [sx, sy, 1], local +X is the short axis and local +Y is
    // the long axis. We want:
    //   local +Z → mark.normal (so the ellipse sits on the face)
    //   local +Y → mark.longAxis (long axis runs along the edge)
    //   local +X → perpendicular in-face axis = normal × longAxis
    const right = new THREE.Vector3().crossVectors(long, n).normalize();
    const m = new THREE.Matrix4().makeBasis(right, long, n);
    const entranceQuat = new THREE.Quaternion().setFromRotationMatrix(m);

    // Cylinder: local +Y is the cylinder axis. Map +Y → drillAxis.
    const cylinderQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      drill,
    );
    return { entranceQuat, cylinderQuat };
  }, [
    mark.normal.x, mark.normal.y, mark.normal.z,
    mark.longAxis.x, mark.longAxis.y, mark.longAxis.z,
    mark.drillAxis.x, mark.drillAxis.y, mark.drillAxis.z,
  ]);

  const entranceSx = mark.entranceShort / 2;
  const entranceSy = mark.entranceLong / 2;

  // Position the cylinder so its top cap (local +Y end) sits AT the
  // entrance, and the body extends inward by `depth` along drillAxis.
  // cylinderGeometry is centered on origin, so we need to push it
  // forward (along its own +Y axis, which we've rotated to drillAxis)
  // by depth/2 so the top cap meets the entrance plane.
  const cylCenter = {
    x: mark.center.x + mark.drillAxis.x * (mark.depth / 2),
    y: mark.center.y + mark.drillAxis.y * (mark.depth / 2),
    z: mark.center.z + mark.drillAxis.z * (mark.depth / 2),
  };

  return (
    <group>
      <mesh
        position={[mark.center.x, mark.center.y, mark.center.z]}
        quaternion={entranceQuat}
        scale={[entranceSx, entranceSy, 1]}
      >
        <circleGeometry args={[1, 24]} />
        <meshStandardMaterial
          color={COLOR}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh
        position={[cylCenter.x, cylCenter.y, cylCenter.z]}
        quaternion={cylinderQuat}
      >
        <cylinderGeometry
          args={[entranceSx * 0.85, entranceSx * 0.85, mark.depth, 16]}
        />
        <meshStandardMaterial
          color={COLOR}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  );
}
