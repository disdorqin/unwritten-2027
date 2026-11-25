import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks, stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = resolve(process.argv[2]);
const town = resolve(source, 'tools/voxel-tavern/town-blockout');
const releaseRequire = createRequire(resolve(source, 'package.json'));
const { Group } = releaseRequire('three');
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
      return nextResolve(specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts' : `${specifier}.ts`, context);
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    if (url.endsWith('.ts')) {
      return { format: 'module', shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
    }
    return nextLoad(url, context);
  },
});
const load = name => import(pathToFileURL(resolve(town, `${name}.ts`)).href);
const [
  { canEnter, bridgeAt, isWater, createTerrainGrid, worldBounds, layout }, { createTownWater },
  { buildPineCamp }, { addScenery }, { addDistrictHousing }, { addStreetscape }, { addForestDensity },
  { buildExtensionStreets }, { createTownRailway }, { extensionPlots, extensionRoadClearance, extensionStreetClearance },
  { buildTowerLandmark }, { buildPostLandmark }, { buildVillageLandmark }, { buildMarketLandmark },
  { buildRailwayStation }, { buildIceCastle }, { readWalkGeometry }, { createTownNpcActivity },
  { registerTownResidentStations, townResidentStations, marketResidentNames },
  { createMarketResidentStationLookup }, { marketStalls }, { iceFishingStation }, { findRegionalCampfires },
  { findForestChopSites }, { isLakeSkateIce },
] = await Promise.all([
  load('terrain'), load('town-water'), load('town-pine-camp'), load('scenery'), load('district-layout'),
  load('streetscape'), load('forest-density'), load('extension-streets'), load('town-railway'), load('town-extension'),
  load('landmark-tower'), load('landmark-post'), load('landmark-village'), load('landmark-market'), load('landmark-station'),
  load('landmark-ice-castle'), load('landmark-kit'), load('town-npc'), load('town-npc-stations'),
  load('market-resident-stations'), load('market-fair'), load('ice-fishing-activity'), load('town-campfires'),
  load('town-forest-campfire'), load('lake-skate-course'),
]);

const noop = () => {};
const drawing = new Proxy({
  createRadialGradient: () => ({ addColorStop: noop }),
  createLinearGradient: () => ({ addColorStop: noop }),
  measureText: text => ({ width: text.length * 12 }),
}, { get: (state, key) => state[key] ?? noop });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => drawing }) };
globalThis.Image = class {};

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
  (east, north, radius) => districts.keepClear(east, north, radius) ||
    streetscape.occupied(east, north, radius) || pineCamp.keepClear(east, north, radius),
  (east, north, radius) => extensionRoadClearance(east, north, radius) || railway.keepClear(east, north, radius) ||
    extensionStreetClearance(east, north, radius));
const extension = buildExtensionStreets(grid, railway.keepClear, districts.keepClear);
function facility(id, build) {
  const plot = [...layout.plots, ...extensionPlots].find(item => item.id === id);
  assert.ok(plot, id);
  const group = build(plot);
  group.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  return { group, plot, geometry: readWalkGeometry(group) };
}
const tower = facility('clocktower', buildTowerLandmark);
const post = facility('post-office', buildPostLandmark);
const stage = facility('stage', buildVillageLandmark);
const market = facility('market-stalls', buildMarketLandmark);
const rail = facility('railway-station', buildRailwayStation);
const palace = facility('ice-castle', buildIceCastle);
const collision = { colliders: [...scenery.plazaCoverBoxes], floors: [], ramps: [] };
for (const geometry of [tower, post, stage, market, rail, palace].map(item => item.geometry)
  .concat([pineCamp.group, railway.group, extension.group].map(readWalkGeometry))) {
  for (const type of Object.keys(collision)) collision[type].push(...geometry[type]);
}

const functions = ['walkable', 'outdoorWalkable', 'surfaceAt', 'outdoorSurfaceAt', 'overlapsBody', 'supportAt',
  'obstructed', 'canStandAtActivity', 'dryTownLandingHeight', 'tryMove', 'roofed', 'campfireGround'];
const viewer = readFileSync(resolve(town, 'viewer.ts'), 'utf8');
const exactSource = functions.map(name => {
  const result = viewer.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'));
  assert.ok(result, name);
  return result[0];
}).join('\n');
const factory = `function production(deps) {
  const { grid, townWater, railway, scenery, districts, forest, streetscape, canEnter, bridgeAt, isWater, worldBounds, collision, pineCamp, isLakeSkateIce } = deps;
  const geometryAt = () => collision;
  const outdoorGeometryAt = geometryAt;
  const homeReturn = undefined, activities = [], activitySpots = [];
  const bodyRadius = .27, bodyHeight = 1.8, stepHeight = .43, surfaceEpsilon = .025;
  const landingFeedback = { begin() {} };
  let x, n, ground, airHeight, riseSpeed;
  ${exactSource}
  return { canStandAtActivity, dryTownLandingHeight, supportAt, campfireGround,
    place: (east, north, feet) => { x = east; n = north; ground = feet; airHeight = undefined; },
    move: tryMove,
    pose: () => ({ x, n, ground, airHeight }),
  };
}`;
const game = new Function('deps', `${stripTypeScriptTypes(factory)}\nreturn production(deps);`)({
  grid, townWater, railway, scenery, districts, forest, streetscape, canEnter, bridgeAt, isWater, worldBounds, collision, pineCamp, isLakeSkateIce,
});
const rounded = value => Number(value.toFixed(6));
const eNy = (x, n, y) => [x, n, y].map(rounded);

