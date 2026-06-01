import { useMemo } from "react";
import * as THREE from "three";
import type { PocketHoleMark } from "../geometry/pocketHoles";

const COLOR = "#1a1410";

/** Visualises one Kreg pocket hole as a flat dark entrance ellipse plus a
 *  short angled cylinder going into the wood. Not subtractive — the part's
 *  box geometry is unchanged underneath. Polygon offset keeps the entrance
 *  from z-fighting with the host face. */
export function PocketHoleMesh({ mark }: { mark: PocketHoleMark }) {
  // Orientation: build a rotation that maps +Z (the entrance circle's local
  // normal) to the mark's outward normal, and aligns the long axis of the
  // ellipse with the edge the holes run along.
  const { entranceQuat, cylinderQuat } = useMemo(() => {
    const n = new THREE.Vector3(mark.normal.x, mark.normal.y, mark.normal.z).normalize();

    // Long axis of the entrance ellipse: along whichever in-face axis the
    // holes spread on. For ±x normals that's z (long edge runs front-back);
    // for ±z normals that's x (long edge runs left-right). Convention: pick
    // the in-face axis with the largest magnitude when projected onto the
    // standard basis.
    const longAxis = new THREE.Vector3();
    if (Math.abs(n.x) > 0.5) longAxis.set(0, 0, 1);
    else longAxis.set(1, 0, 0);
    // Make sure it's perpendicular to n (it already is for axis-aligned n).
    longAxis.crossVectors(n, longAxis.clone().cross(n)).normalize();

    const up = longAxis.clone();
    const right = new THREE.Vector3().crossVectors(n, up).normalize();
    // CircleGeometry lies in the XY plane with normal +Z. Build a matrix
    // whose columns are (right, up, n).
    const m = new THREE.Matrix4().makeBasis(right, up, n);
    const entranceQuat = new THREE.Quaternion().setFromRotationMatrix(m);

    // Cylinder: its local +Y is the axis. We want the axis to point along
    // (-n) tilted by ANGLE toward the mate. Without a "which way is mate",
    // we just tilt around the long axis by mark.angleDeg toward the
    // part's interior; for purely axis-aligned marks the tilt is small
    // visually — what matters is the dark shape sitting on the face.
    const cylAxis = n.clone().multiplyScalar(-1);
    const tiltAxis = up.clone();
    const angleRad = (mark.angleDeg * Math.PI) / 180;
    cylAxis.applyAxisAngle(tiltAxis, angleRad).normalize();
    // Map +Y to cylAxis
    const cylinderQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      cylAxis,
    );
    return { entranceQuat, cylinderQuat };
  }, [mark.normal.x, mark.normal.y, mark.normal.z, mark.angleDeg]);

  const entranceSx = mark.entranceShort / 2;
  const entranceSy = mark.entranceLong / 2;

  // Cylinder positioned so its top cap sits AT the entrance, extending
  // inward by `depth/2` along its axis.
  const cylAxis = new THREE.Vector3(0, -1, 0).applyQuaternion(cylinderQuat);
  const cylCenter = {
    x: mark.center.x + cylAxis.x * (mark.depth / 2),
    y: mark.center.y + cylAxis.y * (mark.depth / 2),
    z: mark.center.z + cylAxis.z * (mark.depth / 2),
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
