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

const { Group } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as typeof import('three');

test('every built decorative house has a unique dry, clear portal on its real front', t => {
  const landscape = new Group();
  const grid = createTerrainGrid();
  const track = createTownRailway(grid);
  // Only the street lamp sprite texture needs a DOM canvas during geometry construction.
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {},
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
  t.diagnostic(`checked ${district.count} old-town homes, ${extensions.counts.buildings} district homes, and ${cottagePortals.length} decorative cottages`);
  const colliders = [...readWalkGeometry(extensions.group).colliders, ...readWalkGeometry(village).colliders];
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
});
