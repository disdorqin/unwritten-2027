import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import { mountProductionRidge } from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import { c2FrontSeamSpec, mountC2FrontSeam, planC2FrontSeam } from '../tools/voxel-tavern/town-blockout/town-night-c2-front-seam';

/**
 * C32 seam apron, on the ownership A relayed: C2 gives real front-ridge
 * support and collision from the cloud terrace to N666.5 and owns the
 * controllable opening at the existing N663.25 barrier; D2 owns N666.5..669
 * and A the N668 same-foot crossing and Presence. The barrier only ever
 * opens after the same foot is certified on both sides.
 */
const grid = createTerrainGrid();
const root = new Group();
const railway = createTownRailway(grid, () => 0);
const branch = buildCraterRailExtension(grid,
  mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north)), railway.route.points);
root.add(railway.group, branch.group);
const ridge = mountProductionRidge(root, grid, { loop: railway.route.points, branch: branch.samples });
const heightAt = (east: number, north: number) => ridge.field.heightAt(east, north);

test('the apron reaches N666.5 on the live 347 m plateau and stays inside tolerance', () => {
  const plan = planC2FrontSeam(heightAt);
  assert.equal(plan.supported, true, `max deviation ${plan.maxDeviation}`);
  assert.ok(plan.maxDeviation <= c2FrontSeamSpec.supportTolerance, `deviation ${plan.maxDeviation}`);
  assert.ok(Math.abs(plan.metres - 3.25) < 1e-9);
  assert.ok(plan.width >= 2.5, `net width ${plan.width}`);
  const apron = plan.pieces.filter(piece => piece.family === 'apron');
  assert.ok(apron.length >= 7, `apron stations ${apron.length}`);
  for (const piece of apron) {
    const face = heightAt(piece.east, piece.north);
    assert.ok(face !== undefined);
    assert.ok(Math.abs(piece.y - face!) < 1e-9, 'the apron sits on the live ground');
    assert.ok(Math.abs(piece.y - c2FrontSeamSpec.deckHeight) <= c2FrontSeamSpec.supportTolerance);
  }
  const contact = plan.contacts.find(entry => entry.role === 'c2')!;
  assert.ok(Math.abs(contact.north - 666.5) < 1e-9);
  assert.ok(Math.abs(contact.height - c2FrontSeamSpec.deckHeight) <= c2FrontSeamSpec.supportTolerance);
});

test('the barrier blocks while closed, clears when opened, and can close again', () => {
  const asset = mountC2FrontSeam(heightAt);
  try {
    const spec = c2FrontSeamSpec;
    assert.equal(asset.closed(), true, 'a barrier that starts open grants passage it never certified');
    assert.equal(asset.blocked(spec.east, spec.seamNorth, spec.deckHeight), true);
    assert.equal(asset.blocked(spec.east, spec.seamNorth + 2, spec.deckHeight), false, 'the apron itself is walkable');
    const closedPieces = asset.stats().pieces;
    asset.open();
    assert.equal(asset.closed(), false);
    assert.equal(asset.blocked(spec.east, spec.seamNorth, spec.deckHeight), false, 'an open barrier does not block');
    assert.ok(asset.stats().pieces < closedPieces, 'the bar instance is removed, not just hidden');
    asset.close();
    assert.equal(asset.blocked(spec.east, spec.seamNorth, spec.deckHeight), true);
    assert.equal(asset.stats().pieces, closedPieces);
  } finally {
    asset.dispose();
  }
});

test('the seam reports the same foot for C2, D2 and A instead of three surveys', () => {
  const plan = planC2FrontSeam(heightAt);
  assert.equal(plan.contacts.length, 3);
  for (const contact of plan.contacts) {
    assert.equal(contact.east, c2FrontSeamSpec.east);
    assert.equal(contact.north, c2FrontSeamSpec.contactNorth);
  }
  const heights = new Set(plan.contacts.map(contact => contact.height));
  assert.equal(heights.size, 1, 'all three roles must agree on the same foot height');
});

test('a seam with no ground or a broken deck is refused, never silently flattened', () => {
  const broken = planC2FrontSeam(() => undefined);
  assert.equal(broken.supported, false);
  const offset = planC2FrontSeam((east, north) => heightAt(east, north)! + 1.2);
  assert.equal(offset.supported, false, 'a metre of drift is not inside the 0.08 m contract');
});
