import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  c2EastSledSpec, mountC2EastSled, planC2EastSled,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-sled.ts';

const block = createMainSummitBlock(mainSummitLayout, 348, 8);
const heightAt = block.heightAt;

test('sled start is seated on the one canonical field and follows a real downhill', () => {
  const s = c2EastSledSpec;
  const datum = heightAt(s.start.east, s.start.north);
  assert.equal(typeof datum, 'number');
  assert.ok(datum! > 400 && datum! < 700);
  const top = heightAt(s.chuteFrom.east, s.chuteFrom.north)!;
  const bottom = heightAt(s.chuteTo.east, s.chuteTo.north)!;
  assert.ok(top > bottom, `chute must descend: ${top} -> ${bottom}`);
  assert.ok(top - bottom > 30, `chute needs a real drop, got ${top - bottom}`);
});

test('plan has a launch deck, snow chute, guide poles, wind sock and runestone', () => {
  const pieces = planC2EastSled(heightAt);
  const asset = mountC2EastSled(heightAt);
  const stats = asset.stats();
  try {
    assert.ok(pieces.length > 80, `expected a real sled start, got ${pieces.length}`);
    assert.ok(stats.deck >= 16, `deck cells ${stats.deck}`);
    assert.ok(stats.chute >= 12, `chute beds ${stats.chute}`);
    assert.ok(stats.pole >= 12, `guide poles ${stats.pole}`);
    assert.ok(stats.sock >= 4, `wind sock parts ${stats.sock}`);
    assert.ok(stats.stone >= 20, `masonry courses ${stats.stone}`);
    assert.equal(stats.batches, 1);
    assert.equal(stats.lights, 0);
  } finally { asset.dispose(); }
});

test('every piece stays in the east sector and clears neighbouring sites', () => {
  const pieces = planC2EastSled(heightAt);
  for (const p of pieces) {
    assert.ok(p.east >= c2EastSledSpec.sectorWest && p.north >= c2EastSledSpec.sectorSouth);
    const ground = heightAt(p.east, p.north);
    assert.notEqual(ground, undefined);
    for (const site of c2EastSledSpec.reserved) {
      assert.ok(Math.hypot(p.east - site.east, p.north - site.north) >= site.radius + 2,
        `piece at ${p.east},${p.north} crowds reserved site ${site.east}`);
    }
  }
  // The production sled routes and the surveyed descent live in the A sector.
  assert.equal(c2EastSledSpec.sectorSouth, 480);
  assert.ok(c2EastSledSpec.chuteTo.north > c2EastSledSpec.sectorSouth);
});

test('deck masonry is buried, not stilted, at every sampled cell', () => {
  const pieces = planC2EastSled(heightAt);
  const cells = new Set(pieces.filter(p => p.family === 'stone').map(p => `${p.east},${p.north}`));
  assert.ok(cells.size >= 16);
  for (const key of cells) {
    const stack = pieces.filter(p => p.family === 'stone' && `${p.east},${p.north}` === key);
    assert.ok(stack.length >= 2, `stack ${key} needs multiple courses`);
    const ground = heightAt(stack[0]!.east, stack[0]!.north)!;
    assert.ok(Math.min(...stack.map(p => p.y)) < ground, `stack ${key} must have a buried footing`);
  }
});

test('visible instances use authored bottoms; only upright bodies block the rider', () => {
  const asset = mountC2EastSled(heightAt);
  try {
    assert.equal(asset.mesh.count, asset.pieces.length);
    const m = asset.mesh.instanceMatrix.array;
    asset.pieces.forEach((p, i) => {
      const o = i * 16;
      assert.ok(Math.abs(m[o + 12] - p.east) < 1e-4);
      assert.ok(Math.abs(m[o + 13] - (p.y + p.h / 2)) < 1e-4, 'bottom semantics');
      assert.ok(Math.abs(m[o + 14] + p.north) < 1e-4);
    });
    const upright = new Set(['rail', 'pole', 'rune', 'sock']);
    const solid = asset.pieces.filter(p => upright.has(p.family) && p.h >= 1);
    assert.equal(asset.colliders.length, solid.length);
    asset.colliders.forEach((c, i) => {
      assert.ok(Math.abs(c.bottom - solid[i]!.y) < 1e-9);
      assert.ok(Math.abs(c.top - (solid[i]!.y + solid[i]!.h)) < 1e-9);
    });
    // Packed snow and the launch deck are floor, not walls. The old all-piece
    // collider set marked 170/179 ride stations as blocked.
    for (const family of ['chute', 'deck'] as const) {
      const floor = asset.pieces.find(p => p.family === family)!;
      assert.equal(asset.blocked(floor.east, floor.north, floor.y + .05, .27, 1.8), false,
        `${family} is the riding surface, not a blocker`);
    }
    const post = solid.find(p => p.family === 'rail')!;
    assert.equal(asset.blocked(post.east, post.north, post.y + Math.min(.05, post.h / 2), .01, .05), true);
    assert.equal(asset.blocked(0, 0, 0), false);
  } finally { asset.dispose(); }
});

test('one 16px nearest Lambert batch, zero lights, idempotent dispose', () => {
  const asset = mountC2EastSled(heightAt);
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
