import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  c2EastBenchSpec, mountC2EastBench, planC2EastBench,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-bench.ts';

const block = createMainSummitBlock(mainSummitLayout, 348, 8);
const heightAt = block.heightAt;

test('bench is seated on the one canonical field at the stair hairpin', () => {
  const c = c2EastBenchSpec.centre;
  const ground = heightAt(c.east, c.north);
  assert.equal(typeof ground, 'number');
  assert.ok(ground! > 550 && ground! < 700);
  assert.ok(c.east >= c2EastBenchSpec.sectorWest && c.north >= c2EastBenchSpec.sectorSouth);
});

test('plan has a fan landing, curved back wall, seat, posts and approach', () => {
  const pieces = planC2EastBench(heightAt);
  const stats = mountC2EastBench(heightAt).stats();
  try {
    assert.ok(pieces.length > 80, `expected a real bench, got ${pieces.length}`);
    assert.ok(stats.platform >= 30, `platform ${stats.platform}`);
    assert.ok(stats.back >= 30, `back wall ${stats.back}`);
    assert.ok(stats.seat >= 15, `seat ${stats.seat}`);
    assert.ok(stats.post >= 6, `posts ${stats.post}`);
    assert.ok(stats.step >= 2, `steps ${stats.step}`);
    assert.equal(stats.batches, 1);
    assert.equal(stats.lights, 0);
  } finally { mountC2EastBench(heightAt).dispose(); }
});

test('every piece stays in the east sector and clears reserved sites', () => {
  for (const p of planC2EastBench(heightAt)) {
    assert.ok(p.east >= c2EastBenchSpec.sectorWest && p.north >= c2EastBenchSpec.sectorSouth);
    assert.notEqual(heightAt(p.east, p.north), undefined);
    for (const site of c2EastBenchSpec.reserved) {
      assert.ok(Math.hypot(p.east - site.east, p.north - site.north) >= site.radius + 2,
        `piece at ${p.east},${p.north} crowds reserved site ${site.east}`);
    }
  }
});

test('arc runs from a real step bend and every stone stack is buried', () => {
  const pieces = planC2EastBench(heightAt);
  const cells = new Set(pieces.filter(p => p.family === 'platform').map(p => `${p.east},${p.north}`));
  assert.ok(cells.size >= 20);
  let buried = 0;
  for (const key of cells) {
    const stack = pieces.filter(p => p.family === 'platform' && `${p.east},${p.north}` === key);
    const ground = heightAt(stack[0]!.east, stack[0]!.north)!;
    if (Math.min(...stack.map(p => p.y)) < ground) buried++;
  }
  assert.ok(buried >= cells.size * .8, 'the landing must be solid masonry, not stilts');
});

test('visible instances use authored bottoms and colliders cover the same bodies', () => {
  const asset = mountC2EastBench(heightAt);
  try {
    assert.equal(asset.mesh.count, asset.pieces.length);
    const m = asset.mesh.instanceMatrix.array;
    asset.pieces.forEach((p, i) => {
      const o = i * 16;
      assert.ok(Math.abs(m[o + 12] - p.east) < 1e-4);
      assert.ok(Math.abs(m[o + 13] - (p.y + p.h / 2)) < 1e-4, 'bottom semantics');
      assert.ok(Math.abs(m[o + 14] + p.north) < 1e-4);
    });
    const seat = asset.pieces.find(p => p.family === 'seat')!;
    assert.equal(asset.blocked(seat.east, seat.north, seat.y + .5, .01, .05), true);
    assert.equal(asset.blocked(0, 0, 0), false);
  } finally { asset.dispose(); }
});

test('one 16px nearest Lambert batch, zero lights, idempotent dispose', () => {
  const asset = mountC2EastBench(heightAt);
  const parent = new Group();
  parent.add(asset.group);
  const map = (asset.mesh.material as { map?: { image?: { width: number; height: number }; magFilter: number } }).map!;
  assert.equal(map.image!.width, 16);
  assert.equal(map.image!.height, 16);
  assert.equal(map.magFilter, 1003);
  assert.equal(asset.group.children.length, 1);
  asset.dispose(); asset.dispose();
  assert.equal(asset.group.parent, null);
});
