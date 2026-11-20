import type { Object3D } from 'three';
import { createTownChronicleDoorRing } from './town-chronicle-door-ring';

type StarportDoorPoint = Readonly<{ east: number; north: number; height: number }>;
type NightOverlapSignal = Readonly<{ layersOverlap: boolean }>;

/** Place the engraved ring on the existing door face. The overlap changes only its appearance. */
export function mountStarportNightRing(owner: Object3D, door: StarportDoorPoint) {
  const ring = createTownChronicleDoorRing(.55, .65);
  // The south-facing slab is .17 m deep, with its center 1.31 m above the footpoint.
  ring.position.set(door.east, door.height + 1.31, -door.north + .1);
  owner.add(ring);
  let lit = false;
  let disposed = false;

  return {
    apply({ layersOverlap }: NightOverlapSignal) {
      if (disposed || lit === layersOverlap) return;
      lit = layersOverlap;
      ring.material.emissive.setHex(lit ? 0x9cd7ed : 0);
      ring.material.emissiveIntensity = lit ? .9 : 1;
    },
    snapshot() { return { lit }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      lit = false;
      ring.removeFromParent();
      ring.geometry.dispose();
      ring.material.dispose();
    },
  };
}
