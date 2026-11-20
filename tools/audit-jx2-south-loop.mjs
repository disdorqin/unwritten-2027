import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { Group } from 'three';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
      return nextResolve(specifier.replace(/\.js$/, '') + '.ts', context);
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    return nextLoad(url, context);
  },
});

const load = name => import(`./voxel-tavern/town-blockout/${name}.ts`);
const [
  { canEnter, bridgeAt, isWater, createTerrainGrid, worldBounds, layout },
  { buildVillageLandmark, villageHousePortals }, { readWalkGeometry }, { createTownWater },
  { buildPineCamp }, { addScenery }, { addDistrictHousing }, { addStreetscape },
  { addForestDensity }, { buildExtensionStreets }, { createTownRailway },
  { extensionRoadClearance, extensionStreetClearance }, { buildMarketLandmark },
  { buildIcePlayProps, buildLakesideLandmark }, { buildTigerZodiacAnchor },
] = await Promise.all([
  'terrain', 'landmark-village', 'landmark-kit', 'town-water', 'town-pine-camp',
  'scenery', 'district-layout', 'streetscape', 'forest-density', 'extension-streets',
  'town-railway', 'town-extension', 'landmark-market', 'landmark-lakeside', 'town-zodiac-tiger-anchor',
].map(load));

const noOp = () => {};
const drawing = new Proxy({
  createRadialGradient: () => ({ addColorStop: noOp }),
  createLinearGradient: () => ({ addColorStop: noOp }),
  measureText: text => ({ width: text.length * 12 }),
}, { get: (state, key) => state[key] ?? noOp });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => drawing, toDataURL: () => 'data:,' }) };
globalThis.Image = class { async decode() {} };

const grid = createTerrainGrid();
const townWater = createTownWater(grid);
const railway = createTownRailway(grid, () => 0);
const pineCamp = buildPineCamp(grid);
const landscape = new Group();
const scenery = addScenery(landscape, grid, pineCamp.keepClear);
const districts = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear);
const streetscape = addStreetscape(landscape, grid, (east, north, radius) =>
  districts.keepClear(east, north, radius) || extensionRoadClearance(east, north, radius) || pineCamp.keepClear(east, north, radius));
const forest = addForestDensity(landscape, grid,
  (east, north, radius) => districts.keepClear(east, north, radius) || streetscape.occupied(east, north, radius) || pineCamp.keepClear(east, north, radius),
  (east, north, radius) => extensionRoadClearance(east, north, radius) || railway.keepClear(east, north, radius) || extensionStreetClearance(east, north, radius));
const extension = buildExtensionStreets(grid, railway.keepClear, districts.keepClear);

const landmarkBuilders = {
  cabins: buildVillageLandmark, stage: buildVillageLandmark,
  'market-stalls': buildMarketLandmark, 'lantern-workshop': buildMarketLandmark,
  glasshouse: buildLakesideLandmark, lighthouse: buildLakesideLandmark,
};
const landmarks = new Map(layout.plots.filter(({ id }) => id in landmarkBuilders).map(plot => {
  const group = landmarkBuilders[plot.id](plot);
  const [east, north, height] = plot.origin;
  group.position.set(east, height, -north);
  return [plot.id, group];
}));
const cabins = villageHousePortals(landmarks.get('cabins'), grid.heightAt);
const doors = [...districts.housePortals, ...extension.housePortals, ...cabins].sort((a, b) => a.id.localeCompare(b.id));
const registry = new Map(doors.map(door => [door.id, door]));
assert.equal(registry.size, 92);
assert.deepEqual([districts.housePortals.length, extension.housePortals.length, cabins.length], [52, 38, 2]);
assert.equal(districts.sites.length, districts.housePortals.length);

const southLoop = layout.roads.find(({ id }) => id === 'south-loop');
assert.ok(southLoop);
function distanceToRoad(east, north) {
  return Math.min(...southLoop.points.slice(1).map(([endE, endN], i) => {
    const [startE, startN] = southLoop.points[i];
    const de = endE - startE;
    const dn = endN - startN;
    const t = Math.max(0, Math.min(1, ((east - startE) * de + (north - startN) * dn) / (de * de + dn * dn)));
    return Math.hypot(east - startE - t * de, north - startN - t * dn);
  }));
}

const rulingAddresses = '115:87 161:68 188:65 202:70 145:85 137:70 234:74 245:80 181:89 311:117 320:105 325:87'.split(' ');
const marketDoors = districts.housePortals.filter(({ zone }) => zone === 'market');
const marketIds = new Set(marketDoors.map(({ id }) => id));
const rejected = new Map(districts.rejectedHomes.map(home => [home.id, home]));
const candidates = rulingAddresses.map(address => {
  const id = `old-town:${address}`;
  const door = registry.get(id) ?? null;
  const sourceDistance = distanceToRoad(...address.split(':').map(Number));
  const generationRejection = rejected.get(id) ?? null;
  assert.ok(sourceDistance <= 18, address);
  assert.ok(door || generationRejection, address);
  return { id, sourceDistance, door, generationRejection, owner: marketIds.has(id) ? 'JX-1' : door ? 'JX-2' : null };
});
const builtCenterDiagnostic = districts.sites.map(({ x, n }, index) => ({
  id: districts.housePortals[index].id, east: x, north: n, centerDistance: distanceToRoad(x, n),
})).filter(({ centerDistance }) => centerDistance <= 18);
const doorThresholdDiagnostic = doors.map(door => ({ ...door, doorDistance: distanceToRoad(door.x, door.n) }))
  .filter(({ doorDistance }) => doorDistance <= 18);

