import { PerspectiveCamera } from 'three';

export type TheaterPhotoView = 'stage' | 'clocktower';

const fieldOfView = {
  stage: { near: 49, standard: 56, full: 60 },
  clocktower: { near: 44, standard: 52, full: 58 },
} as const;

const anchors = {
  stage: { north: 174, lookNorth: 150, lookHeight: 14.4 },
  clocktower: { north: 146, lookNorth: 193, lookHeight: 24 },
} as const;

export function createTheaterPhotoCamera(
  view: TheaterPhotoView,
  people: readonly { east: number }[],
  groundHeight: (east: number, north: number) => number,
  camera = new PerspectiveCamera(60, 16 / 9, .1, 1400),
) {
  const east = 224;
  const anchor = anchors[view];
  const widestOffset = people.reduce((offset, person) => Math.max(offset, Math.abs(person.east - east)), 0);
  const size = people.length > 24 || widestOffset > 6.3 ? 'full'
    : people.length > 8 || widestOffset > 4.6 ? 'standard' : 'near';
  const fov = fieldOfView[view][size];
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.position.set(east, groundHeight(east, anchor.north) + 2.5, -anchor.north);
  camera.lookAt(east, anchor.lookHeight, -anchor.lookNorth);
  camera.updateMatrixWorld(true);
  return camera;
}
