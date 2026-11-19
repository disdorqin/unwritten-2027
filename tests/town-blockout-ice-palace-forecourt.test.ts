import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, Matrix4, Vector3 } from 'three';
import {
  buildIcePalaceForecourt, icePalaceForecourt, icePalaceForecourtGrotto, mountIcePalaceForecourt,
} from '../tools/voxel-tavern/town-blockout/ice-palace-forecourt.ts';
import { buildIceCastle } from '../tools/voxel-tavern/town-blockout/landmark-ice-castle.ts';
import { icePalaceMazeBlockGrooves } from '../tools/voxel-tavern/town-blockout/ice-palace-maze.ts';
import { offsetBox, readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { canEnter, createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { railPlatforms } from '../tools/voxel-tavern/town-blockout/town-rail-stops.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water.ts';

const grid = createTerrainGrid();
const water = createTownWater(grid);
const rail = createTownRailway(grid);
const forecourt = buildIcePalaceForecourt();
const { colliders, floors } = readWalkGeometry(forecourt);
type MapPoint = readonly [number, number, ...number[]];

function walkSections(points: readonly MapPoint[], action: (east: number, north: number, de: number, dn: number) => void) {
  for (let index = 1; index < points.length; index++) {
    const [east, north] = points[index - 1];
    const [nextEast, nextNorth] = points[index];
    const de = nextEast - east;
    const dn = nextNorth - north;
    const length = Math.hypot(de, dn);
    const steps = Math.ceil(length / .25);
    for (let i = 0; i <= steps; i++) action(east + de * i / steps, north + dn * i / steps, de / length, dn / length);
  }
}

function touchesBox(east: number, north: number, { min, max }: Box, radius = .27) {
  const dx = Math.max(min[0] - east, east - max[0], 0);
  const dz = Math.max(min[2] + north, -north - max[2], 0);
  return dx * dx + dz * dz < radius * radius;
}

function hitsMaze(east: number, north: number, boxes = colliders) {
  return boxes.some(box => touchesBox(east, north, box));
}

test('southern pad preserves the building anchor and contributes its real collision boxes to the landmark', () => {
  assert.deepEqual(icePalaceForecourt.buildingOrigin, [484, 72, 12]);
  assert.deepEqual(icePalaceForecourt.terrainOrigin, [484, 65, 12]);
  assert.deepEqual(icePalaceForecourt.terrainFootprint, [48, 52]);
  assert.equal(floors.length, 1);
  assert.deepEqual(floors[0].max, [508, 12.12, -39]);
  assert.equal(floors[0].min[0], 460);
  assert.equal(floors[0].min[2], -53);
  assert.ok(Math.abs(floors[0].min[1] - 11.88) < 1e-9);
  const castle = new Group();
  castle.position.set(484, 12, -72);
  const oldWall: Box = { min: [-20, 0, -2], max: [-19, 5, 2] };
  castle.userData.colliders = [oldWall];
  const attachment = mountIcePalaceForecourt(castle);
  assert.deepEqual(attachment.getWorldPosition(attachment.position.clone()).toArray(), [484, 12.12, -53]);
  const mounted = readWalkGeometry(castle);
  const normalize = (boxes: Box[]) => boxes.map(({ min, max }) => [...min, ...max].map(value => value.toFixed(9)));
  assert.deepEqual(normalize(mounted.colliders.slice(1)), normalize(colliders));
  assert.deepEqual(normalize(mounted.floors), normalize(floors));
  assert.equal(castle.userData.colliders[0], oldWall);
  assert.equal(forecourt.children.filter(child => child instanceof InstancedMesh).length, 3);
});

test('castle south station still connects at its stair foot and clears the maze across its six-metre width', () => {
  const stop = railPlatforms.find(({ id }) => id === 'ice-castle');
  assert.ok(stop && 'stairs' in stop);
  assert.deepEqual(stop.trail, icePalaceForecourt.stationTrail);
  assert.deepEqual(icePalaceForecourt.stationTrail[0], stop.stairs.end);
  assert.deepEqual(icePalaceForecourt.stationTrail.at(-1), [460, 72]);
  assert.ok(hitsMaze(496, 45), 'The old approach needs the western bypass');
  let samples = 0;
  let previousHeight: number | undefined;
  walkSections(icePalaceForecourt.stationTrail, (east, north, de, dn) => {
    const height = grid.groundHeightAt(east, north);
    if (previousHeight !== undefined) assert.ok(Math.abs(height - previousHeight) <= .43);
    previousHeight = height;
    for (let cross = -icePalaceForecourt.stationTrailWidth / 2; cross <= icePalaceForecourt.stationTrailWidth / 2; cross += .5) {
      const x = east - dn * cross;
      const n = north + de * cross;
      assert.ok(canEnter(x, n) && !isWater(x, n) && !water.at(x, n), `Wet corridor at ${x},${n}`);
      assert.ok(!rail.keepClear(x, n, .27), `Corridor reaches the track at ${x},${n}`);
      assert.ok(!hitsMaze(x, n), `Maze blocks corridor at ${x},${n}`);
      samples++;
    }
  });
  assert.ok(samples > 2_000);
});

test('the south wing and the maze have separate walk-up routes from the western part of the forecourt', () => {
  for (const trail of [icePalaceForecourt.southGateTrail, icePalaceForecourt.mazeEntryTrail]) {
    walkSections(trail, (east, north) => {
      assert.ok(canEnter(east, north) && !water.at(east, north));
      assert.ok(!hitsMaze(east, north), `Maze wall blocks planned walking lane at ${east},${north}`);
    });
  }
  const [west, south, east, north] = icePalaceForecourt.bounds;
  for (let x = west; x <= east; x++) for (let n = south; n <= north; n++) {
    assert.ok(canEnter(x, n) && !water.at(x, n) && !rail.keepClear(x, n, .27));
    assert.equal(grid.groundHeightAt(x, n), 12);
    assert.equal(grid.surfaces[n * grid.gridWidth + x], 3);
  }

  const castle = buildIceCastle();
  castle.position.set(484, 12, -72);
  const { colliders: castleBoxes, floors: castleFloors } = readWalkGeometry(castle);
  let feet = 12.12;
  walkSections([[486, 54], [486, 62]], (east, north) => {
    const supports = castleFloors.filter(box => box.max[1] <= feet + .43 && touchesBox(east, north, box));
    const next = Math.max(grid.heightAt(east, north), ...supports.map(box => box.max[1]));
    assert.ok(Math.abs(next - feet) <= .43, `South gate has a step at ${east},${north}`);
    assert.ok(!castleBoxes.some(box => touchesBox(east, north, box) &&
      next + .025 < box.max[1] && next + 1.8 - .025 > box.min[1]), `South gate blocked at ${east},${north}`);
    feet = next;
  });
});

test('snow block grooves clear the full 1.2 m body without adding a shortcut to the key', () => {
  const [mazeEast, mazeNorth] = icePalaceForecourt.mazeOrigin;
  for (const { home, target } of icePalaceMazeBlockGrooves) {
    const east = mazeEast + home[0];
    walkSections([[east, mazeNorth - home[1]], [east, mazeNorth - target[1]]], (x, north) => {
      assert.ok(colliders.every(({ min, max }) => x + .6 <= min[0] || x - .6 >= max[0] ||
        -north + .6 <= min[2] || -north - .6 >= max[2]), `Snow block intersects maze at ${x},${north}`);
    });
  }

  const start = [0, 3] as const;
  const finish = [10, 5] as const;
  const door = offsetBox(icePalaceForecourtGrotto.door, new Vector3(484, 12, -72));
  function reachesKey(boxes: Box[]) {
    const queue = [{ cell: start as readonly [number, number], distance: 0 }];
    const visited = new Set(['0,3']);
    for (const { cell: [x, z], distance } of queue) {
      if (x === finish[0] && z === finish[1]) return distance;
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const target = [x + dx, z + dz] as const;
        if (target[0] < 0 || target[0] >= 16 || target[1] < 0 || target[1] >= 8 || visited.has(target.join(','))) continue;
        let blocked = false;
        const first = [mazeEast + (x + .5) * 1.5, mazeNorth - (z + .5) * 1.5] as const;
        walkSections([first, [first[0] + dx * 1.5, first[1] - dz * 1.5]],
          (east, north) => { blocked ||= hitsMaze(east, north, boxes); });
        if (blocked) continue;
        visited.add(target.join(','));
        queue.push({ cell: target, distance: distance + 1.5 });
      }
    }
    return undefined;
  }
  assert.equal(reachesKey(colliders), 60);
  assert.equal(reachesKey([...colliders, door]), undefined);
});

test('pressure contact moves the matching visible block and updates the physical ice gate and key', () => {
  const group = buildIcePalaceForecourt();
  const door = group.getObjectByName('石窟冰门');
  const key = group.getObjectByName('石窟冰钥匙');
  const blocks = group.getObjectByName('迷宫雪块');
  assert.ok(door && key && blocks instanceof InstancedMesh && blocks.boundingSphere);
  assert.equal(blocks.count, 3);
  assert.equal(door.visible, true);
  assert.equal(key.visible, true);
  const bounds = blocks.boundingSphere.clone();
  const matrix = new Matrix4();
  blocks.getMatrixAt(0, matrix);
  const before = matrix.elements[14];
  group.userData.grottoVisuals.update({
    platePressed: true,
    blockPositions: icePalaceForecourtGrotto.blocks.map(({ target }) => target),
    doors: { grotto: true, throne: false, gallery: false, mirror: false, stair: false, vault: false },
    key: true,
  });
  assert.equal(door.visible, false);
  assert.equal(key.visible, false);
  blocks.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[14] - before, 1.5);
  assert.ok(blocks.boundingSphere.equals(bounds));
  for (let index = 0; index < blocks.count; index++) {
    blocks.getMatrixAt(index, matrix);
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
      assert.ok(bounds.containsPoint(new Vector3(x, y, z).applyMatrix4(matrix)));
    }
  }
});
