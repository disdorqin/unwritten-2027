import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix4, type Group, type InstancedMesh } from 'three';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildTowerLandmark, type TowerBellMotion } from '../tools/voxel-tavern/town-blockout/landmark-tower.ts';
import { nearestTownActivity, type TownActivitySpot } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

type XZ = readonly [x: number, z: number];
type Stop = 'dial' | 'bell' | 'lookout';
type Waypoint = { target: XZ; stop?: Stop };

test('the clocktower plaza apron and south arch support plain walking both ways', () => {
  const plot = layout.plots.find(({ id }) => id === 'clocktower')!;
  const [east, north, altitude] = plot.origin;
  const tower = buildTowerLandmark(plot);
  tower.position.set(east, altitude, -north);
  const { colliders, floors } = readWalkGeometry(tower);
  const solids = [...colliders, ...floors];
  const grid = createTerrainGrid();
  const bodyRadius = .27;
  const stepHeight = .43;
  const northbound = Array.from({ length: 272 }, (_, index) => (21140 + index * 3) / 100);
  const roundTrip = [...northbound, ...northbound.slice(0, -1).reverse()];

  for (const x of [225.7, 226, 226.3]) {
    let ground = grid.heightAt(x, roundTrip[0]);
    for (const n of roundTrip) {
      const overlaps = ({ min, max }: Box) => Math.hypot(
        Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0),
      ) < bodyRadius;
      let next = grid.heightAt(x, n);
      for (const floor of floors) {
        if (floor.max[1] <= ground + stepHeight && overlaps(floor)) next = Math.max(next, floor.max[1]);
      }
      for (const solid of colliders) {
        if (solid.max[1] <= ground + .03 && overlaps(solid)) next = Math.max(next, solid.max[1]);
      }
      const point = `E${x}/N${n}, ${ground} → ${next}`;
      assert.ok(canEnter(x, n) && Math.abs(next - ground) <= stepHeight, point);
      assert.equal(solids.some(box => overlaps(box) &&
        next + .025 < box.max[1] && next + 1.775 > box.min[1]), false, point);
      // N213 is on the flush apron. The physical arch and steps are farther north.
      if (n >= 212 && n <= 215.7) assert.equal(next, altitude, point);
      ground = next;
    }
    assert.equal(ground, altitude);
  }
});

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
    if (flight === 24) {
      visit('dial', [.75, .9], [[3.21875, 1.625], [1.25, 1.625]], corner);
      visit('dial', [-.75, .65], [[3.21875, 1.625], [1.25, 1.625], [.6, .65]], corner);
    }
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
    assert.deepEqual(picked, ['dial', 'dial', 'bell', 'lookout', 'bell', 'dial', 'dial']);
    assert.equal(ground, streetHeight);
  }
});

test('clocktower bell swings, lags and returns the single movable batch to rest', () => {
  const tower = buildTowerLandmark(layout.plots.find(({ id }) => id === 'clocktower')!);
  const detail = tower.userData.detailInterior as Group;
  const motion = tower.userData.bellMotion as TowerBellMotion;
  const moving = tower.getObjectByName('Clocktower moving bell') as InstancedMesh;
  const axle = moving.parent!;
  assert.equal(axle.children.length, 1);
  assert.equal(axle.parent, detail);

  function pose() {
    const clapper = new Matrix4(), rope = new Matrix4(), body = new Matrix4();
    moving.getMatrixAt(0, body);
    moving.getMatrixAt(moving.count - 4, clapper);
    moving.getMatrixAt(moving.count - 1, rope);
    return { angle: axle.rotation.x, body: body.elements, clapper: clapper.elements, rope: rope.elements };
  }
  const rest = pose();
  const initialVersion = moving.instanceMatrix.version;
  motion.update(1.25);
  assert.equal(moving.instanceMatrix.version, initialVersion);

  motion.strike();
  motion.update(.25);
  const swing = pose();
  assert.ok(swing.angle > 0 && swing.angle <= Math.PI / 30);
  assert.deepEqual(swing.body, rest.body);
  assert.notDeepEqual(swing.clapper, rest.clapper);
  assert.notDeepEqual(swing.rope, rest.rope);
  motion.update(3.75);
  assert.deepEqual(pose(), rest);
  const restedVersion = moving.instanceMatrix.version;
  motion.update(1.25);
  assert.equal(moving.instanceMatrix.version, restedVersion);

  detail.visible = false;
  motion.strike();
  motion.update(.25);
  assert.equal(moving.instanceMatrix.version, restedVersion);
  assert.deepEqual(pose(), rest);
});