function walk(from, to, hint) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const initial = game.dryTownLandingHeight(...from, hint);
  const count = Math.max(1, Math.ceil(length / .2));
  if (initial === undefined) return { ok: false, count, failedAt: 0 };
  game.place(...from, initial);
  let lastFeet = initial;
  let maxStep = 0;
  for (let step = 1; step <= count; step++) {
    const x = from[0] + (to[0] - from[0]) * step / count;
    const n = from[1] + (to[1] - from[1]) * step / count;
    if (!game.move(x, n) || game.pose().airHeight !== undefined) return { ok: false, count, failedAt: step };
    maxStep = Math.max(maxStep, Math.abs(game.pose().ground - lastFeet));
    lastFeet = game.pose().ground;
  }
  return { ok: true, count, from: eNy(...from, initial), to: eNy(...to, lastFeet), maxStep: rounded(maxStep) };
}

function approach(x, n, feet) {
  for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 12) {
    const from = [x + 2 * Math.cos(angle), n + 2 * Math.sin(angle)];
    const result = walk(from, [x, n], feet);
    if (result.ok) return result;
  }
  return { ok: false };
}

const npc = createTownNpcActivity({ scene: new Group() }, grid.heightAt);
const baseActors = ['钟铁生', '柳三弦', '苏小满'].map(name => {
  const at = npc.spots.find(spot => spot.label === `和${name}聊天`);
  const foot = npc.snowballTargets.find(actor => actor.label === name);
  assert.ok(at && foot, name);
  const [e, n, y] = [at.x, at.n, at.ground];
  assert.deepEqual([foot.x, -foot.z, foot.y], [e, n, y]);
  return { name, actor: eNy(e, n, y), geometryWalk: approach(e, n, y) };
});

const marketLookup = createMarketResidentStationLookup({ market: () => market.group,
  fairSpots: marketStalls.map(stall => stall.spot), standableGround: game.dryTownLandingHeight });
const { campfireGround } = game;
const campfires = findRegionalCampfires(campfireGround, layout.plaza.bounds, { pineCamp: true });
const forestChops = findForestChopSites(campfires, campfireGround);
const staged = [];
registerTownResidentStations({ registerResident(name, resolveAt) {
  const resolved = resolveAt();
  const station = resolved && { actor: eNy(...resolved.actor), talk: eNy(...resolved.talk) };
  staged.push({ name, station, geometryWalk: resolved && approach(...resolved.talk) });
} }, {
  campfires, canStand: game.canStandAtActivity, isNight: () => false,
  forestChop: () => forestChops.find(spot => spot.id === 'campfire'),
  mainFishing: () => iceFishingStation,
  palaceProgress: () => ({ key: false, throneRoom: false, gallery: false, mirrorCache: false, stairOpen: false }),
  marketStall: marketLookup,
});
const facilityAnchors = Object.fromEntries(Object.entries(townResidentStations).map(([site, station]) => [site, {
  actor: station.actor, talk: station.talk, standable: [station.actor, station.talk].map(at => game.canStandAtActivity(...at)),
  walk: approach(...station.talk),
}]));
assert.equal(baseActors.length + staged.length, 9);
assert.ok([...baseActors, ...staged].every(actor => actor.geometryWalk?.ok));
assert.equal(staged.filter(item => marketResidentNames.includes(item.name) && item.station).length, 3);

const [stopX, stopY, stopZ] = tower.group.userData.stops.bell;
const [centerEast, centerNorth, centerY] = tower.plot.origin;
const bell = eNy(centerEast + stopX, centerNorth - stopZ, centerY + stopY);
const southPoints = [];
for (const offsetE of [-2.5, -2, -1.5, -1, -.5, 0, .5, 1, 1.5, 2, 2.5]) {
  for (const offsetN of [-4, -3.5, -3, -2.5, -2, -1.5]) {
    const [e, n] = [centerEast + offsetE, centerNorth + offsetN];
    const exact = game.dryTownLandingHeight(e, n, bell[2]);
    if (exact === undefined || Math.abs(exact - bell[2]) > .01) continue;
    const fromBell = walk(bell.slice(0, 2), [e, n], bell[2]);
    if (fromBell.ok) southPoints.push({ point: eNy(e, n, exact), geometryWalk: fromBell });
  }
}
const clockkeeperCandidate = southPoints.find(({ point }) => point[0] === 224.5 && point[1] === 221);
assert.ok(clockkeeperCandidate);
assert.ok(walk(clockkeeperCandidate.point.slice(0, 2), bell.slice(0, 2), bell[2]).ok);
console.log(JSON.stringify({ basis: '75859a094757c5dcee8b874eef86ec37f4204907', sourceReplayOnly: true,
  baseActors, staged, facilityAnchors, forestChops, marketResidentCount: staged.filter(item => marketResidentNames.includes(item.name) && item.station).length,
  facilities: [tower.plot, post.plot, stage.plot, market.plot, rail.plot, palace.plot],
  forestFire: campfires.find(site => site.id === 'forest'), lakesideFire: campfires.find(site => site.id === 'lakeside'),
  iceFishingStation, bell, clockkeeperCandidate, southPoints }, null, 2));
