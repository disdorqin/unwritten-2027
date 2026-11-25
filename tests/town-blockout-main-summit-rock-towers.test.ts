import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitRockTowers } from '../tools/voxel-tavern/town-blockout/main-summit-rock-towers';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

test('rock towers raise twelve named clusters clear of the tread', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const trail = createMainSummitTrail(block.heightAt, 347);
  const towers = createMainSummitRockTowers(trail.points, block.heightAt);
  context.after(() => towers.dispose());
  assert.equal(towers.clusters.length, 12);
  assert.equal(new Set(towers.clusters.map(cluster => cluster.name)).size, 12);
  for (const cluster of towers.clusters) {
    // No cluster centre may sit on the tread itself (18 m minimum offset).
    const nearest = Math.min(...trail.points.map(point => Math.hypot(point.east - cluster.east, point.north - cluster.north)));
    assert.ok(nearest >= 12, `${cluster.name} keeps clear of the trail`);
    assert.ok(cluster.height > 350, `${cluster.name} stands on the massif`);
  }
  const first = towers.clusters[0]!;
  assert.ok(towers.blocked(first.east, first.north, block.heightAt(first.east, first.north)!, .27, 1.8),
    'tower bases collide');
});
