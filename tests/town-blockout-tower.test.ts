import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildTowerLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tower.ts';
import { nearestTownActivity, type TownActivitySpot } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

type XZ = readonly [x: number, z: number];
type Stop = 'dial' | 'bell' | 'lookout';
type Waypoint = { target: XZ; stop?: Stop };

test('enlarged clocktower can be climbed and descended through all three activity stops', () => {
  const plot = layout.plots.find(({ id }) => id === 'clocktower')!;
  const [east, north, altitude] = plot.origin;
  const tower = buildTowerLandmark(plot);
  tower.position.set(east, altitude, -north);
  const { colliders, floors, ramps } = readWalkGeometry(tower);
  const solids = [...colliders, ...floors];
  const grid = createTerrainGrid();
  const stops = tower.userData.stops as Record<Stop, [number, number, number]>;
  const spots: TownActivitySpot[] = (['dial', 'bell', 'lookout'] as const).map((label, index) => {
    const [x, y, z] = stops[label];
    return { x: east + x, n: north - z, ground: altitude + y, range: [1.75, 2, 1.3][index],
      label, run() {} };
  });

  assert.ok(stops.lookout[1] >= 105, 'lookout platform height should increase with the tower');
  const street: XZ = [plot.connect[0] - east, north - plot.connect[1]];
  const door: XZ = [plot.door[0] - east, north - plot.door[1]];
  const corners: XZ[] = [[3.21875, 3.21875], [3.21875, -3.21875], [-3.21875, -3.21875], [-3.21875, 3.21875]];
  const entry: XZ[] = [street, door, [0, 3.2], corners[0]];
  const ascent: Waypoint[] = entry.map(target => ({ target }));
  function visit(stop: Stop, target: XZ, approach: XZ[], returnTo?: XZ) {
    ascent.push(...approach.map(point => ({ target: point })), { target, stop });
    if (returnTo) ascent.push(...approach.slice().reverse().map(point => ({ target: point })), { target: returnTo });
  }
  for (let flight = 1; flight <= 31; flight++) {
    const corner = corners[flight % 4];
    ascent.push({ target: corner });
    if (flight === 24) visit('dial', [.75, .9], [[3.21875, 1.625], [1.25, 1.625]], corner);
    if (flight === 27) visit('bell', [-.5, .5], [[-1.625, 3.21875], [-1.625, .5]], corner);
  }
  visit('lookout', [0, 1.3], [[-1.4375, 2.8125], [-1.4375, -2.59375], [1.03125, -2.59375], [1.03125, 1.3]]);
  const roundTrip = [...ascent, ...ascent.slice(0, -1).reverse()];
  const streetHeight = grid.heightAt(east + street[0], north - street[1]);

  // The walking envelope and reachable surfaces match viewer.ts. No jump or fall can substitute for a stair.
  function overlaps(e: number, z: number, { min, max }: Box) {
    const dx = Math.max(min[0] - e, e - max[0], 0);
    const dz = Math.max(min[2] - z, z - max[2], 0);
    return dx * dx + dz * dz < .27 * .27;
  }
  for (const stride of [.12, .2025]) {
    let x = street[0];
    let z = street[1];
    let ground = streetHeight;
    const picked: Stop[] = [];
    for (const { target: [nextX, nextZ], stop } of roundTrip.slice(1)) {
      const fromX = x;
      const fromZ = z;
      const stepCount = Math.ceil(Math.hypot(nextX - fromX, nextZ - fromZ) / stride);
      for (let step = 1; step <= stepCount; step++) {
        x = fromX + (nextX - fromX) * step / stepCount;
        z = fromZ + (nextZ - fromZ) * step / stepCount;
        const e = east + x;
        const n = north - z;
        const at = `clocktower (${x.toFixed(3)}, ${z.toFixed(3)}) at ${ground.toFixed(3)} m`;
        const limit = ground + .43;
        let floor = grid.heightAt(e, n);
        for (const surface of floors) {
          if (surface.max[1] <= limit && overlaps(e, -n, surface)) floor = Math.max(floor, surface.max[1]);
        }
        for (const ramp of ramps) {
          const worldZ = -n;
          if (e < ramp.min[0] || e > ramp.max[0] || worldZ < ramp.min[2] || worldZ > ramp.max[2]) continue;
          const axis = ramp.axis === 'x' ? 0 : 2;
          const fraction = ((axis === 0 ? e : worldZ) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
          const top = ramp.min[1] + (ramp.max[1] - ramp.min[1]) * (ramp.ascending > 0 ? fraction : 1 - fraction);
          if (top <= limit) floor = Math.max(floor, top);
        }
        for (const solid of colliders) {
          if (solid.max[1] <= ground + .03 && overlaps(e, -n, solid)) floor = Math.max(floor, solid.max[1]);
        }
        assert.ok(canEnter(e, n), at);
        assert.ok(Math.abs(floor - ground) <= .430001, `${at} → ${floor} m`);
        const blocker = solids.find(box => floor + .025 < box.max[1] && floor + 1.775 > box.min[1]
          && overlaps(e, -n, box));
        assert.ok(!blocker, `collider blocks ${at} → ${floor} m ${JSON.stringify(blocker)}`);
        ground = floor;
      }
      if (stop) {
        assert.equal(nearestTownActivity(spots, east + x, north - z, ground)?.label, stop);
        assert.equal(ground, altitude + stops[stop][1]);
        picked.push(stop);
      }
    }
    assert.deepEqual(picked, ['dial', 'bell', 'lookout', 'bell', 'dial']);
    assert.equal(ground, streetHeight);
  }
});
