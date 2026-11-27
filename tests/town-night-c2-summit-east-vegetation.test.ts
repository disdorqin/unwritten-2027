import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  c2EastVegetationSpec, mountC2EastVegetation, planC2EastVegetation,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-vegetation.ts';

const block = createMainSummitBlock(mainSummitLayout, 348, 8);
const heightAt = block.heightAt;

test('vegetation stays in the east sector and above the D2 cloud-band forest', () => {
  const pieces = planC2EastVegetation(heightAt);
  assert.ok(pieces.length > 200, `expected a real east forest, got ${pieces.length}`);
  for (const p of pieces) {
    assert.ok(p.east >= c2EastVegetationSpec.sectorWest);
    assert.ok(p.north >= c2EastVegetationSpec.sectorSouth);
    const ground = heightAt(p.east, p.north)!;
    assert.ok(ground >= c2EastVegetationSpec.minHeight && ground <= c2EastVegetationSpec.maxHeight);
    assert.ok(Math.abs(p.y - ground) < 1e-9);
    assert.ok(Math.hypot(p.east - c2EastVegetationSpec.shoulder.east,
      p.north - c2EastVegetationSpec.shoulder.north) <= c2EastVegetationSpec.shoulder.radius);
  }
});

test('all four height/slope bands are represented', () => {
  const asset = mountC2EastVegetation(heightAt);
  try {
    const stats = asset.stats();
    assert.ok(stats.pine > 20 && stats.flagpine > 20 && stats.shrub > 10 && stats.rock > 0,
      JSON.stringify(stats));
    assert.equal(stats.batches, 1);
    assert.equal(stats.lights, 0);
  } finally { asset.dispose(); }
});

test('camp deck and D2 sites stay clear', () => {
  for (const p of planC2EastVegetation(heightAt)) {
    for (const site of c2EastVegetationSpec.clear) {
      assert.ok(Math.hypot(p.east - site.east, p.north - site.north) > site.radius,
        `vegetation at ${p.east},${p.north} crowds ${site.east},${site.north}`);
    }
  }
});

test('visible instances share authored bottoms and only trunks/rocks collide', () => {
  const asset = mountC2EastVegetation(heightAt);
  try {
    assert.equal(asset.mesh.count, asset.pieces.length);
    const m = asset.mesh.instanceMatrix.array;
    asset.pieces.forEach((p, i) => {
      const o = i * 16;
      assert.ok(Math.abs(m[o + 12] - p.east) < 1e-4);
      assert.ok(Math.abs(m[o + 13] - (p.y + p.h / 2)) < 1e-4);
      assert.ok(Math.abs(m[o + 14] + p.north) < 1e-4);
    });
    const tree = asset.pieces.find(p => p.kind === 'pine')!;
    assert.equal(asset.blocked(tree.east, tree.north, tree.y + .5, .01, .05), true);
    const shrub = asset.pieces.find(p => p.kind === 'shrub');
    if (shrub) assert.equal(asset.blocked(shrub.east, shrub.north, shrub.y + .5, .01, .05), false);
  } finally { asset.dispose(); }
});

test('one 16px nearest Lambert batch, zero lights, idempotent dispose', () => {
  const asset = mountC2EastVegetation(heightAt);
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
