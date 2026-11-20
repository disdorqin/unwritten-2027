import assert from 'node:assert/strict';
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
    const stallShift = process.env.JX1_DIAGNOSTIC_STALL_5_SOUTH;
    if (stallShift && url.endsWith('/market-stall-layout.ts')) {
      const source = readFileSync(new URL(url), 'utf8');
      const anchor = '[23.5, -4.6, 4.9,';
      assert.equal(source.split(anchor).length, 2);
      const transformed = source.replace(anchor, `[23.5, ${-4.6 + Number(stallShift)}, 4.9,`);
      return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(transformed) };
    }
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
  { extensionRoadClearance, extensionStreetClearance },
] = await Promise.all([
  load('terrain'), load('landmark-village'), load('landmark-kit'), load('town-water'),
  load('town-pine-camp'), load('scenery'), load('district-layout'), load('streetscape'),
  load('forest-density'), load('extension-streets'), load('town-railway'), load('town-extension'),
]);

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
const ids = new Set(['old-town:137:168', 'old-town:158:184', 'old-town:186:104']);
const districts = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear, undefined, ids);
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
const { buildMarketLandmark } = await load('landmark-market');
const market = layout.plots.filter(p => ['market-stalls', 'lantern-workshop'].includes(p.id)).map(plot => {
  const group = buildMarketLandmark(plot);
  assert.ok(group, plot.id);
  group.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  return { id: plot.id, geometry: readWalkGeometry(group) };
});
const collision = { colliders: [...scenery.plazaCoverBoxes], floors: [], ramps: [] };
for (const component of [
  stageGeometry, ...market.map(entry => entry.geometry), ...[pineCamp.group, railway.group, extension.group].map(readWalkGeometry), ...districts.marketHomes.values(),
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
    dryTownLandingHeight, supportAt, obstructed, walkable, outdoorSurfaceAt,
    place: (east, north, feet) => { x = east; n = north; ground = feet; airHeight = undefined; },
    move: tryMove,
    pose: () => ({ x, n, ground, airHeight }),
  };
}`;
const deps = { grid, townWater, railway, scenery, districts, forest, streetscape, canEnter, bridgeAt, isWater,
  worldBounds, geometryAt, homeReturn, bodyRadius, activities };
const game = new Function('deps', stripTypeScriptTypes(factory) + '\nreturn production(deps);')(deps);

const plans = JSON.parse(readFileSync(new URL('./old-plan.json', import.meta.url), 'utf8'));
const focus = plans.tours.find(tour => tour.id === 'old-town:186:104');
assert.ok(focus);
const toPoint = ({ east, north }) => [east, north];
const cause = (east, north, hint) => {
  const feet = game.supportAt(east, north, hint + .43, hint + .025);
  return {
    terrain: grid.heightAt(east, north), surface: game.outdoorSurfaceAt(east, north), hint,
    candidateSupport: feet, heightDelta: feet - hint,
    nativeLanding: game.dryTownLandingHeight(east, north, hint) ?? null,
    withoutHint: game.dryTownLandingHeight(east, north) ?? null,
    walkable: game.walkable(east, north), rawPass: canEnter(east, north),
    obstruction: game.obstructed(east, north, feet), water: townWater.at(east, north) ?? null,
    rails: railway.vehicleBlocks(east, north, feet, 1.8, .27),
    gates: { scenery: scenery.blocked(east, north), cover: scenery.plazaCoverBlocks(east, north, .27),
      district: districts.blocked(east, north), forest: forest.blocked(east, north), streetscape: streetscape.blocked(east, north) },
    marketCollision: market.map(({id, geometry}) => ({
      id, colliders: geometry.colliders.filter(({min,max}) => {
        const dx = Math.max(min[0] - east, east - max[0], 0);
        const dz = Math.max(min[2] + north, -north - max[2], 0);
        return dx * dx + dz * dz < .27 * .27 && feet + .025 < max[1] && feet + 1.8 - .025 > min[1];
      }),
    })).filter(entry => entry.colliders.length),
  };
};

function auditKnots(points, interval) {
  const [first, ...rest] = points;
  const start = game.dryTownLandingHeight(first.east, first.north, first.ground);
  if (start === undefined) return { failed: { stage: first, exact: cause(first.east, first.north, first.ground) } };
  game.place(first.east, first.north, start);
  let maxStep = 0;
  const knots = [{ expected: first, actual: game.pose() }];
  let samples = 0;
  let previous = first;
  for (const finish of rest) {
    const steps = Math.ceil(Math.hypot(finish.east - previous.east, finish.north - previous.north) / interval);
    for (let i = 1; i <= steps; i++) {
      samples++;
      const position = [previous.east + (finish.east - previous.east) * i / steps,
        previous.north + (finish.north - previous.north) * i / steps];
      const before = game.pose();
      if (!game.move(...position)) return { failed: { point: position, before, actual: cause(...position, before.ground) }, knots };
      const after = game.pose();
      maxStep = Math.max(maxStep, Math.abs(after.ground - before.ground));
      if (after.airHeight !== undefined) return { failed: { point: position, before, after, actual: cause(...position, before.ground) }, knots };
    }
    knots.push({ expected: finish, actual: game.pose() });
    previous = finish;
  }
  return { maxStep, samples, knots };
}
const a = focus.start;
const original = cause(a.east, a.north, a.ground);
console.log(JSON.stringify({ portal: districts.housePortals.find(door => door.id === focus.id), original,
  start: a, next: focus.street[1], nextStage: cause(focus.street[1].east, focus.street[1].north, focus.street[1].ground) }));
if (original.withoutHint !== null) {
  const fixed = { ...a, ground: +original.withoutHint.toFixed(6) };
  const walk = [fixed, ...focus.street.slice(1), ...focus.ingress.slice(1), focus.object, ...focus.egress,
    ...focus.returnStreet.slice(1, -1), fixed];
  for (const interval of [.05, .125, 11.3/60]) {
    console.log(JSON.stringify({ interval, walk: auditKnots(walk, interval) }));
  }
  for (const p of [fixed, focus.street[1]]) {
    console.log(JSON.stringify({ corrected: p, measurement: cause(p.east,p.north,p.ground) }));
  }
}

const street = [
  { east: 173.25, north: 96, ground: 9.729403, tolerance: .13 },
  { east: 173.25, north: 112, ground: 9.839105, tolerance: .13 },
  focus.street[2],
];
const at = (east, north, tolerance = .1) => ({ east, north, ground: grid.heightAt(east, north), tolerance });
const combine = (street, ingress = focus.ingress, egress = focus.egress) => [...street, ...ingress.slice(1), focus.object, ...egress, ...street.slice(0,-1).reverse()];
const direct = combine(street);
const fixedDoor = cause(focus.street[2].east, focus.street[2].north, focus.street[2].ground);
const probe = waypoints => [.05, .125, 11.3 / 60].map(interval => {
  const run = auditKnots(waypoints, interval);
  return run.failed ? { interval, fail: run.failed } : { interval, samples: run.samples, maxStep: run.maxStep };
});
console.log(JSON.stringify({ exactStand: fixedDoor, direct: probe(direct) }));
if (!process.env.JX1_DIAGNOSTIC_STALL_5_SOUTH) {
  for (const offset of [-.5,-.45,-.42,-.4,-.39,-.38,-.37,.37,.38,.39,.4,.42,.45,.5]) {
    const north = 112 + offset;
    const amended = [
      street[0],
      at(173.25, north, .13),
      at(174.905, north),
      { ...focus.ingress[1], north },
      { ...focus.ingress[2], north },
      ...focus.ingress.slice(3),
      focus.object,
      ...focus.egress.slice(0,-1).map((point, index) => index ? { ...point, north } : point),
      at(174.905, north),
      at(173.25, north, .13),
      street[0],
    ];
    console.log(JSON.stringify({offset, stand: cause(174.905, north, grid.heightAt(174.905,north)), probe: probe(amended)}));
  }
}
const { marketStalls } = await load('market-fair');
const counters = marketStalls.map(({id,spot}) => ({ id, spot, standable: game.dryTownLandingHeight(spot.x,spot.n,spot.ground) ?? null }));
console.log(JSON.stringify({doorRegistry: districts.housePortals, counters}));
