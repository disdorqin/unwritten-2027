import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, PointLight } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { mountSummitCloudBellArray, summitCloudBellLogCopy } from '../tools/voxel-tavern/town-blockout/main-summit-cloud-bell-array';

test('R1/R2: nine built bell posts are 25–35m apart inside the real P-3 cloud zone and outside the walking track', t => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  t.after(block.dispose);
  const trail = createMainSummitTrail(block.heightAt, 347);
  const root = new Group();
  const bell = mountSummitCloudBellArray(root, trail.points, block.heightAt);
  t.after(bell.dispose);
  assert.equal(bell.posts.length, 9);
  assert.equal(bell.lamps.length, 9);
  assert.ok(bell.lamps.every(source => source instanceof PointLight && source.intensity === 0));
  assert.ok(bell.pieceCount >= 200, 'Must be nine real bells, not nine empty markers');
  assert.equal(bell.drawBudget, 5);
  assert.equal(bell.group.children.filter(x => x instanceof InstancedMesh).length, 5);
  assert.ok(summitCloudBellLogCopy.every(x => x.length > 2));
  for (const [index, site] of bell.posts.entries()) {
    assert.ok(site.height >= 380 && site.height <= 560);
    assert.ok(site.baseClearanceMetres >= 3.1);
    assert.ok(Math.abs(block.heightAt(site.east,site.north)! - site.height) < 1e-5);
    if (index > 0) {
      const delta = site.courseMetres - bell.posts[index - 1]!.courseMetres;
      assert.ok(delta >= 25 && delta <= 35, 'Bell gap must be 25–35m on real trail: ' + delta);
    }
  }
  bell.dispose();
  assert.equal(root.children.length, 0);
});

test('R6: authenticated bell cadence unlocks real nine-lamp progressive chain with no timers or fake wind', t => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  t.after(block.dispose);
  const trail = createMainSummitTrail(block.heightAt, 347);
  const bell = mountSummitCloudBellArray(new Group(),trail.points,block.heightAt);
  t.after(bell.dispose);
  const first = bell.posts[0]!;
  const valid = (time: number) => bell.strike({ player: first, authorized: true, atMs: time });
  assert.equal(bell.strike({ player: first, authorized: false, atMs: 1000 }).accepted, false);
  assert.equal(bell.strike({ player: { ...first, east: first.east + 6 }, authorized: true, atMs: 1000 }).accepted, false);
  assert.equal(bell.snapshot().progress,0);
  assert.equal(valid(1000).progress,1);
  assert.deepEqual(valid(1000),{ accepted:false,reason:'stale-clock' });
  assert.equal(valid(1700).progress,1,'Wrong 700ms interval resets short rhythm');
  assert.equal(bell.snapshot().fails,1);
  assert.equal(valid(2080).progress,2);
  assert.equal(valid(2800).progress,3);
  const last = valid(3180);
  assert.equal(last.progress,4);
  assert.equal(bell.snapshot().finished,true);
  assert.equal(bell.snapshot().lit,0);
  assert.equal(bell.tick(3180),1);
  assert.equal(bell.tick(3959),1);
  assert.equal(bell.tick(3960),2);
  assert.equal(bell.tick(10000),9);
  assert.equal(bell.snapshot().lit,9);
  assert.ok(bell.lamps.every(light => light.intensity > 0));
  assert.equal(valid(12000).progress,4);
  assert.equal(bell.snapshot().fails,1,'Repeated completed rhythm never re-arms');
});

test('R3: malformed P-3 survey is refused instead of placing nine lamps through the mountain', t => {
  const block = createMainSummitBlock(mainSummitLayout,347,100);
  t.after(block.dispose);
  assert.throws(() => mountSummitCloudBellArray(new Group(),[],block.heightAt),RangeError);
});
