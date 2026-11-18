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
  scoreAt?(target: TownSnowballTarget): boolean;
};

const chestRadiusBonus = .08;
const headHeightRatio = .78;

function segmentCapsule(
  from: Vector3, to: Vector3, target: TownSnowballTarget, bottom: number, top: number, reach: number,
) {
  const x = from.x - target.x;
  const z = from.z - target.z;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const squaredRadius = reach * reach;
  const distanceY = from.y - Math.min(top, Math.max(bottom, from.y));
  if (x * x + z * z + distanceY * distanceY <= squaredRadius) return 0;

  const horizontal = dx * dx + dz * dz;
  const horizontalProjection = x * dx + z * dz;
  const horizontalDistance = x * x + z * z - squaredRadius;
  let first = Infinity;
  const sideDisc = horizontalProjection ** 2 - horizontal * horizontalDistance;
  if (horizontal > 1e-12 && sideDisc >= 0) {
    const t = (-horizontalProjection - Math.sqrt(sideDisc)) / horizontal;
    const y = from.y + t * dy;
    if (t >= 0 && t <= 1 && y >= bottom && y <= top) first = t;
  }
  const speed = horizontal + dy * dy;
  if (speed > 1e-12) for (const cap of [bottom, top]) {
    const y = from.y - cap;
    const projection = horizontalProjection + y * dy;
    const disc = projection ** 2 - speed * (horizontalDistance + y * y);
    if (disc < 0) continue;
    const t = (-projection - Math.sqrt(disc)) / speed;
    if (t >= 0 && t <= 1 && t < first) first = t;
  }
  return Number.isFinite(first) ? first : undefined;
}

/** Sweep one simulation step against fixed scene geometry before scoring a target. */
export function createSnowballSweep(world: World) {
  const contact = new Vector3();
  const probe = new Vector3();
  const chestContact = new Vector3();
  const chestAxis = new Vector3();
  const min = [0, 0, 0];
  const max = [0, 0, 0];

  function worldEntry(from: Vector3, to: Vector3, radius: number) {
    let closest = Infinity;
    const lowX = Math.min(from.x, to.x) - radius;
    const highX = Math.max(from.x, to.x) + radius;
    const lowY = Math.min(from.y, to.y) - radius;
    const highY = Math.max(from.y, to.y) + radius;
    const lowZ = Math.min(from.z, to.z) - radius;
    const highZ = Math.max(from.z, to.z) + radius;
    function testBox({ min, max }: Box) {
      if (min[0] > highX || max[0] < lowX || min[1] > highY || max[1] < lowY ||
          min[2] > highZ || max[2] < lowZ) return;
      const t = snowballSegmentBox(from, to, min, max, radius);
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
        probe.lerpVectors(from, to, t);
        if (world.occupiedAt(probe.x, -probe.z, probe.y)) blocked = t;
        else open = t;
      }
      closest = Math.min(closest, blocked);
    }

    return closest;
  }

  return (from: Vector3, to: Vector3, radius: number, thrower?: string,
    extraTargets: readonly TownSnowballTarget[] = [],
  ): SnowballContact | undefined => {
    let closest = worldEntry(from, to, radius);
    if (closest === 0) return { at: contact.copy(from), kind: 'world' };
    let hit: TownSnowballTarget | undefined;
    const lowX = Math.min(from.x, to.x);
    const highX = Math.max(from.x, to.x);
    const lowY = Math.min(from.y, to.y) - radius;
    const highY = Math.max(from.y, to.y) + radius;
    const lowZ = Math.min(from.z, to.z);
    const highZ = Math.max(from.z, to.z);
    const baseCount = world.targets.length;
    for (let i = 0; i < baseCount + extraTargets.length; i++) {
      const target = i < baseCount ? world.targets[i] : extraTargets[i - baseCount];
      const { x, y, z, radius: width, height } = target;
      const box = target.shape === 'box';
      const reach = width + radius + (box ? 0 : chestRadiusBonus);
      if (target.id === thrower || x + reach < lowX || x - reach > highX ||
        z + reach < lowZ || z - reach > highZ || y + height < lowY || y > highY) continue;

      let t: number | undefined;
      if (box) {
        min[0] = x - width; min[1] = y; min[2] = z - width;
        max[0] = x + width; max[1] = y + height; max[2] = z + width;
        t = snowballSegmentBox(from, to, min, max, radius);
      } else {
        const bottom = y + width;
        const top = Math.max(bottom, y + height - width);
        t = segmentCapsule(from, to, target, bottom, top, width + radius);
        // A direct body contact takes precedence over the extra latitude around the chest.
        if (t === undefined) {
          const chestBottom = y + height * .55;
          const chestTop = y + height * .68;
          const chest = segmentCapsule(from, to, target, chestBottom, chestTop, reach);
          if (chest !== undefined && chest < closest) {
            chestContact.lerpVectors(from, to, chest);
            chestAxis.set(x, Math.min(chestTop, Math.max(chestBottom, chestContact.y)), z);
            // Reject bonus-only grazes when the expanded capsule extends through nearby cover.
            if (worldEntry(chestContact, chestAxis, 0) > 1) t = chest;
          }
        }
      }
      if (t !== undefined && t < closest) {
        closest = t;
        hit = target;
      }
    }
    if (!Number.isFinite(closest)) return undefined;
    contact.lerpVectors(from, to, closest);
    if (!hit) return { at: contact, kind: 'world' };
    const zone = hit.shape === 'box' ? undefined : contact.y >= hit.y + hit.height * headHeightRatio ? 'head' : 'torso';
    return { at: contact, kind: 'target', targetId: hit.id,
      score: hit.id.startsWith('p:') ? false : world.scoreAt?.(hit), zone };
  };
}
