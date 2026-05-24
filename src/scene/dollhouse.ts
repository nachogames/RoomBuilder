/** Dollhouse culling: a wall should be hidden when the camera looks at its
 *  exterior face (i.e. the wall sits between the camera and the room). True =
 *  hide. Uses the outward (away-from-room) normal in the x/z plane. */
export function wallFacesCamera(
  normal: { x: number; z: number },
  center: { x: number; z: number },
  cam: { x: number; z: number },
): boolean {
  const vx = cam.x - center.x;
  const vz = cam.z - center.z;
  return normal.x * vx + normal.z * vz > 1e-6;
}
