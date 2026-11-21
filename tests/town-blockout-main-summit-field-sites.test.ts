import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  buildWindShelter, createSkyWatchRelic, createTrailMarkers, createWishLockPoint,
} from '../tools/voxel-tavern/town-blockout/main-summit-field-sites';
import { createMainSummitMachineRoom } from '../tools/voxel-tavern/town-blockout/main-summit-machine-room';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

function namesOf(group: { traverse: (fn: (object: { name: string }) => void) => void }) {
  const names = new Set<string>();
  group.traverse(object => { if (object.name) names.add(object.name); });
  return names;
}

test('wish lock point, shelters, sky watch and trail markers build to spec', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const trail = createMainSummitTrail(block.heightAt, 347);

  const wish = createWishLockPoint({ east: 12, north: -19, height: 347 });
  context.after(() => wish.dispose());
  assert.ok(namesOf(wish.group).has('wish-lock-rail'));

  const shelter = buildWindShelter('wind-shelter-test', 100, 300, 420);
  context.after(() => shelter.dispose());
  const shelterNames = namesOf(shelter.group);
  for (const expected of ['shelter-fire-ember', 'shelter-food-box', 'shelter-spare-rope', 'shelter-duty-tally']) {
    assert.ok(shelterNames.has(expected), `missing ${expected}`);
  }

  const anchor = trail.points.reduce((best, point) =>
    Math.abs(point.height - 640) < Math.abs(best.height - 640) ? point : best, trail.points[0]!);
  const relic = createSkyWatchRelic(anchor, block.heightAt);
  context.after(() => relic.dispose());
  const relicNames = namesOf(relic.group);
  for (const expected of ['watch-brass-frame', 'watch-frame-rust', 'watch-star-slab']) {
    assert.ok(relicNames.has(expected), `missing ${expected}`);
  }
  assert.equal(relic.slabs.length, 3);
  const offTrail = Math.min(...trail.points.map(point =>
    Math.hypot(point.east - relic.site.east, point.north - relic.site.north)));
  assert.ok(offTrail > 40, 'relic stands well off the tread');

  const markers = createTrailMarkers(trail.points, block.heightAt);
  context.after(() => markers.dispose());
  assert.ok(markers.count > 40, 'trail corridor carries markers end to end');
});

test('machine room registers the three cable fault points', context => {
  const room = createMainSummitMachineRoom(347);
  context.after(() => room.dispose());
  assert.deepEqual(room.faultPoints.map(point => point.id), ['rust-gate', 'derail', 'counterweight']);
  const names = namesOf(room.group);
  for (const expected of ['fault-rust-gate-wheel', 'fault-derailed-pulley', 'fault-counterweight-fallen']) {
    assert.ok(names.has(expected), `missing ${expected}`);
  }
});
