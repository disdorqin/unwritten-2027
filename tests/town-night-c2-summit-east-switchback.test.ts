import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import { middleEastNorthControls } from '../tools/voxel-tavern/town-blockout/town-d-r30-upper-roadbed.ts';
import {
  c2EastSwitchbackSpec, mountC2EastSwitchback, planC2EastSwitchback,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-switchback.ts';

const arrivalHeight = 348;
const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 8);
const heightAt = block.heightAt;

test('switchback consumes the authored east centreline and adds visible road furniture only', () => {
  assert.ok(middleEastNorthControls.length > 20, 'expected a dense authored centreline');
  assert.ok(mainSummitBounds.east >= 520 && mainSummitBounds.north >= 722);
  // The centreline midpoint must have canonical ground so the trail can seat.
  assert.ok(heightAt(440, 620) !== undefined, 'centreline midpoint needs canonical ground');
  const pieces = planC2EastSwitchback(heightAt);
  assert.ok(pieces.length > 150, `expected a real switchback trail, got ${pieces.length}`);
  assert.ok(pieces.some(p => p.family === 'paving'));
  assert.ok(pieces.some(p => p.family === 'rail'));
  assert.ok(pieces.some(p => p.family === 'ditch'));
  assert.ok(pieces.some(p => p.family === 'apron'));
});

test('every piece stays in the east sector and converges inside the shared 32 m boundary', () => {
  for (const piece of planC2EastSwitchback(heightAt)) {
    assert.ok(piece.east >= c2EastSwitchbackSpec.sectorWest, `west leak at ${piece.east}`);
    assert.ok(piece.north >= c2EastSwitchbackSpec.sectorSouth, `south leak at ${piece.north}`);
    assert.ok(piece.east - c2EastSwitchbackSpec.sectorWest >= c2EastSwitchbackSpec.boundary - 1e-9);
    assert.ok(piece.north - c2EastSwitchbackSpec.sectorSouth >= c2EastSwitchbackSpec.boundary - 1e-9);
  }
});

test('existing D2 sites are not rebuilt', () => {
  for (const piece of planC2EastSwitchback(heightAt)) {
    for (const site of c2EastSwitchbackSpec.reserved) {
      const d = Math.hypot(piece.east - site.east, piece.north - site.north);
      assert.ok(d >= site.radius + 2, `piece at ${piece.east},${piece.north} crowds reserved site ${site.east},${site.north}`);
    }
  }
});

test('all pieces seat on the sampled surface and never bury into the ground', () => {
  for (const piece of planC2EastSwitchback(heightAt)) {
    const sampled = heightAt(piece.east, piece.north);
    assert.equal(sampled !== undefined, true);
    // Base pieces sit exactly on the surface; the guard-rail crossbar rides
    // above it. None may embed below the sampled ground.
    assert.ok(piece.y >= sampled! - 1e-9, `piece at ${piece.east},${piece.north} buries below ground`);
    assert.ok(piece.y - sampled! < 2, `piece floats too high above ground`);
    assert.ok(piece.h > 0 && piece.w > 0 && piece.d > 0);
  }
});

test('visible instances and collider share the same boxes, bottom and height', () => {
  const asset = mountC2EastSwitchback(heightAt);
  try {
    assert.equal(asset.mesh.count, asset.pieces.length);
    // C33-2: colliders cover only upright rail bodies. Thin paving / snow
    // lip / ditch / apron are floor, not walls, and must never block a walker
    // standing on the road. They remain fully visible instances.
    const solid = asset.pieces.filter(p => p.family === 'rail' && p.h >= 1);
    assert.equal(asset.colliders.length, solid.length);
    const m = asset.mesh.instanceMatrix.array;
    asset.pieces.forEach((p, i) => {
      const o = i * 16;
      assert.ok(Math.abs(m[o + 12] - p.east) < 1e-4);
      assert.ok(Math.abs(m[o + 13] - (p.y + p.h / 2)) < 1e-4, 'box origin must be the authored bottom');
      assert.ok(Math.abs(m[o + 14] + p.north) < 1e-4);
    });
    asset.colliders.forEach((c, i) => {
      const p = solid[i]!;
      assert.ok(Math.abs(c.bottom - p.y) < 1e-9);
      assert.ok(Math.abs(c.top - (p.y + p.h)) < 1e-9);
      assert.equal(asset.blocked(p.east, p.north, p.y + Math.min(.05, p.h / 2), .01, .05), true);
    });
    const floor = asset.pieces.find(p => p.family === 'paving')!;
    assert.equal(asset.blocked(floor.east, floor.north, floor.y + .05, .27, 1.8), false,
      'standing on the road must not report the road itself as a blocker');
    assert.equal(asset.blocked(0, 0, 0), false, 'nothing may be built outside the east sector');
  } finally { asset.dispose(); }
});

test('one 16px nearest Lambert batch and no new lights', () => {
  const asset = mountC2EastSwitchback(heightAt);
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
  const asset = mountC2EastSwitchback(heightAt);
  const parent = new Group();
  parent.add(asset.group);
  assert.equal(asset.group.parent, parent);
  asset.dispose();
  asset.dispose();
  assert.equal(asset.group.parent, null);
});
