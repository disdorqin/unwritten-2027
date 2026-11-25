import type { Group } from 'three';
import type { AircraftPoint } from '../../../src/shared/aircraft-flight';

export type SkyCityFoot = { x: number; y: number; z: number };

/** Island +x is east, +z is south. The host supplies the origin and clockwise heading from north. */
export function createSkyCitySite({ east, north, height }: AircraftPoint, yaw = 0) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    origin: Object.freeze({ east, north, height }),
    yaw,
    place(group: Group) {
      group.position.set(east, height, -north);
      group.rotation.set(0, -yaw, 0);
    },
    toWorld({ x, y, z }: SkyCityFoot): AircraftPoint {
      return { east: east + cos * x - sin * z, north: north - sin * x - cos * z, height: height + y };
    },
    toLocal(at: AircraftPoint): SkyCityFoot {
      const de = at.east - east;
      const dn = at.north - north;
      return { x: cos * de - sin * dn, y: at.height - height, z: -sin * de - cos * dn };
    },
  };
}

export type SkyCitySite = ReturnType<typeof createSkyCitySite>;
