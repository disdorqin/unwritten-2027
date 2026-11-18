import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { buildExtensionStreets } from '../tools/voxel-tavern/town-blockout/extension-streets.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildVillageLandmark, villageHousePortals } from '../tools/voxel-tavern/town-blockout/landmark-village.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { canEnter, createTerrainGrid, isWater, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { extensionRoadClearance, extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createHouseDoorBook, findHouseDoorLanding, houseDoorBookCopy, houseDoorVisitKey, recordHouseDoorVisit } from '../tools/voxel-tavern/town-blockout/town-house-door-book.ts';
import { townNpcDoorAnchors } from '../tools/voxel-tavern/town-blockout/town-npc.ts';
import { marketStalls } from '../tools/voxel-tavern/town-blockout/market-fair.ts';
import { readFileSync } from 'node:fs';

const { Group } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as typeof import('three');

test('every built decorative house has a unique dry, clear portal on its real front', t => {
  const landscape = new Group();
  const grid = createTerrainGrid();
  const track = createTownRailway(grid);
  // Street lamp glows and the expanded plaza nameplate need an offscreen canvas.
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      strokeRect() {},
      fillText() {},
      drawImage() {},
    }) }) },
  });
  let scenery: ReturnType<typeof addScenery>;
  try {
    scenery = addScenery(landscape, grid);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const district = addDistrictHousing(landscape, grid, scenery.blocked, track.keepClear);
  const streetscape = addStreetscape(landscape, grid, (x, n, r) =>
    district.keepClear(x, n, r) || extensionRoadClearance(x, n, r));
  const forest = addForestDensity(landscape, grid,
    (x, n, r) => district.keepClear(x, n, r) || streetscape.occupied(x, n, r),
    (x, n, r) => extensionRoadClearance(x, n, r) || track.keepClear(x, n, r) || extensionStreetClearance(x, n, r));
  const extensions = buildExtensionStreets(grid, track.keepClear, district.keepClear);
  const cabinPlot = layout.plots.find(({ id }) => id === 'cabins')!;
  const village = buildVillageLandmark(cabinPlot);
  const [east, north, height] = cabinPlot.origin;
  village.position.set(east, height, -north);
  const cottagePortals = villageHousePortals(village, grid.heightAt);
  assert.equal(district.housePortals.length, district.count);
  assert.equal(extensions.housePortals.length, extensions.counts.buildings);
  assert.equal(cottagePortals.length, 2, 'the furnished cabin keeps its existing physical door');
  const portals = [...district.housePortals, ...extensions.housePortals, ...cottagePortals];
  const ids = new Set(portals.map(({ id }) => id));
  assert.equal(ids.size, portals.length);
  assert.equal(ids.size, 92, 'the theater apron retains the established door catalog');
  assert.ok(ids.has('old-town:200:151'));
  assert.ok(ids.has('old-town:246:135'));
  const anchors = [
    ...layout.plots.map(({ id, door: [x, n] }) => ({ label: id, x, n })),
    ...marketStalls.map(({ kind, east: x, north: n }) => ({ label: kind + '摊', x, n })),
    ...townNpcDoorAnchors,
  ];
  const book = createHouseDoorBook(portals, anchors);
  assert.equal(book.length, 5);
  assert.equal(book.reduce((count, group) => count + group.rows.length, 0), 92);
  assert.ok(book.every(group => group.rows.length > 0 && group.rows.every(row => row.door.zone === group.zone)));
  t.diagnostic(`百门册 ${book.map(group => group.label + ' ' + group.rows.length).join(' / ')}`);
  t.diagnostic(`checked ${district.count} old-town homes, ${extensions.counts.buildings} district homes, and ${cottagePortals.length} decorative cottages`);
  const colliders = [...readWalkGeometry(extensions.group).colliders, ...readWalkGeometry(village).colliders];
  function dryGround(x: number, n: number) {
    const ground = grid.heightAt(x, n);
    if (!canEnter(x, n) || isWater(x, n) || district.blocked(x, n) || scenery.blocked(x, n) ||
        forest.blocked(x, n) || streetscape.blocked(x, n) || colliders.some(({ min, max }) => {
          const dx = Math.max(min[0] - x, x - max[0], 0);
          const dz = Math.max(min[2] + n, -n - max[2], 0);
          return Math.hypot(dx, dz) < .27 && ground + .025 < max[1] && ground + 1.8 > min[1];
        })) return;
    return ground;
  }
  for (const { id, x, n, ground, exitYaw } of portals) {
    assert.ok(canEnter(x, n) && !isWater(x, n), `${id} dry ground`);
    assert.equal(ground, grid.heightAt(x, n), `${id} ground height`);
    assert.ok(!district.blocked(x, n) && !scenery.blocked(x, n) &&
      !forest.blocked(x, n) && !streetscape.blocked(x, n), `${id} return point blocked`);
    assert.ok(!colliders.some(({ min, max }) => {
      const dx = Math.max(min[0] - x, x - max[0], 0);
      const dz = Math.max(min[2] + n, -n - max[2], 0);
      return Math.hypot(dx, dz) < .27 && ground + .025 < max[1] && ground + 1.8 > min[1];
    }), `${id} capsule hits geometry`);
    assert.ok(Math.abs(Math.sin(exitYaw)) < 1e-8 || Math.abs(Math.cos(exitYaw)) < 1e-8, `${id} outward facing`);
  }
  for (const door of portals) {
    assert.ok(findHouseDoorLanding(door, dryGround), `${door.id} has an exact or side landing`);
  }

  let random = 0x577e;
  const sample = () => {
    random = (1664525 * random + 1013904223) >>> 0;
    return random % portals.length;
  };
  const entries = new Set<number>();
  while (entries.size < 6) entries.add(sample());
  for (const index of entries) {
    const targets = new Set<number>();
    while (targets.size < 3) {
      const target = sample();
      if (target !== index) targets.add(target);
    }
    for (const target of targets) assert.ok(findHouseDoorLanding(portals[target], dryGround));
  }
  t.diagnostic('6 reproducibly sampled entries × 3 targets, plus every target sampled against the terrain');
});

test('door clearance tries the center, left, then right without widening or changing the original stand', () => {
  const door = { id: 'old-town:10:10', zone: 'central' as const, x: 10, n: 11.42, ground: 0, exitYaw: 0 };
  const probes: number[][] = [];
  assert.deepEqual(findHouseDoorLanding(door, (x, n) => {
    probes.push([x, n]);
    return x > door.x ? 2 : undefined;
  }), { x: 10.6, n: 10.9, ground: 2 });
  assert.deepEqual(probes, [[10, 10.9], [9.4, 10.9], [10.6, 10.9]]);
  assert.equal(findHouseDoorLanding(door, () => undefined), undefined);
  assert.equal(door.n, 11.42);
  assert.match(createHouseDoorBook([door], [])[0].rows[0].name, /第 1 门/);
});

test('door visits persist without duplicates and the displayed design copy stays exact', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  recordHouseDoorVisit('village:0', storage);
  recordHouseDoorVisit('village:0', storage);
  recordHouseDoorVisit('village:1', storage);
  assert.deepEqual(JSON.parse(data.get(houseDoorVisitKey)!), { version: 1, items: ['village:0', 'village:1'] });
  const design = readFileSync(new URL('../docs/交流区/Muse/屋舍传送百门通设计-v1.md', import.meta.url), 'utf8');
  for (const copy of Object.values(houseDoorBookCopy)) assert.ok(design.includes(`「${copy}」`), copy);
});
