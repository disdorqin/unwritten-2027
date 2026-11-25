import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { Group } from 'three';
import { ceremonyMainLandings, ceremonyEdgeLandings } from './src/presence/ceremony-arrival.ts';
import { inPlazaPhotoStand } from './src/presence/plaza-photo.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
      return nextResolve(specifier + '.ts', context);
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: 'export default ' + readFileSync(new URL(url), 'utf8') };
    }
    return nextLoad(url, context);
  },
});

const load = name => import('./tools/voxel-tavern/town-blockout/' + name + '.ts');
const [
  { canEnter, bridgeAt, isWater, createTerrainGrid, worldBounds, layout },
  { buildVillageLandmark }, { readWalkGeometry }, { createTownWater },
  { buildPineCamp }, { addScenery }, { addDistrictHousing }, { addStreetscape },
  { addForestDensity }, { buildExtensionStreets }, { createTownRailway },
  { extensionRoadClearance, extensionStreetClearance }, { theaterPhotoPositions },
  { buildTowerLandmark }, { buildPostLandmark }, { buildTavernLandmark }, { buildTavernWarmShed },
] = await Promise.all([
  load('terrain'), load('landmark-village'), load('landmark-kit'), load('town-water'),
  load('town-pine-camp'), load('scenery'), load('district-layout'), load('streetscape'),
  load('forest-density'), load('extension-streets'), load('town-railway'), load('town-extension'),
  load('community-theater'), load('landmark-tower'), load('landmark-post'), load('landmark-tavern'), load('tavern-warm-shed'),
]);

const noOp = () => {};
const drawing = new Proxy({
  createRadialGradient: () => ({ addColorStop: noOp }),
  createLinearGradient: () => ({ addColorStop: noOp }),
  measureText: text => ({ width: text.length * 12 }),
}, { get: (state, key) => state[key] ?? noOp });
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
  (east, north, radius) => extensionRoadClearance(east, north, radius) ||
    railway.keepClear(east, north, radius) || extensionStreetClearance(east, north, radius));
const extension = buildExtensionStreets(grid, railway.keepClear, districts.keepClear);
const plot = layout.plots.find(point => point.id === 'stage');
assert.ok(plot);
const stage = buildVillageLandmark(plot);
stage.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
const stageGeometry = readWalkGeometry(stage);
const nearPlots = [['clocktower', buildTowerLandmark], ['post-office', buildPostLandmark], ['tavern', buildTavernLandmark]].map(([id, build]) => {
  const row = layout.plots.find(point => point.id === id);
  assert.ok(row);
  const group = build(row);
  if (id === 'tavern') {
    const shed = buildTavernWarmShed(row, grid.heightAt);
    group.add(shed.group);
    group.userData.colliders.push(...shed.colliders);
  }
  group.position.set(row.origin[0], row.origin[2], -row.origin[1]);
  return group;
});
const collision = { colliders: [...scenery.plazaCoverBoxes], floors: [], ramps: [] };
for (const component of [
  stageGeometry, ...[pineCamp.group, railway.group, extension.group, ...nearPlots].map(readWalkGeometry),
]) {
  for (const kind of Object.keys(collision)) collision[kind].push(...component[kind]);
}
const geometryAt = () => collision;
const homeReturn = undefined;
const bodyRadius = .27;
const activities = [];
const functions = ['walkable', 'outdoorWalkable', 'outdoorSurfaceAt', 'surfaceAt', 'overlapsBody', 'supportAt',
  'obstructed', 'dryTownLandingHeight', 'tryMove'];
const viewer = readFileSync(new URL('./tools/voxel-tavern/town-blockout/viewer.ts', import.meta.url), 'utf8');
const exactSource = functions.map(name => {
  const result = viewer.match(new RegExp('^function ' + name + '\\([\\s\\S]*?^}', 'm'));
  assert.ok(result, name);
  return result[0];
}).join('\n');
const factory = `function production(deps) {
  const { grid, townWater, railway, scenery, districts, forest, streetscape,
    canEnter, bridgeAt, isWater, worldBounds, geometryAt, homeReturn, bodyRadius, activities } = deps;
  const outdoorGeometryAt = geometryAt;
  const bodyHeight = 1.8, stepHeight = .43, surfaceEpsilon = .025;
  const landingFeedback = { begin() {} };
  let x, n, ground, airHeight, riseSpeed;
  ${exactSource}
  return {
    dryTownLandingHeight, supportAt, obstructed,
    place: (east, north, feet) => { x = east; n = north; ground = feet; airHeight = undefined; },
    move: tryMove,
    pose: () => ({ x, n, ground, airHeight }),
  };
}`;
const deps = { grid, townWater, railway, scenery, districts, forest, streetscape, canEnter, bridgeAt, isWater,
  worldBounds, geometryAt, homeReturn, bodyRadius, activities };
