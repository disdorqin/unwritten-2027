import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  c2EastSummitRockSpec, mountC2EastSummitRock, planC2EastSummitRock,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-summit-rock.ts';

const arrivalHeight = 348;
const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 8);
const heightAt = block.heightAt;

test('summit rock consumes the canonical summit sampler and adds visible rock furniture only', () => {
  assert.ok(mainSummitBounds.east >= 520 && mainSummitBounds.north >= 722);
  // The east subpeak summit centre must have canonical ground so the rock seats.
  assert.ok(Math.abs((heightAt(590, 1080) ?? -1) - 610) < 1e-9, 'subpeak summit needs canonical ground at 610');
  const pieces = planC2EastSummitRock(heightAt);
  assert.ok(pieces.length > 20, `expected a real summit rock, got ${pieces.length}`);
  assert.ok(pieces.some(p => p.family === 'platform'));
  assert.ok(pieces.some(p => p.family === 'rail'));
  assert.ok(pieces.some(p => p.family === 'marker'));
  assert.ok(pieces.some(p => p.family === 'step'));
});

test('every piece stays in the east sector and converges inside the shared 32 m boundary', () => {
  for (const piece of planC2EastSummitRock(heightAt)) {
    assert.ok(piece.east >= c2EastSummitRockSpec.sectorWest, `west leak at ${piece.east}`);
    assert.ok(piece.north >= c2EastSummitRockSpec.sectorSouth, `south leak at ${piece.north}`);
    assert.ok(piece.east - c2EastSummitRockSpec.sectorWest >= c2EastSummitRockSpec.boundary - 1e-9);
    assert.ok(piece.north - c2EastSummitRockSpec.sectorSouth >= c2EastSummitRockSpec.boundary - 1e-9);
  }
});

test('existing D2 sites are not rebuilt', () => {
  for (const piece of planC2EastSummitRock(heightAt)) {
    for (const site of c2EastSummitRockSpec.reserved) {
      const d = Math.hypot(piece.east - site.east, piece.north - site.north);
      assert.ok(d >= site.radius + 2, `piece at ${piece.east},${piece.north} crowds reserved site ${site.east},${site.north}`);
    }
  }
});

test('all pieces seat on the sampled surface and never bury into the ground', () => {
  for (const piece of planC2EastSummitRock(heightAt)) {
    const sampled = heightAt(piece.east, piece.north);
    assert.equal(sampled !== undefined, true);
    // Base pieces sit exactly on the surface; the guard crossbar rides above
    // it. None may embed below the sampled ground.
    assert.ok(piece.y >= sampled! - 1e-9, `piece at ${piece.east},${piece.north} buries below ground`);
    assert.ok(piece.y - sampled! < 2, `piece floats too high above ground`);
    assert.ok(piece.h > 0 && piece.w > 0 && piece.d > 0);
  }
});

test('visible instances and collider share the same boxes, bottom and height', () => {
  const asset = mountC2EastSummitRock(heightAt);
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
  const asset = mountC2EastSummitRock(heightAt);
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
  const asset = mountC2EastSummitRock(heightAt);
  const parent = new Group();
  parent.add(asset.group);
  assert.equal(asset.group.parent, parent);
  asset.dispose();
  asset.dispose();
  assert.equal(asset.group.parent, null);
});
