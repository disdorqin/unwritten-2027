import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout, release = '75859a094757c5dcee8b874eef86ec37f4204907'] = process.argv.slice(2);
assert.ok(checkout, 'Usage: node --import tsx verify-jx6-runtime.mts CHECKOUT [COMMIT]');
const root = resolve(checkout);
const townRoot = resolve(root, 'tools/voxel-tavern/town-blockout');
const require = createRequire(resolve(root, 'package.json'));
const { Color, Group, Matrix4, Scene, Vector3 } = require('three');
const town = (file: string) => import(pathToFileURL(resolve(townRoot, file + '.ts')).href);
const [
  { canEnter, createTerrainGrid, isWater }, { addDistrictHousing }, { buildDistrictHousing },
  { buildPineCamp }, { addScenery }, { createTownRailway }, { addStreetscape }, { addForestDensity },
  { extensionRoadClearance, extensionStreetClearance }, { createWishActivity },
] = await Promise.all([
  town('terrain'), town('district-layout'), town('district-housing'), town('town-pine-camp'),
  town('scenery'), town('town-railway'), town('streetscape'), town('forest-density'), town('town-extension'),
  town('wish-activity'),
]);

const scene = new Scene();
const landscape = new Group();
scene.add(landscape);
const grid = createTerrainGrid();
const railway = createTownRailway(grid, () => 0);
const pine = buildPineCamp(grid);
landscape.add(pine.group);
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storageKeys: string[] = [];
const define = (name: string, value: object) =>
  Object.defineProperty(globalThis, name, { configurable: true, value });
define('document', { createElement: () => ({ getContext: () => ({
  createRadialGradient: () => ({ addColorStop() {} }),
  createLinearGradient: () => ({ addColorStop() {} }),
  fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
}) }) });
define('localStorage', { getItem(key: string) { storageKeys.push(key); return null; } });
let scenery;
let wish;
try {
  scenery = addScenery(landscape, grid, pine.keepClear);
  wish = createWishActivity({
    scene,
    open() { throw new Error('The verification does not open the UI.'); },
    announce() {},
    sit() {},
    face() {},
  });
} finally {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
const district = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear);
const streets = addStreetscape(landscape, grid, (east: number, north: number, radius: number) =>
  district.keepClear(east, north, radius) || extensionRoadClearance(east, north, radius) || pine.keepClear(east, north, radius));
const forest = addForestDensity(landscape, grid, (east: number, north: number, radius: number) =>
  district.keepClear(east, north, radius) || streets.occupied(east, north, radius) || pine.keepClear(east, north, radius),
  (east: number, north: number, radius: number) =>
    extensionRoadClearance(east, north, radius) || railway.keepClear(east, north, radius) ||
    extensionStreetClearance(east, north, radius));
const bodyColor = 'd95b42';
const glowColor = 'ffb466';

type ColoredInstance = { batch: string; color: string; matrix: number[]; e: number; n: number; y: number };
function coloredInstances(group, colors: ReadonlySet<string>) {
  const rows: ColoredInstance[] = [];
  const mat = new Matrix4();
  const tint = new Color();
  group.updateMatrixWorld(true);
  group.traverse(mesh => {
    if (!mesh.isInstancedMesh || !mesh.instanceColor) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getColorAt(i, tint);
      const color = tint.getHexString();
      if (!colors.has(color)) continue;
      mesh.getMatrixAt(i, mat);
      mat.premultiply(mesh.matrixWorld);
      const matrix = mat.toArray().map(Math.fround);
      rows.push({ batch: mesh.name, color, matrix, e: matrix[12], n: -matrix[14], y: matrix[13] });
    }
  });
  return rows;
}
const key = ({ matrix, color }: ColoredInstance) => JSON.stringify([color, matrix]);
const keys = (rows: ColoredInstance[]) => rows.map(key).sort();
const housingColors = new Set([bodyColor, glowColor]);
const detailed = landscape.getObjectByName('district-infill');
assert.ok(detailed);
const near = coloredInstances(detailed, housingColors);
district.setPanorama(true);
const overview = landscape.getObjectByName('Old town housing overview')?.parent;
assert.ok(overview && overview !== landscape);
const far = coloredInstances(overview, housingColors);
assert.equal(detailed.visible, false);
assert.equal(overview.visible, true);
assert.deepEqual(keys(near), keys(far));
district.setPanorama(false);
assert.equal(detailed.visible, true);
assert.equal(overview.visible, false);

const layoutSource = readFileSync(resolve(townRoot, 'district-layout.ts'), 'utf8');
const centralRows = layoutSource.split('const plazaResidentialCards = ')[1].split(']);')[0];
const centralCards = new Map([...centralRows.matchAll(/\['([\d:]+)', (\d+)\]/g)].map(([, id, card]) => [id, +card]));
const indexes = new Map<string, number>();
const attributed = new Map<string, ColoredInstance[]>();
for (const row of near) {
  const matrixKey = key(row);
  const same = attributed.get(matrixKey);
  if (same) same.push(row);
  else attributed.set(matrixKey, [row]);
}
assert.ok([...attributed.values()].every(rows => rows.length === 1), 'Near-detail lamp instances must be unique');

