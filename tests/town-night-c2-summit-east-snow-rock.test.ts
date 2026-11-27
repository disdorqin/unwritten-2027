import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  c2EastSnowRockSpec, mountC2EastSnowRock, planC2EastSnowRock,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-snow-rock.ts';

const arrivalHeight = 348;
const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 8);
const heightAt = block.heightAt;

test('snow-rock group adds snow-landform furniture on the canonical field only', () => {
  assert.ok(mainSummitBounds.east >= 760 && mainSummitBounds.north >= 990);
  assert.ok(heightAt(c2EastSnowRockSpec.cluster.east, c2EastSnowRockSpec.cluster.north) !== undefined, 'cluster needs canonical ground');
  const pieces = planC2EastSnowRock(heightAt);
  assert.ok(pieces.length >= 10, `expected a real snow-rock group, got ${pieces.length}`);
  assert.ok(pieces.some(p => p.family === 'rock'));
  assert.ok(pieces.some(p => p.family === 'icefall'));
  assert.ok(pieces.some(p => p.family === 'ledge'));
});

test('every piece stays in the east sector and converges inside the shared 32 m boundary', () => {
  for (const piece of planC2EastSnowRock(heightAt)) {
    assert.ok(piece.east >= c2EastSnowRockSpec.sectorWest, `west leak at ${piece.east}`);
    assert.ok(piece.north >= c2EastSnowRockSpec.sectorSouth, `south leak at ${piece.north}`);
    assert.ok(piece.east - c2EastSnowRockSpec.sectorWest >= c2EastSnowRockSpec.boundary - 1e-9);
    assert.ok(piece.north - c2EastSnowRockSpec.sectorSouth >= c2EastSnowRockSpec.boundary - 1e-9);
  }
});

test('existing D2 sites are not rebuilt', () => {
  for (const piece of planC2EastSnowRock(heightAt)) {
    for (const site of c2EastSnowRockSpec.reserved) {
      const d = Math.hypot(piece.east - site.east, piece.north - site.north);
      assert.ok(d >= site.radius + 2, `piece at ${piece.east},${piece.north} crowds reserved site ${site.east},${site.north}`);
    }
  }
});

test('all pieces seat on the sampled surface and never bury into the ground', () => {
  for (const piece of planC2EastSnowRock(heightAt)) {
    const sampled = heightAt(piece.east, piece.north);
    assert.equal(sampled !== undefined, true);
    assert.ok(piece.y >= sampled! - 1e-9, `piece at ${piece.east},${piece.north} buries below ground`);
    assert.ok(piece.h > 0 && piece.w > 0 && piece.d > 0);
    if (piece.family === 'icefall') {
      // Ice falls ride a boulder's top: base above ground, bounded height.
      assert.ok(piece.y - sampled! >= 2 - 1e-9, `icefall at ${piece.east},${piece.north} floats below a rock top`);
      assert.ok(piece.y - sampled! <= 5 + 1e-9, `icefall at ${piece.east},${piece.north} floats too high above ground`);
    } else {
      // Rocks and ledges seat exactly on the ground.
      assert.ok(piece.y - sampled! < 1e-9, `piece at ${piece.east},${piece.north} does not seat on ground`);
    }
  }
});

test('visible instances and collider share the same boxes, bottom and height', () => {
  const asset = mountC2EastSnowRock(heightAt);
  try {
    assert.equal(asset.mesh.count, asset.pieces.length);
    assert.equal(asset.colliders.length, asset.pieces.length);
    const m = asset.mesh.instanceMatrix.array;
    asset.pieces.forEach((p, i) => {
      const o = i * 16;
      assert.ok(Math.abs(m[o + 12] - p.east) < 1e-4);
      assert.ok(Math.abs(m[o + 13] - (p.y + p.h / 2)) < 1e-4, 'box origin must be the authored bottom');
      assert.ok(Math.abs(m[o + 14] + p.north) < 1e-4);
      assert.ok(Math.abs(asset.colliders[i]!.bottom - p.y) < 1e-9);
      assert.ok(Math.abs(asset.colliders[i]!.top - (p.y + p.h)) < 1e-9);
      assert.equal(asset.blocked(p.east, p.north, p.y + Math.min(.05, p.h / 2), .01, .05), true);
    });
    assert.equal(asset.blocked(0, 0, 0), false, 'nothing may be built outside the east sector');
  } finally { asset.dispose(); }
});

test('one 16px nearest Lambert batch and no new lights', () => {
  const asset = mountC2EastSnowRock(heightAt);
  try {
    assert.equal(asset.stats().batches, 1);
    assert.equal(asset.stats().lights, 0);
    const map = (asset.mesh.material as { map?: { image?: { width: number; height: number }; magFilter: number } }).map!;
    assert.equal(map.image!.width, 16);
    assert.equal(map.image!.height, 16);
    assert.equal(map.magFilter, 1003, 'NearestFilter');
    assert.equal(asset.group.children.length, 1);
  } finally { asset.dispose(); }
});

test('dispose is idempotent and detaches the group', () => {
  const asset = mountC2EastSnowRock(heightAt);
  const parent = new Group();
  parent.add(asset.group);
  assert.equal(asset.group.parent, parent);
  asset.dispose();
  asset.dispose();
  assert.equal(asset.group.parent, null);
});
