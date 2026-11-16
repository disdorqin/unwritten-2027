import type { Group, Vector3 } from 'three';
import type { layout } from './terrain';

export type TownPlot = (typeof layout.plots)[number];
export type Box = { min: number[]; max: number[] };
export type Ramp = Box & { axis: 'x' | 'z'; ascending: 1 | -1 };

export function offsetBox<T extends Box>(box: T, origin: Vector3): T {
  const offset = [origin.x, origin.y, origin.z];
  return { ...box, min: box.min.map((value, i) => value + offset[i]), max: box.max.map((value, i) => value + offset[i]) };
}

export function readWalkGeometry(group: Group) {
  const { colliders = [], floors = [], ramps = [] } = group.userData as {
    colliders?: Box[]; floors?: Box[]; ramps?: Ramp[];
  };
  return {
    colliders: colliders.map(box => offsetBox(box, group.position)),
    floors: floors.map(box => offsetBox(box, group.position)),
    ramps: ramps.map(box => offsetBox(box, group.position)),
  };
}