const houses = district.housePortals.map((portal, i) => {
  const { x, n, w, d, angle, style, variant } = district.sites[i];
  const theme = portal.zone === 'central' ? undefined : portal.zone;
  const cardVariant = indexes.get(portal.zone) ?? 0;
  indexes.set(portal.zone, cardVariant + 1);
  const card = portal.zone === 'central' ? centralCards.get(portal.id.slice(9)) : undefined;
  const model = buildDistrictHousing(style, w, d, variant, theme, card, cardVariant);
  const [halfWidth, halfDepth] = Math.abs(Math.sin(angle)) > .5 ? [d / 2, w / 2] : [w / 2, d / 2];
  const heights = [-1, 0, 1].flatMap(e => [-1, 0, 1].map(k =>
    grid.heightAt(x + e * (halfWidth + 1), n + k * (halfDepth + 1))));
  const level = Math.max(...heights, grid.heightAt(x, n)) + .14;
  model.position.set(x, level, -n);
  model.rotation.y = angle;
  const roofface = coloredInstances(model, housingColors);
  const owned = roofface.map(item => {
    const instances = attributed.get(key(item));
    assert.equal(instances?.length, 1, portal.id);
    const actual = instances.pop();
    const expectedBatch = `Old town housing ${Math.floor(x / 96)},${Math.floor(n / 96)}`;
    assert.equal(actual.batch, expectedBatch);
    return { ...actual, offset: [actual.e - x, actual.n - n, actual.y - level] };
  });
  const bodies = owned.filter(item => item.color === bodyColor);
  const glow = owned.filter(item => item.color === glowColor);
  assert.ok([1, 2].includes(bodies.length), portal.id);
  assert.equal(bodies.length, glow.length, portal.id);
  return { id: portal.id, zone: portal.zone, x, n, width: w, depth: d, angle, exitYaw: portal.exitYaw,
    foundation: level, lamps: bodies.length, bodies, glow };
});
assert.ok([...attributed.values()].every(rows => rows.length === 0));
assert.deepEqual(district.zoneCounts, { forest: 11, memorial: 5, market: 17, lakeside: 10, central: 9 });
assert.equal(houses.length, 52);
assert.deepEqual(houses.filter(row => row.lamps === 1).map(row => row.id), ['old-town:202:247', 'old-town:249:264']);
for (const rows of [near, far]) {
  assert.equal(rows.filter(item => item.color === bodyColor).length, 102);
  assert.equal(rows.filter(item => item.color === glowColor).length, 102);
}
const tinted = object => object.children.filter(mesh => mesh.isInstancedMesh && mesh.instanceColor);
assert.equal(tinted(detailed).length, 28);
assert.equal(tinted(overview).length, 2);
const nearCells = [...new Set(near.map(row => row.batch))].sort();
assert.equal(nearCells.length, 14);

const trunkGroup = scene.getObjectByName('Wish tree and town blessings');
assert.ok(trunkGroup);
const physicalAnchor = { e: trunkGroup.position.x, n: -trunkGroup.position.z, y: trunkGroup.position.y };
assert.deepEqual(physicalAnchor, { e: 201.4, n: 210.65, y: 12 });
const trunks = coloredInstances(trunkGroup, new Set(['3e2a2b'])).filter(row => {
  const scale = new Vector3().setFromMatrixScale(new Matrix4().fromArray(row.matrix));
  return Math.abs(scale.x - .4) < 1e-6 && Math.abs(scale.y - 2.84) < 1e-6 && Math.abs(scale.z - .43) < 1e-6;
});
assert.equal(trunks.length, 1);
const trunk = trunks[0];
assert.equal(wish.blocked(trunk.e, trunk.n, 12), true);
assert.deepEqual(storageKeys, ['unwritten:town-blessings']);
const viewerSource = readFileSync(resolve(townRoot, 'viewer.ts'), 'utf8');
const registrations = [...viewerSource.matchAll(/nearbyActivity\(createWishActivity\)/g)].length;
assert.equal(registrations, 1);
assert.deepEqual(wish.spots.map(({ x, n, ground, range, label }) => ({ x, n, ground, range, label })), [
  { x: 201.5, n: 207, ground: 12, range: 2.15, label: '写匿名祝福' },
]);

const treeTarget = { e: 118, n: 88 };
const targetY = grid.heightAt(treeTarget.e, treeTarget.n);
assert.equal(targetY, 9.704883575439453);
const ring = [treeTarget, ...Array.from({ length: 360 }, (_, degree) => {
  const angle = degree * Math.PI / 180;
  return { e: 118 + .27 * Math.cos(angle), n: 88 + .27 * Math.sin(angle) };
})].map(({ e, n }) => ({
  e, n, ground: grid.heightAt(e, n), flags: {
    terrain: !canEnter(e, n), water: isWater(e, n), housing: district.blocked(e, n), scenery: scenery.blocked(e, n),
    plazaCover: scenery.plazaCoverBlocks(e, n, .27), streets: streets.blocked(e, n),
    forest: forest.blocked(e, n), railwayReserve: railway.keepClear(e, n, .27),
    wishActivity: wish.blocked(e, n, grid.heightAt(e, n)),
  },
}));
assert.ok(ring.every(row => Object.values(row.flags).every(flag => !flag)));
const sha256 = (file: string) => createHash('sha256').update(readFileSync(resolve(townRoot, file))).digest('hex');
console.log(JSON.stringify({
  source: release, hashes: Object.fromEntries(['viewer.ts', 'district-housing.ts', 'district-layout.ts', 'wish-activity.ts'].map(file => [file, sha256(file)])),
  lampResult: { houses, bodiesNear: 102, glowNear: 102, bodiesFar: 102, glowFar: 102, nearCells,
    nearTintedBatches: 28, farTintedBatches: 2, exactNearFarMatrixMatch: true, zoneCounts: district.zoneCounts },
  wish: { released: { anchor: physicalAnchor, trunk, trunkCollision: true,
    interaction: wish.spots.map(({ x, n, ground, label, range }) => ({ x, n, ground, label, range })),
    storageKeys, wishLimit: 20, registrations },
    target: { anchor: treeTarget, ground: targetY, tested: ring.length, radius: .27, blocked: 0, ring } },
}, null, 2));
