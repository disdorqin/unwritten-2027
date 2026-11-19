import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Matrix4, type InstancedMesh } from 'three';
import { updateTowerTime } from '../tools/voxel-tavern/town-blockout/clocktower-face.ts';
import { buildTowerLandmark, clocktowerHeight, updateTowerWingVisibility } from '../tools/voxel-tavern/town-blockout/landmark-tower.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { createDailyTowerChime, isTowerCeremonyWindow, towerTime } from '../tools/voxel-tavern/town-blockout/town-clocktower-time.ts';
import { createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

const plot = layout.plots.find(({ id }) => id === 'clocktower')!;
const [east, north, level] = plot.origin;
const at = (date: string) => Date.parse(date + '+08:00');

test('the four exterior faces mirror their geometry and the readout follows Beijing seconds and C2 zero', () => {
  const tower = buildTowerLandmark(plot);
  const hands = tower.getObjectByName('钟楼随时针') as InstancedMesh;
  const board = tower.getObjectByName('钟楼像素时刻牌') as InstancedMesh;
  const faceMatrix = new Matrix4();
  const point = (slot: number) => {
    hands.getMatrixAt(slot, faceMatrix);
    return faceMatrix.elements.slice(12, 15);
  };
  const first = at('2026-11-19T09:00:00');
  assert.deepEqual(towerTime(first, null, false), { hour: Math.PI * 1.5, minute: 0, plate: '09:00:00' });
  updateTowerTime(tower, first, null, false);
  assert.ok(point(6)[0] < 0 && point(6)[2] > 5);
  const partCount = 15 + 22;
  assert.ok(point(6 + 2 * partCount)[0] > 0 && point(6 + 2 * partCount)[2] < -5);
  const halfHour = at('2026-11-19T09:30:00');
  updateTowerTime(tower, halfHour, null, false);
  assert.ok(Math.abs(towerTime(halfHour, null, false).minute - Math.PI) < 1e-9);
  assert.ok(point(20)[1] < clocktowerHeight(65));
  const version = hands.instanceMatrix.version;
  updateTowerTime(tower, halfHour + 650, null, false);
  assert.equal(hands.instanceMatrix.version, version);
  const midnight = at('2027-01-01T00:00:00');
  updateTowerTime(tower, midnight - 850, .85, false);
  assert.equal(towerTime(midnight - 850, .85, false).plate, '00:00:01');
  const digitVersion = board.instanceMatrix.version;
  updateTowerTime(tower, midnight, null, true);
  assert.equal(towerTime(midnight, null, true).plate, '00:00:00');
  assert.ok(board.count > 50);
  assert.ok(board.instanceMatrix.version > digitVersion);
});

test('ordinary Beijing hours dispatch three chimes, respect night mute and cannot double C2', () => {
  const run = createDailyTowerChime();
  const midnight = at('2027-01-01T00:00:00');
  const sample = (date: string) => {
    const now = at(date);
    return run(now, isTowerCeremonyWindow(now, midnight));
  };
  assert.equal(sample('2026-12-30T07:00:20'), undefined);
  assert.equal(sample('2026-12-30T08:00:00')?.strikes, 3);
  assert.equal(sample('2026-12-30T08:00:00'), undefined);
  assert.equal(sample('2026-12-30T17:00:00')?.audible, true);
  assert.equal(sample('2026-12-30T23:00:00')?.audible, false);
  assert.equal(sample('2026-12-31T19:00:00'), undefined);
  assert.equal(sample('2026-12-31T23:00:00'), undefined);
  assert.equal(sample('2027-01-01T00:00:00'), undefined);
  assert.equal(sample('2027-01-01T01:00:00')?.audible, false);
  assert.equal(sample('2027-01-01T07:00:00')?.audible, true);
});

function walk(targets: readonly (readonly [number, number])[], tower: Group) {
  const grid = createTerrainGrid();
  const { colliders, floors } = readWalkGeometry(tower);
  const hit = (x: number, z: number, cell: Box) =>
    Math.hypot(Math.max(cell.min[0] - x, 0, x - cell.max[0]), Math.max(cell.min[2] - z, 0, z - cell.max[2])) < .27;
  let [x, z] = targets[0];
  let y = grid.heightAt(east + x, north - z);
  let count = 0;
  for (const [destX, destZ] of targets.slice(1)) {
    const fromX = x, fromZ = z;
    const limit = Math.ceil(Math.hypot(destX - fromX, destZ - fromZ) / .08);
    for (let step = 1; step <= limit; step++) {
      x = fromX + (destX - fromX) * step / limit;
      z = fromZ + (destZ - fromZ) * step / limit;
      const e = east + x, b = z - north;
      const base = grid.heightAt(e, -b);
      const next = floors.reduce((support, floor) =>
        floor.max[1] <= y + .43 && hit(e, b, floor) ? Math.max(support, floor.max[1]) : support, base);
      const obstruction = [...colliders, ...floors].find(solid =>
        next + .025 < solid.max[1] && next + 1.775 > solid.min[1] && hit(e, b, solid));
      assert.ok(!obstruction, `blocked at local ${x.toFixed(3)},${z.toFixed(3)} floor ${next.toFixed(4)} ${JSON.stringify(obstruction)}`);
      assert.ok(Math.abs(y - next) <= .43 + 1e-9, `height gap at ${x},${z} ${y}->${next}`);
      y = next;
      count++;
    }
  }
  return { y, count };
}

test('the plaza entrance leads to both wings and a continuous east stair', () => {
  const tower = buildTowerLandmark(plot);
  tower.position.set(east, level, -north);
  const west = walk([[0, 11], [0, 6.4], [0, 0], [-12.9, 0], [-12.9, -3.8], [-10.9,-3.8]], tower);
  assert.equal(west.y, level + .3125);
  const eastRoute = [[0,11], [0,6.4], [0,-3], [4.65,-3], [4.65,0], [6.65,0], [6.65,4.48], [7.4,4.48], [14.45,4.48], [14.45,-4.48], [7.4,-4.48], [7.4,4.48], [7.4,5.6], [15.2,5.6]] as const;
  const stair = walk(eastRoute, tower);
  assert.equal(stair.y, level + clocktowerHeight(11.25));
  updateTowerWingVisibility(tower, 224, 188, 13.7);
  assert.equal(tower.getObjectByName('Clocktower · west exhibition')?.visible, false);
  assert.equal(tower.getObjectByName('Clocktower · east stair and overlook')?.visible, false);
  updateTowerWingVisibility(tower, 215, 222, level + 1.7);
  assert.equal(tower.getObjectByName('Clocktower · west exhibition')?.visible, true);
  assert.equal(tower.getObjectByName('Clocktower · east stair and overlook')?.visible, false);
});
