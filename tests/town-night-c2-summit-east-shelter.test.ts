import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  c2EastShelterSpec, mountC2EastShelter, planC2EastShelter, shelterDeckDatum,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-shelter.ts';

const block = createMainSummitBlock(mainSummitLayout, 348, 8);
const heightAt = block.heightAt;

test('shelter is founded on the one canonical field, never a second terrain authority', () => {
  const deck = shelterDeckDatum(heightAt);
  assert.equal(typeof deck, 'number');
  assert.ok(deck! > 400 && deck! < 700);
  const c = c2EastShelterSpec.centre;
  // The deck must sit above every sampled corner, otherwise a footing would
  // be buried and the floor would read as a floating slab.
  for (const de of [-7, 0, 7]) for (const dn of [-7, 0, 7]) {
    const ground = heightAt(c.east + de, c.north + dn)!;
    assert.ok(deck! > ground);
  }
});

test('shelter plan has a real deck, shell, hearth and interior furnish', () => {
  const pieces = planC2EastShelter(heightAt);
  const asset = mountC2EastShelter(heightAt);
  const stats = asset.stats();
  try {
    assert.ok(pieces.length > 50, `expected a real shelter, got ${pieces.length}`);
    assert.ok(stats.plinth >= 16, 'the deck needs stacked masonry footings');
    assert.ok(stats.wall >= 5, 'the shell needs back, jambs and south walls');
    assert.ok(stats.roof >= 1);
    assert.ok(stats.hearth >= 9, 'hearth ring plus ember');
    assert.ok(stats.furnish >= 5, 'benches, shelf, bed, pot, lamp');
    assert.equal(stats.batches, 1);
    assert.equal(stats.lights, 0);
  } finally { asset.dispose(); }
});

test('every footing reaches the sampled ground and no piece escapes the sector', () => {
  const pieces = planC2EastShelter(heightAt);
  const datum = shelterDeckDatum(heightAt)!;
  for (const p of pieces) {
    assert.ok(p.east >= c2EastShelterSpec.sectorWest && p.north >= c2EastShelterSpec.sectorSouth);
    const ground = heightAt(p.east, p.north);
    assert.notEqual(ground, undefined);
    // Masonry courses are sunk 4 m below ground so the deck reads as a stone
    // shoulder; wall/roof/hearth/furnish ride the deck top.
    assert.ok(p.y + 1e-9 >= Math.min(ground! - 4, datum));
    for (const site of c2EastShelterSpec.reserved) {
      assert.ok(Math.hypot(p.east - site.east, p.north - site.north) >= site.radius + 2,
        `piece at ${p.east},${p.north} crowds reserved site ${site.east}`);
    }
  }
  const courses = pieces.filter(p => p.family === 'plinth' && p.y < datum - .2);
  assert.ok(courses.length >= 16, 'the deck needs stacked masonry courses on the slope');
  for (const course of courses) {
    assert.ok(course.y >= heightAt(course.east, course.north)! - 4 - 1e-9);
    assert.ok(course.y + course.h <= datum + 1e-9);
  }
  const baseCells = new Set(courses.map(p => `${p.east},${p.north}`));
  assert.ok(baseCells.size >= 8);
  for (const key of baseCells) {
    const stack = courses.filter(p => `${p.east},${p.north}` === key);
    assert.ok(stack.length >= 2);
    assert.ok(Math.min(...stack.map(p => p.y)) < heightAt(stack[0]!.east, stack[0]!.north)!,
      `stack ${key} must have a buried footing`);
  }
});

test('interior furnish sits on the deck top and never buries into the ground', () => {
  const datum = shelterDeckDatum(heightAt)!;
  for (const p of planC2EastShelter(heightAt)) {
    if (p.family === 'plinth') continue; // footings are intentionally buried
    const sampled = heightAt(p.east, p.north)!;
    // Shell and interior ride the deck datum, which is above the raw ground.
    assert.ok(p.y >= sampled - 1e-9, `piece at ${p.east},${p.north} buries below ground`);
    assert.ok(Math.abs(p.y - datum) < 1e-9 || p.y > datum, 'furnish must sit on or above the deck top');
  }
});

test('visible instances use authored bottoms and colliders cover the same bodies', () => {
  const asset = mountC2EastShelter(heightAt);
  try {
    assert.equal(asset.mesh.count, asset.pieces.length);
    assert.equal(asset.colliders.length, asset.pieces.length);
    const m = asset.mesh.instanceMatrix.array;
    asset.pieces.forEach((p, i) => {
      const o = i * 16;
      assert.ok(Math.abs(m[o + 12] - p.east) < 1e-4);
      assert.ok(Math.abs(m[o + 13] - (p.y + p.h / 2)) < 1e-4, 'bottom semantics');
      assert.ok(Math.abs(m[o + 14] + p.north) < 1e-4);
      assert.ok(Math.abs(asset.colliders[i]!.bottom - p.y) < 1e-9);
      assert.ok(Math.abs(asset.colliders[i]!.top - (p.y + p.h)) < 1e-9);
    });
    const wall = asset.pieces.find(p => p.family === 'wall')!;
    assert.equal(asset.blocked(wall.east, wall.north, wall.y + .5, .01, .05), true);
    assert.equal(asset.blocked(0, 0, 0), false);
  } finally { asset.dispose(); }
});

test('one 16px nearest Lambert batch, zero lights, idempotent dispose', () => {
  const asset = mountC2EastShelter(heightAt);
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
