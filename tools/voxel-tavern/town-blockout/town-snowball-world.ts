import { Vector3 } from 'three';
import type { Box } from './landmark-kit';
import type { TownSnowballTarget } from './town-snow-target';
import { snowballSegmentBox, type SnowballContact } from './town-snowball';

type Cells = { colliders: Box[]; floors: Box[] };
type World = {
  geometryAt(east: number, north: number): Cells;
  surfaceHeight(east: number, north: number): number;
  occupiedAt(east: number, north: number, y: number): boolean;
  targets: readonly TownSnowballTarget[];
};

/** Sweep one simulation step against fixed scene geometry before scoring a target. */
export function createSnowballSweep(world: World) {
  const contact = new Vector3();
  const min = [0, 0, 0];
  const max = [0, 0, 0];

  return (from: Vector3, to: Vector3, radius: number): SnowballContact | undefined => {
    let closest = Infinity;
    let targetId: string | undefined;
    function testBox(bounds: Box) {
      const t = snowballSegmentBox(from, to, bounds.min, bounds.max, radius);
      if (t !== undefined && t < closest) closest = t;
    }
    const a = world.geometryAt(from.x, -from.z);
    const b = world.geometryAt(to.x, -to.z);
    for (const box of a.colliders) testBox(box);
    for (const box of a.floors) testBox(box);
    if (a !== b) {
      for (const box of b.colliders) testBox(box);
      for (const box of b.floors) testBox(box);
    }

    const before = from.y - radius - world.surfaceHeight(from.x, -from.z);
    const after = to.y - radius - world.surfaceHeight(to.x, -to.z);
    if (before <= 0) closest = 0;
    else if (after <= 0) closest = Math.min(closest, before / (before - after));

    if (closest > 0 && world.occupiedAt(to.x, -to.z, to.y)) {
      let open = 0;
      let blocked = 1;
      for (let i = 0; i < 5; i++) {
        const t = (open + blocked) / 2;
        contact.lerpVectors(from, to, t);
        if (world.occupiedAt(contact.x, -contact.z, contact.y)) blocked = t;
        else open = t;
      }
      closest = Math.min(closest, blocked);
    }

    for (const target of world.targets) {
      const { x, y, z, radius: width, height } = target;
      if (Math.abs(x - from.x) > 2 || Math.abs(z - from.z) > 2) continue;
      min[0] = x - width; min[1] = y; min[2] = z - width;
      max[0] = x + width; max[1] = y + height; max[2] = z + width;
      const t = snowballSegmentBox(from, to, min, max, radius);
      if (t !== undefined && t < closest) {
        closest = t;
        targetId = target.id;
      }
    }
    if (!Number.isFinite(closest)) return undefined;
    contact.lerpVectors(from, to, closest);
    return targetId ? { at: contact, kind: 'target', targetId } : { at: contact, kind: 'world' };
  };
}
