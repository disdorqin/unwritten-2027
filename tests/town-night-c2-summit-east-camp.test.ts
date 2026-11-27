import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  campDeckDatum, c2EastCampSpec, mountC2EastCamp, planC2EastCamp,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-camp.ts';

const block = createMainSummitBlock(mainSummitLayout, 348, 8);
const heightAt = block.heightAt;

test('camp is founded on the one canonical field, never a second terrain authority', () => {
  const deck = campDeckDatum(heightAt);
  assert.equal(typeof deck, 'number');
  assert.ok(deck! > 400 && deck! < 700);
  const c = c2EastCampSpec.centre;
  // The deck must sit above every sampled corner, otherwise a support would
  // be buried and the floor would read as a floating slab.
  for (const de of [-8, 0, 8]) for (const dn of [-8, 0, 8]) {
    const ground = heightAt(c.east + de, c.north + dn)!;
    assert.ok(deck! > ground);
  }
});

test('camp plan has a real deck, hut, hearth and wind mast', () => {
  const pieces = planC2EastCamp(heightAt);
  const asset = mountC2EastCamp(heightAt);
  const stats = asset.stats();
  try {
    assert.ok(pieces.length > 30, `expected a real camp, got ${pieces.length}`);
    assert.ok(stats.hut >= 5 && stats.fire >= 9 && stats.flag >= 3);
    assert.equal(stats.batches, 1);
    assert.equal(stats.lights, 0);
  } finally { asset.dispose(); }
});

test('every support reaches the sampled ground and no piece escapes the sector', () => {
  const pieces = planC2EastCamp(heightAt);
  for (const p of pieces) {
    assert.ok(p.east >= c2EastCampSpec.sectorWest && p.north >= c2EastCampSpec.sectorSouth);
    const ground = heightAt(p.east, p.north);
    assert.notEqual(ground, undefined);
    // Solid masonry courses are sunk 4 m below the sampled ground so the
    // deck reads as a stone shoulder at every summit LOD.
    assert.ok(p.y + 1e-9 >= Math.min(ground! - 4, campDeckDatum(heightAt)!));
    for (const site of c2EastCampSpec.reserved) {
      assert.ok(Math.hypot(p.east - site.east, p.north - site.north) >= site.radius + 2,
        `piece at ${p.east},${p.north} crowds reserved site ${site.east}`);
    }
  }
  const courses = pieces.filter(p => p.family === 'plinth' && p.y < campDeckDatum(heightAt)! - .2);
  assert.ok(courses.length >= 16, 'the deck needs stacked masonry courses on the steep slope');
  for (const course of courses) {
    // Courses span from below the sampled ground up to the deck; the lowest
    // course of each stack must be buried, the rest may climb above ground.
    assert.ok(course.y >= heightAt(course.east, course.north)! - 4 - 1e-9);
    assert.ok(course.y + course.h <= campDeckDatum(heightAt)! + 1e-9);
  }
  // A solid base means every deck cell has multiple courses, not one stilt.
  const baseCells = new Set(courses.map(p => `${p.east},${p.north}`));
  assert.ok(baseCells.size >= 8);
  for (const key of baseCells) {
    const stack = courses.filter(p => `${p.east},${p.north}` === key);
    assert.ok(stack.length >= 2);
    assert.ok(Math.min(...stack.map(p => p.y)) < heightAt(stack[0]!.east, stack[0]!.north)!,
      `stack ${key} must have a buried footing`);
  }
});

test('visible instances use authored bottoms and colliders cover the same bodies', () => {
  const asset = mountC2EastCamp(heightAt);
  try {
    assert.equal(asset.mesh.count, asset.pieces.length);
    const m = asset.mesh.instanceMatrix.array;
    asset.pieces.forEach((p, i) => {
      const o = i * 16;
      assert.ok(Math.abs(m[o + 12] - p.east) < 1e-4);
      assert.ok(Math.abs(m[o + 13] - (p.y + p.h / 2)) < 1e-4, 'bottom semantics');
      assert.ok(Math.abs(m[o + 14] + p.north) < 1e-4);
    });
    const hut = asset.pieces.find(p => p.family === 'hut')!;
    assert.equal(asset.blocked(hut.east, hut.north, hut.y + .5, .01, .05), true);
    assert.equal(asset.blocked(0, 0, 0), false);
  } finally { asset.dispose(); }
});

test('one 16px nearest Lambert batch, zero lights, idempotent dispose', () => {
  const asset = mountC2EastCamp(heightAt);
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
