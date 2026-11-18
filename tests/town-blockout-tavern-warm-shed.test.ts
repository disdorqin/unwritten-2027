import assert from 'node:assert/strict';
import test from 'node:test';
import { InstancedMesh, Light } from 'three';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { roadCorridorKeepClear } from '../tools/voxel-tavern/town-blockout/road-clearance.ts';
import {
  buildTavernWarmShed, createTavernWarmShedSpots, inTavernWarmShed,
  nearTavernWarmShedFire, tavernWarmShedEntrance,
} from '../tools/voxel-tavern/town-blockout/tavern-warm-shed.ts';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { nearestTownActivity, type TownSeat } from '../tools/voxel-tavern/town-blockout/town-activity.ts';

test('the tavern warm shed keeps its entrance, shelter and four seats within its geometry budget', () => {
  const terrain = createTerrainGrid();
  const plot = layout.plots.find(({ id }) => id === 'tavern')!;
  const [east, north, floor] = plot.origin;
  const { group, colliders } = buildTavernWarmShed(plot, terrain.heightAt);
  group.position.set(east, floor, -north);
  group.userData.colliders = colliders;
  const world = readWalkGeometry(group);
  assert.equal(roadCorridorKeepClear(east, north + 9.5, 4.3), false);
  assert.equal(group.children.length, 2);
  let triangles = 0;
  group.traverse(node => {
    assert.ok(!(node instanceof Light));
    if (node instanceof InstancedMesh) triangles += node.geometry.index!.count / 3 * node.count;
  });
  assert.equal(triangles, 1536);

  const canStand = (x: number, n: number, feet: number) => canEnter(x, n) &&
    !world.colliders.some(({ min, max }) => {
      const dx = Math.max(min[0] - x, x - max[0], 0);
      const dz = Math.max(min[2] + n, -n - max[2], 0);
      return dx * dx + dz * dz < .27 ** 2 && feet + .025 < max[1] && feet + 1.8 - .025 > min[1];
    });
  const [gateX, gateN] = tavernWarmShedEntrance(plot);
  assert.ok(canStand(gateX, gateN, terrain.heightAt(gateX, gateN)));
  assert.ok(inTavernWarmShed(plot, gateX, gateN, floor));
  assert.equal(inTavernWarmShed(plot, gateX + .41, gateN, floor), false);
  assert.equal(inTavernWarmShed(plot, east, gateN, floor + 3.35), false);

  const sitLog: TownSeat[] = [];
  let opened = '';
  let hot = 0;
  const spots = createTavernWarmShedSpots(plot, terrain.heightAt, {
    sit: pose => sitLog.push(pose), open(title) { opened = title; return {} as HTMLElement; }, announce() {},
  }, () => hot++, canStand);
  assert.equal(spots.length, 6);
  const [drink, door] = spots.slice(-2);
  for (const spot of spots) {
    assert.equal(nearestTownActivity(spots, spot.x, spot.n, spot.ground), spot);
    spot.run();
  }
  assert.equal(sitLog.length, 4);
  for (const pose of sitLog) {
    assert.ok(nearTavernWarmShedFire(plot, pose.x, pose.n, pose.eyeY - 1.52));
  }
  assert.equal(nearTavernWarmShedFire(plot, door.x, door.n, door.ground), false);
  assert.equal(opened, '后院暖棚');
  assert.equal(hot, 1);
  assert.equal(drink.available?.(), false);
  drink.run();
  assert.equal(hot, 1);
});
