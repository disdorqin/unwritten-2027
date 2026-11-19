import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { buildTownRailRoute } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { canEnter, createTerrainGrid, layout, riverX, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { extensionRoads } from '../tools/voxel-tavern/town-blockout/town-extension.ts';

const { Group } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as typeof import('three');
const grid = createTerrainGrid();
const { gridWidth, gridDepth, heightAt } = grid;

test('town blockout roads and entrances are continuous on foot', () => {
  const approaches = layout.plots.map(plot => ({
    id: plot.id,
    points: [plot.connect, [...plot.door, plot.origin[2]]],
  }));
  for (const { id, points } of [...layout.roads, ...approaches]) {
    for (let i = 1; i < points.length; i++) {
      const [ax, an] = points[i - 1];
      const [bx, bn] = points[i];
      const steps = Math.ceil(Math.hypot(bx - ax, bn - an) / .25);
      let previous = heightAt(ax, an);
      for (let step = 0; step <= steps; step++) {
        const x = ax + (bx - ax) * step / steps;
        const n = an + (bn - an) * step / steps;
        const height = heightAt(x, n);
        assert.ok(canEnter(x, n), `${id} is blocked at ${x},${n}`);
        assert.ok(Math.abs(height - previous) < .18, `${id} has a height break at ${x},${n}`);
        previous = height;
      }
    }
  }
  for (const { id, origin: [x, n, y], door: [doorX, doorN] } of layout.plots) {
    assert.ok(Math.abs(heightAt(x, n) - y) < .1, `${id} plot elevation`);
    assert.ok(Math.abs(heightAt(doorX, doorN) - y) < .1, `${id} threshold elevation`);
  }
});

test('the plaza stays flat and each crossing uses its bridge deck', () => {
  const transportIds = [...layout.roads, ...layout.bridges].map(({ id }) => id);
  assert.equal(new Set(transportIds).size, transportIds.length);
  const [west, south, east, north] = layout.plaza.bounds;
  for (let x = west; x <= east; x++) {
    for (let n = south; n <= north; n++) assert.equal(heightAt(x, n), layout.plaza.height);
  }
  for (const bridge of layout.bridges) {
    const { north, height } = bridge;
    assert.ok(canEnter(riverX(north), north), bridge.id);
    assert.equal(heightAt(riverX(north), north), height);
    assert.ok(!canEnter(riverX(north + 6), north + 6), bridge.id);
  }
});

test('town expansion keeps landmark origins except for the approved stage relocation', () => {
  assert.deepEqual(worldBounds, { width: 640, depth: 540 });
  assert.deepEqual([gridWidth, gridDepth], [641, 541]);
  assert.deepEqual([layout.width, layout.depth], [448, 384]);
  assert.deepEqual(layout.plaza.spawn, [223, 180]);
  assert.deepEqual(Object.fromEntries(layout.plots.map(({ id, origin }) => [id, origin])), {
    clocktower: [226, 223, 12],
    tavern: [159, 230, 16],
    'post-office': [264, 210, 13],
    memorial: [337, 277, 25],
    'long-hall': [378, 316, 35],
    cabins: [91, 271, 23],
    'lantern-workshop': [126, 115, 10],
    'market-stalls': [154, 105, 10],
    glasshouse: [372, 96, 11],
    lighthouse: [408, 78, 12],
    stage: [238, 140, 12],
  });
});

test('expanded streets cross the legacy seams and the northern river stays outside dry navigation', () => {
  for (const { id, points } of extensionRoads) {
    for (let i = 1; i < points.length; i++) {
      const [ax, an] = points[i - 1], [bx, bn] = points[i];
      const count = Math.ceil(Math.hypot(bx - ax, bn - an) / .125);
      let last = heightAt(ax, an);
      for (let step = 1; step <= count; step++) {
        const x = ax + (bx - ax) * step / count;
        const n = an + (bn - an) * step / count;
        const height = heightAt(x, n);
        assert.ok(canEnter(x, n), `${id} has an impassable approach at ${x},${n}`);
        if (x > layout.width || n > layout.depth) {
          assert.ok(Math.abs(height - last) < .18, `${id} has a height break at ${x},${n}`);
        }
        last = height;
      }
    }
  }
  for (const [n, x] of [[384, 231], [429, 225], [470, 239], [512, 231], [540, 231]]) {
    assert.equal(riverX(n), x);
    assert.ok(!canEnter(x, n));
  }
  assert.ok(!canEnter(640, 224));
  assert.ok(canEnter(93, 512));
  assert.ok(!canEnter(93, 540));
});

test('legacy houses reserve rail clearance while nearby open sites stay occupied', () => {
  const rail = buildTownRailRoute(grid);
  const lampBlocked = () => false;
  const before = addDistrictHousing(new Group(), grid, lampBlocked);
  const after = addDistrictHousing(new Group(), grid, lampBlocked, rail.keepClear);

  assert.ok(before.blocked(390, 32), 'original south dwelling exists without rail clearance');
  assert.ok(!after.blocked(390, 32), 'south dwelling must clear the track');
  assert.ok(!before.blocked(63, 194), 'the established west clearing stays open after rerouting');
  assert.ok(!after.blocked(63, 194), 'moving the track does not put a new cabin in the clearing');
  const clearing = 'old-town:63:194';
  assert.equal(before.rejectedHomes.find(({ id }) => id === clearing)?.reason, 'preserved-clearing');
  assert.equal(after.rejectedHomes.find(({ id }) => id === clearing)?.reason, 'preserved-clearing');
  if (after.relocations.size === 13) {
    assert.ok(after.housePortals.some(({ id }) => id === 'old-town:105:152'),
      'the approved phase-three relocation clears the track');
  }
  assert.ok(rail.keepClear(18, 185));
  assert.ok(after.blocked(405, 51), 'northward neighboring dwelling is still in place');
  const unaffected = before.sites.filter(({ x, n }) => !(x === 390 && n === 32) && !(x === 63 && n === 194));
  assert.deepEqual(after.sites, unaffected);
});