const game = new Function('deps', stripTypeScriptTypes(factory) + '\nreturn production(deps);')(deps);

function auditSweep(points, interval) {
  const [from, ...next] = points;
  let start = from;
  const initial = game.dryTownLandingHeight(...from, grid.heightAt(...from) + .015);
  if (initial === undefined) return { failed: { stage: from }, path: points };
  game.place(...from, initial);
  let maxStep = 0;
  let steps = 0;
  const knots = [{ point: from, support: initial }];
  for (const finish of next) {
    const count = Math.ceil(Math.hypot(finish[0] - start[0], finish[1] - start[1]) / interval);
    for (let i = 1; i <= count; i++) {
      const point = start.map((coordinate, axis) => coordinate + (finish[axis] - coordinate) * i / count);
      const before = game.pose();
      if (!game.move(...point)) return { failed: { point, before, surface: grid.heightAt(...point), attempt: 'blocked' }, knots };
      steps++;
      const after = game.pose();
      maxStep = Math.max(maxStep, Math.abs(after.ground - before.ground));
      if (after.airHeight !== undefined) return { failed: { point, before, after, surface: grid.heightAt(...point), attempt: 'airborne' }, knots };
    }
    knots.push({ point: finish, support: game.pose().ground });
    start = finish;
  }
  return { maxStep, steps, knots };
}


const routes = {
  'N152 present plaza-to-stage stairs': [[238,152], [238,147], [238,142]],
  'west ramp to the rear photo tier': [[203.8,164.75], [204.8,164.75], [216,164.75], [217,164.75]],
  'east ramp to the rear photo tier': [[244.2,164.75], [243.2,164.75], [232,164.75], [231,164.75]],
  'northwest plaza seam': [[159,202], [161,202], [165,202]],
  'southwest plaza seam': [[159,181], [161,181], [165,181]],
  'southeast plaza seam': [[245,155], [245,152], [245,150]],
  'central aisle from the plaza spawn': [[223,180], [223,196], [223,208]],
};
const roundTrips = Object.fromEntries(Object.entries(routes).map(([name, points]) =>
  [name, auditSweep(points.concat(points.slice(0, -1).reverse()), .05)]));
const [west, south, east, north] = layout.plaza.bounds;
const behind = { north: Math.round(-Math.max(...stageGeometry.colliders.filter(x => x.max[0] - x.min[0] === 16)
  .map(box => box.max[2])) * 100) / 100 };
const floors = stageGeometry.floors.slice(0, 2);
const photos = theaterPhotoPositions.map(({ east, north, height }) => ({
  east: Math.round(east * 1e5) / 1e5, north, height, valid: inPlazaPhotoStand(east, north, height),
  found: game.dryTownLandingHeight(east, north, height) ?? null,
}));
const ceremony = [...ceremonyMainLandings, ...ceremonyEdgeLandings].map(({east, north}) => ({
  east, north, found: game.dryTownLandingHeight(east, north) ?? null,
}));
const surface = [];
for (let n = south; n <= north; n++) {
  for (let e = west; e <= east; e++) surface.push(grid.heightAt(e, n));
}
console.log(JSON.stringify({
  plaza: { bounds: layout.plaza.bounds, area: (east - west) * (north - south), samples: surface.length,
    height: [Math.min(...surface), Math.max(...surface)], spawn: layout.plaza.spawn },
  stage: { plot, floors, backstageWallNorth: Number.isFinite(behind.north) ? behind.north : null },
  roundTrips,
  photos: { first: photos[0], last: photos.at(-1), total: photos.length, cameraEligible: photos.filter(spot => spot.valid).length,
    accepted: photos.filter(spot => spot.found === spot.height).length },
  ceremony: { main: ceremonyMainLandings.length, edge: ceremonyEdgeLandings.length,
    physicalDry: ceremony.filter(spot => spot.found !== null).length, rejects: ceremony.filter(spot => spot.found === null) },
}, null, 2));
