import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { mainSummitPigStone, registerMainSummitPigStone } from '../tools/voxel-tavern/town-blockout/main-summit-pig-stone';
import { createMainSummitRegistrationLandmarks } from '../tools/voxel-tavern/town-blockout/main-summit-registration';

test('the pig stone approach can be walked from the real summit hut door in both directions', () => {
  const town = createMainSummitBlock(mainSummitLayout, 347, 100);
  try {
    const { summit } = createMainSummitRegistrationLandmarks();
    const route = [...mainSummitPigStone.approachRoute, mainSummitPigStone.approach];
    assert.deepEqual(route[0], summit.entry);
    assert.deepEqual(route[2], summit.registry);
    const { origin, approach } = mainSummitPigStone;
    assert.ok(origin.east > summit.hut.west && origin.east < summit.hut.east);
    assert.ok(origin.north > summit.hut.south && origin.north < summit.hut.north);
    assert.equal(town.heightAt(origin.east, origin.north), 800);
    assert.ok(Math.hypot(origin.east - approach.east, origin.north - approach.north) <= 1.1);
    for (const direction of [route, [...route].reverse()]) {
      for (let index = 0; index < direction.length - 1; index++) {
        const start = direction[index]!;
        const end = direction[index + 1]!;
        const steps = Math.ceil(Math.hypot(end.east - start.east, end.north - start.north) / .025);
        for (let step = 0; step <= steps; step++) {
          const east = start.east + (end.east - start.east) * step / steps;
          const north = start.north + (end.north - start.north) * step / steps;
          assert.equal(town.heightAt(east, north), 800);
          const overlaps = summit.colliders.some(({ min, max }) => {
            const dx = Math.max(min[0] - east, east - max[0], 0);
            const dz = Math.max(min[2] + north, -north - max[2], 0);
            return max[1] > 800 && min[1] < 801.8 && Math.hypot(dx, dz) < .27;
          });
          assert.equal(overlaps, false, `hut collision at E${east.toFixed(3)}/N${north.toFixed(3)}`);
        }
      }
    }
  } finally {
    town.dispose();
  }
});

test('the pig origin uses a host transform and rejects invalid or separated pickup areas', () => {
  const toWorld = ({ east, north, height }: typeof mainSummitPigStone.origin | typeof mainSummitPigStone.approach) =>
    ({ east: east + 500, north: north - 350, height, layer: 'summit-test-host' });
  const registered = registerMainSummitPigStone(point => ({
    east: point.east + 500, north: point.north - 350, height: point.height, layer: 'summit-test-host',
  }));
  assert.equal(registered.id, 'pig');
  assert.deepEqual(registered.origin, toWorld(mainSummitPigStone.origin));
  assert.deepEqual(registered.approach, toWorld(mainSummitPigStone.approach));
  assert.throws(() => registerMainSummitPigStone(point => ({
    ...point, layer: point.east > 66 ? 'summit-test-host' : 'town-test-host',
  })), RangeError);
  assert.throws(() => registerMainSummitPigStone(point => ({
    ...point, east: 20 * point.east, layer: 'summit-test-host',
  })), RangeError);
});
