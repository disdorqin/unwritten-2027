import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import { mountProductionRidge } from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';

/**
 * C32-1: A's `preparePublicFrontCable` on the real production-ridge owner.
 *
 * The installer is B's real one, the obstacles are the real mounted meshes
 * plus this host's own colliders, and the route gate walks the actual ground.
 * The test therefore asserts the *contract* in both directions instead of
 * pretending certification always succeeds: a rejection must name its reason,
 * keep the closed facility and leave transportReady false; a success must
 * satisfy every check A's binding performs.
 */

const grid = createTerrainGrid();
const root = new Group();
const railway = createTownRailway(grid, () => 0);
const branch = buildCraterRailExtension(grid,
  mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north)), railway.route.points);
root.add(railway.group, branch.group);
const ridge = mountProductionRidge(root, grid, { loop: railway.route.points, branch: branch.samples });

const authority = {
  state: () => undefined,
  now: () => undefined,
  daylight: () => undefined,
  firstRun: { wokeAt: () => undefined, openedAt: () => undefined, dawnEpoch: () => undefined },
};

/** Exactly what A's readA31FrontCable refuses unless every field is real. */
function aAcceptance(owner: {
  transportReady: boolean;
  facilities?: unknown;
  frontOperation?: { ready: boolean; service: { physical: boolean }; facilities: { group: { parent: unknown } } };
  frontRepair?: { surfaceAt: unknown; clear: unknown; anchors?: Record<string, { east: number; north: number }> };
}) {
  const op = owner.frontOperation, repair = owner.frontRepair;
  if (!owner.transportReady || !op?.ready || !op.service.physical) return false;
  if (owner.facilities !== op.facilities) return false;
  if (!op.facilities.group.parent) return false;
  if (!repair || typeof repair.surfaceAt !== 'function' || typeof repair.clear !== 'function') return false;
  for (const key of ['brake', 'cableWheel', 'weightTower', 'weightFrame'] as const) {
    const anchor = repair.anchors?.[key];
    if (!anchor || !Number.isFinite(anchor.east) || !Number.isFinite(anchor.north)) return false;
  }
  return true;
}

test('the front owner starts closed: no open facility, no transport, no A acceptance', () => {
  assert.equal(ridge.stationReady, true);
  assert.equal(ridge.serviceExit, true);
  assert.ok(ridge.facilities, 'a closed facility exists to be replaced');
  assert.equal(ridge.transportReady, false);
  assert.equal(ridge.frontOperation, undefined);
  assert.equal(ridge.frontRepair, undefined);
  assert.equal(aAcceptance(ridge), false, 'A must not accept a closed front line');
  assert.ok(ridge.facilities!.group.getObjectByName('ridge-cable-parked-car-batch'),
    'the closed instance is the parked-car variant');
});

test('preparePublicFrontCable runs the real installer and never half-swaps', async () => {
  const closedGroup = ridge.facilities!.group;
  const before = root.children.length;
  const prepared = await ridge.preparePublicFrontCable(authority);
  if (!prepared) {
    // An honest refusal: name it, keep the closed instance, grant nothing.
    assert.equal(typeof ridge.frontCablePrepareResult, 'string');
    assert.ok(ridge.frontCablePrepareResult!.length > 0);
    assert.equal(ridge.transportReady, false);
    assert.equal(ridge.frontOperation, undefined);
    assert.equal(ridge.facilities!.group, closedGroup, 'the closed facility must not be detached on failure');
    assert.equal(closedGroup.parent, root);
    assert.equal(root.children.length, before, 'no stray second facility was left behind');
    assert.equal(aAcceptance(ridge), false);
    return;
  }
  // Success: exactly one facility, the one A will read, under the same parent.
  assert.equal(ridge.transportReady, true);
  assert.ok(ridge.frontOperation?.ready);
  assert.ok(ridge.frontOperation!.service.physical, 'A requires a physically certified service');
  assert.equal(ridge.facilities, ridge.frontOperation!.facilities, 'A compares owner.facilities by identity');
  assert.equal(ridge.facilities!.group.parent, root);
  assert.equal(closedGroup.parent, null, 'the closed instance is disposed by the installer');
  assert.ok(root.children.filter(child => child === ridge.facilities!.group).length === 1);
  assert.equal(aAcceptance(ridge), true, 'A acceptance must hold after a certified swap');
  assert.equal(root.getObjectByName('ridge-cable-parked-car-batch'), undefined);
  assert.ok(root.getObjectByName('ridge-cable-moving-car-batch'), 'the moving batch is the open variant');
  // The repair hand and the dock support come from the same certified surface.
  assert.equal(typeof ridge.frontRepair!.surfaceAt(ridge.frontRepair!.anchors.brake.east,
    ridge.frontRepair!.anchors.brake.north), 'number');
});

test('a second prepare is refused instead of replacing the operating facility again', async () => {
  const second = await ridge.preparePublicFrontCable(authority);
  if (ridge.transportReady) {
    assert.equal(second, true, 'already open is idempotent');
    assert.equal(ridge.frontOperation?.ready, true);
  } else {
    assert.equal(second, false);
  }
});

test('dispose releases the facility and clears every A-facing getter', () => {
  ridge.dispose();
  assert.equal(ridge.transportReady, false);
  assert.equal(ridge.facilities, undefined);
  assert.equal(ridge.frontRepair, undefined);
  assert.equal(root.getObjectByName('d-r30-front-cable-facilities'), undefined);
});
