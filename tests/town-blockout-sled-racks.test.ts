import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { createTownSledVisuals, sledParts } from '../tools/voxel-tavern/town-blockout/sled-visuals';
import { canEnter, createTerrainGrid, isWater, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { resolveTownSledRacks, townSledRackMissingSites } from '../tools/voxel-tavern/town-blockout/town-sled-racks';
import {
  createZa22CloudRoute, createZa22NorthRidgeLine, za22CloudSurfaceAt, za22StationApproach,
} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';
import { mountWestCraterRoad, permitsMeteorCraterStep } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

test('sled rack configurations resolve on the surveyed town, west approach and summit surfaces', () => {
  const terrain = createTerrainGrid();
  const crater = mountWestCraterRoad(worldBounds.depth, north => terrain.heightAt(0, north));
  const town = resolveTownSledRacks('town', (east, north) => {
    if (east < 0) return crater.heightAt(east, north);
    if (canEnter(east, north) && !isWater(east, north)) return terrain.heightAt(east, north);
  }, crater.lip);
  let now = Date.UTC(2026, 0, 1);
  const cloud = createZa22CloudRoute({ now: () => now, nightOpen: () => true, enterOrExit() {}, view() {} });
  cloud.action(za22StationApproach)?.run();
  cloud.update(za22StationApproach);
  assert.equal(cloud.riding(), true);
  now += createZa22NorthRidgeLine(26).legMs + 1;
  cloud.update(za22StationApproach);
  assert.ok(cloud.assembly());
  const summit = resolveTownSledRacks('summit', (east, north) => {
    const y = cloud.surfaceAt(east, north, .27);
    return y !== undefined && !cloud.blocked(east, north, y, .27, 1.8) ? y : undefined;
  });
  assert.deepEqual(town.map(({ id }) => id), [
    'plaza', 'cable-base', 'mirror-lake', 'pine-chop', 'station', 'tavern', 'ice-palace', 'crater-mouth',
    'north-slope', 'memorial', 'market',
  ]);
  assert.deepEqual(summit.map(({ id, y }) => [id, y]), [['mountain-gate', 347], ['cloud-terrace', 347]]);
  assert.equal(summit[0].x, 295.5);
  for (const { id, x, n } of town) {
    if (id !== 'crater-mouth') continue;
    assert.equal(permitsMeteorCraterStep({ east: 0, north: n }, { east: x, north: n }, false), true);
  }
  assert.deepEqual(townSledRackMissingSites, ['old-home', 'town-hall']);
});

test('racks skip their primary pad if the vehicle footprint has no safe support', () => {
  const blockedPrimary = resolveTownSledRacks('summit', (east, north) => {
    if (Math.hypot(east - 333, north - 660.6) < .3) return;
    return za22CloudSurfaceAt(east, north);
  });
  const terrace = blockedPrimary.find(({ id }) => id === 'cloud-terrace');
  assert.equal(terrace?.x, 331);
  const noFooting = resolveTownSledRacks('summit', () => 12 + Number.NaN);
  assert.deepEqual(noFooting, []);
});

test('a taken sled can park away from the rack with its original rack poles intact', () => {
  const scene = new Scene();
  const first = { id: 'a', x: 30, n: 42, y: 8, yaw: 0 };
  const second = { id: 'b', x: 39, n: 42, y: 8, yaw: 0 };
  const visuals = createTownSledVisuals(scene, [first, second]);
  const racks = scene.getObjectByName('town-sled-racks') as InstancedMesh;
  const matrices = () => Array.from({ length: racks.count }, (_, index) => {
    const matrix = new Matrix4();
    racks.getMatrixAt(index, matrix);
    return matrix;
  });
  const before = matrices();
  assert.equal(before.length, 2 * (4 + sledParts.length));

  visuals.setRackVehicle('a');
  const afterTake = matrices();
  assert.equal(afterTake.length, before.length - sledParts.length);
  assert.deepEqual(afterTake.slice(0, 4), before.slice(0, 4));
  assert.deepEqual(afterTake.slice(4), before.slice(4 + sledParts.length));

  const parked = { x: 90, n: 87, y: 12, yaw: Math.PI / 2 };
  visuals.setRackVehicle('a', parked);
  const afterPark = matrices();
  assert.equal(afterPark.length, before.length);
  assert.deepEqual(afterPark.slice(0, 4), before.slice(0, 4));
  assert.deepEqual(afterPark.slice(4 + sledParts.length), before.slice(4 + sledParts.length));
  const runner = new Vector3().setFromMatrixPosition(afterPark[4]);
  assert.ok(Math.hypot(runner.x - parked.x, runner.z + parked.n) < 1);
  assert.ok(runner.y > parked.y);
  visuals.setRackVehicle('a');
  assert.deepEqual(matrices(), afterTake);
});
