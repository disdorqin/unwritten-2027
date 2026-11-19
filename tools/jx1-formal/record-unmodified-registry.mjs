import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourcePath, destination, commit] = process.argv.slice(2);
assert.ok(sourcePath && destination && /^[0-9a-f]{40}$/.test(commit),
  'Usage: node record-unmodified-registry.mjs BASELINE_CHECKOUT OUTPUT_JSON FULL_SHA');
const town = path.resolve(sourcePath);
const viewer = path.join(town, 'tools/voxel-tavern/town-blockout');
const resolvePackage = createRequire(path.join(town, 'package.json'));
resolvePackage('tsx/esm/api').register();
const { Group } = createRequire(path.join(viewer, '../package.json'))('three');
const moduleAt = name => import(pathToFileURL(path.join(viewer, `${name}.ts`)).href);
const [{ createTerrainGrid, layout }, { buildPineCamp }, { createTownRailway }, { addScenery },
  { addDistrictHousing }, { buildExtensionStreets }, { buildVillageLandmark, villageHousePortals }] = await Promise.all([
  'terrain', 'town-pine-camp', 'town-railway', 'scenery', 'district-layout', 'extension-streets', 'landmark-village',
].map(moduleAt));
const landscape = new Group();
const grid = createTerrainGrid();
const pine = buildPineCamp(grid);
const railway = createTownRailway(grid, () => 0);
// Use the existing geometry test's canvas shim for signs/textures. Portal positions come from production.
const gradient = { addColorStop() {} };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ({
  createRadialGradient: () => gradient, createLinearGradient: () => gradient,
  fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
}) }) } });
const scenery = addScenery(landscape, grid, pine.keepClear);
Reflect.deleteProperty(globalThis, 'document');
const district = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear);
const extension = buildExtensionStreets(grid, railway.keepClear, district.keepClear);
const cabinPlot = layout.plots.find(plot => plot.id === 'cabins');
const village = buildVillageLandmark(cabinPlot);
const [east, north, ground] = cabinPlot.origin;
village.position.set(east, ground, -north);
const doors = [...district.housePortals, ...extension.housePortals, ...villageHousePortals(village, grid.heightAt)];
const marketIds = district.housePortals.filter(door => door.zone === 'market').map(door => door.id);
assert.equal(doors.length, 92);
assert.equal(new Set(doors.map(door => door.id)).size, 92);
assert.equal(marketIds.length, 17);
const sourceHashes = Object.fromEntries(await Promise.all([
  'viewer.ts', 'district-layout.ts', 'district-housing.ts', 'terrain.ts', 'extension-streets.ts',
].map(async file => {
  const bytes = await readFile(path.join(viewer, file));
  return [file, createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')];
})));
await writeFile(destination, JSON.stringify({ commit, sourceHashes, marketIds, doors }, null, 2) + '\n');