const collision = { colliders: [...scenery.plazaCoverBoxes], floors: [], ramps: [] };
const geometryGroups = [...landmarks.values(), pineCamp.group, railway.group, extension.group, buildIcePlayProps(), buildTigerZodiacAnchor(grid.heightAt)];
for (const { west, east, north, height } of layout.bridges) {
  for (const railN of [north - 3.8, north + 3.8]) {
    collision.colliders.push({ min: [west - .125, height, -railN - .125], max: [east + .125, height + 1.15, -railN + .125] });
  }
}
for (const component of geometryGroups.map(readWalkGeometry)) {
  for (const kind of Object.keys(collision)) collision[kind].push(...component[kind]);
}
const geometryAt = () => collision;
const homeReturn = undefined;
const activities = [];
const viewer = readFileSync(new URL('./voxel-tavern/town-blockout/viewer.ts', import.meta.url), 'utf8');
const functions = ['walkable', 'outdoorWalkable', 'outdoorSurfaceAt', 'surfaceAt', 'overlapsBody', 'supportAt', 'obstructed', 'dryTownLandingHeight', 'tryMove'];
const exactFunctions = functions.map(name => {
  const result = viewer.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'));
  assert.ok(result, name);
  return result[0];
});
const parameters = ['bodyRadius', 'bodyHeight', 'stepHeight', 'surfaceEpsilon'].map(name => {
  const result = viewer.match(new RegExp(`^const ${name} = [0-9.]+;`, 'm'));
  assert.ok(result, name);
  return result[0];
});
const game = new Function('return ' + stripTypeScriptTypes(`(function(deps) {
  const { grid, townWater, railway, scenery, districts, forest, streetscape, canEnter, bridgeAt, isWater, worldBounds, geometryAt, homeReturn, activities } = deps;
  const outdoorGeometryAt = geometryAt;
  ${parameters.join('\n')}
  const landingFeedback = { begin() {} };
  let x, n, ground, airHeight, riseSpeed;
  ${exactFunctions.join('\n')}
  return {
    dryTownLandingHeight, tryMove,
    place: (east, north, feet) => { x = east; n = north; ground = feet; airHeight = undefined; },
    pose: () => ({ x, n, ground, airHeight }),
  };
})`))()({ grid, townWater, railway, scenery, districts, forest, streetscape, canEnter, bridgeAt, isWater, worldBounds, geometryAt, homeReturn, activities });

function walk(points, stride) {
  const [start, ...rest] = points;
  const height = game.dryTownLandingHeight(start[0], start[1]);
  if (height === undefined) return { passed: false, problem: 'blocked-start', start };
  game.place(start[0], start[1], height);
  let from = start;
  let steps = 0;
  let maxStep = 0;
  for (const to of rest) {
    const stepCount = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / stride);
    for (let index = 1; index <= stepCount; index++) {
      const east = from[0] + (to[0] - from[0]) * index / stepCount;
      const north = from[1] + (to[1] - from[1]) * index / stepCount;
      const before = game.pose();
      if (!game.tryMove(east, north)) return { passed: false, problem: 'native-reject', steps, east, north, before };
      const after = game.pose();
      if (after.airHeight !== undefined) return { passed: false, problem: 'airborne', steps, east, north, before, after };
      maxStep = Math.max(maxStep, Math.abs(after.ground - before.ground));
      steps++;
    }
    from = to;
  }
  return { passed: true, steps, maxStep, startHeight: height, finish: game.pose() };
}

const roadWalk = southLoop.points.slice(1).map((end, index) => {
  const start = southLoop.points[index];
  return { start, end, forward: walk([start, end], .125), backward: walk([end, start], .125) };
});
const centerline = { forward: walk(southLoop.points, .125), backward: walk([...southLoop.points].reverse(), .125) };
const snapshot = {
  release: '75859a094757c5dcee8b874eef86ec37f4204907',
  viewerSha256: createHash('sha256').update(viewer).digest('hex'),
  road: { id: southLoop.id, width: southLoop.width, points: southLoop.points },
  counts: { totalDoors: registry.size, oldTown: districts.housePortals.length, extension: extension.housePortals.length, decorative: cabins.length,
    sourceCandidates: candidates.length, joined: candidates.filter(({ door }) => door).length,
    retainedJx1: candidates.filter(({ owner }) => owner === 'JX-1').length,
    eligibleJx2: candidates.filter(({ owner }) => owner === 'JX-2').length,
    missing: candidates.filter(({ door }) => !door).length, market: marketIds.size },
  candidates, builtCenterDiagnostic, doorThresholdDiagnostic,
  roadWalk, centerline, doors,
};
console.log(JSON.stringify(snapshot, null, 2));
