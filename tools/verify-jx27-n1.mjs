import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { createRequire } from 'node:module';
const { Group, Scene, Vector3 } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three');
const sourceFiles = {
  'layout.json': '9dae6c135cd19d845c9f5b9153d66d845fb5f7c0',
  'plaza-snow-supply.ts': '7270e82f4fb363074735ca49caa2e3a80e7f370d',
  'town-snowball-world.ts': '173103caeecd9a10ba5255c08bc35393308cce5d',
  'town-snowball.ts': 'c94e714ad4c0a02f804578956fbaeeda304aa6c8',
  'viewer.ts': '72cc9c1d1eb946211844850a95392381c5a8871d',
};
for (const [file, expected] of Object.entries(sourceFiles)) {
  const data = readFileSync(new URL(`./voxel-tavern/town-blockout/${file}`, import.meta.url));
  const actual = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
  assert.equal(actual, expected, `${file} differs from the published source`);
}

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

const load = name => import('../tools/voxel-tavern/town-blockout/' + name + '.ts');
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
const viewer = readFileSync(new URL('../tools/voxel-tavern/town-blockout/viewer.ts', import.meta.url), 'utf8');
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


const spawn = layout.plaza.spawn;
const [west, south, east, north] = layout.plaza.bounds;
const plazaCenter = [(west + east) / 2, (south + north) / 2];
const mayor = [spawn[0], spawn[1] + 3];
const tower = layout.plots.find(point => point.id === 'clocktower');
const bearing = ([e, n]) => Math.atan2(e - spawn[0], n - spawn[1]) * 180 / Math.PI;
const walkRoutes = Object.fromEntries(Object.entries({
  mayor: [spawn, mayor],
  tutorial: [mayor, spawn, [247, 180], [247, 155], [233, 155], [233, 158.5]],
  stageFront: [[233, 158.5], [233, 155], [238, 155], [238, 152]],
}).map(([label, points]) => [label, auditSweep(points, .05)]));
const directRoute = auditSweep([spawn, [223, 155]], .05);

const { snowPracticeStand, snowPracticeTarget } = await load('town-snow-target');
const { createTownSnowballFight } = await load('town-snowball');
const { createSnowballSweep } = await load('town-snowball-world');
const { createPlazaSnowSupply } = await load('plaza-snow-supply');
const stand = [233, 158.5];
const target = [241, 158.5];
const targetGround = grid.heightAt(...target);
const trainingTarget = {
  id: 'first-night-probe', label: 'probe', x: target[0], y: targetGround, z: -target[1],
  radius: .6 * 1.5, height: 2.35, shape: 'box', onHit() {},
};
const occupiedAt = (east, north, height) => {
  if (east < 1 || north < 1 || east > worldBounds.width - 1 || north > worldBounds.depth - 1) return true;
  const relative = height - grid.heightAt(east, north);
  return (relative <= 7 && districts.blocked(east, north)) ||
    (relative <= 8 && forest.blocked(east, north)) ||
    (relative <= 3 && (scenery.blocked(east, north) || streetscape.blocked(east, north)));
};
function targetSweep(target) {
  return createSnowballSweep({
    geometryAt, surfaceHeight: grid.heightAt, occupiedAt,
    targets: [target], scoreAt: () => true,
  });
}
const sweep = targetSweep(trainingTarget);
const normalSweep = targetSweep({ ...trainingTarget, radius: .6 });
const sideOffset = .75;
const sideFrom = new Vector3(239, targetGround + 1.2, -target[1] + sideOffset);
const sideTo = new Vector3(241, targetGround + 1.2, -target[1] + sideOffset);
const extraReach = { sideOffset,
  normalHit: normalSweep(sideFrom, sideTo, .115)?.targetId === trainingTarget.id,
  trainingHit: sweep(sideFrom, sideTo, .115)?.targetId === trainingTarget.id,
};
const eye = new Vector3(stand[0], grid.heightAt(...stand) + 1.65 - .08, -stand[1]);
const scoop = new Vector3(233, grid.heightAt(233, 160) + .22, -160);
const supply = createPlazaSnowSupply(() => 0);
const scoopDirection = scoop.sub(eye).normalize();
const scoopOrigin = eye.clone().addScaledVector(scoopDirection, .06);
const scoopEnd = scoopOrigin.clone().addScaledVector(scoopDirection, 2.44);
const source = supply.aimed(scoopOrigin, scoopEnd, grid.heightAt, sweep(scoopOrigin, scoopEnd, 0));
const events = [];
const scene = new Scene();
const fight = createTownSnowballFight({ scene, sweep, onEvent: event => events.push(event), now: () => 0 });
const gathered = source?.id === 'south' && supply.gather(fight, 0, source);
const ammoAfterGather = fight.getState().ammo;
const heading = new Vector3(1, 0, 0);
const origin = eye.clone().addScaledVector(heading, .06);
fight.showAim(origin, heading, 1, 'local');
const aimMarker = scene.getObjectByName('Town snowball aim marker');
const marker = { visible: aimMarker?.visible, position: aimMarker?.position.toArray() };
const thrown = gathered && fight.throwBall(origin, heading, 'local', 1);
for (let tick = 0; tick < 42; tick++) fight.update(1 / 60);
const impact = events.find(event => event.type === 'impact');
const testedState = fight.getState();
fight.dispose();

const note = {
  base: '75859a094757c5dcee8b874eef86ec37f4204907',
  sourceFiles,
  bounds: layout.plaza.bounds, plazaCenter, spawn, mayor,
  spawnY: game.dryTownLandingHeight(...spawn), mayorY: game.dryTownLandingHeight(...mayor),
  facing: { northYawDegrees: 0, towerBearing: bearing(tower.origin), stageBearing: bearing(plot.origin),
    stageNorthEdge: plot.origin[1] + plot.footprint[1] / 2, spawnNorth: spawn[1] },
  oldRange: { stand: snowPracticeStand, target: snowPracticeTarget,
    distance: Math.hypot(snowPracticeStand[0] - snowPracticeTarget[0], snowPracticeStand[1] - snowPracticeTarget[1]) },
  walkRoutes, directRoute,
  training: { stand, target, standY: game.dryTownLandingHeight(...stand), targetY: game.dryTownLandingHeight(...target),
    distance: Math.hypot(stand[0] - target[0], stand[1] - target[1]),
    modelDiameter: 1.2, hitRadius: trainingTarget.radius, extraReach,
    source: source?.id, gathered, ammoAfterGather, marker, thrown, testedState,
    launchId: events.find(event => event.type === 'throw')?.id,
    impact: impact && { id: impact.id, target: impact.targetId, scored: impact.scored, at: impact.at.toArray() } },
};
console.log(JSON.stringify(note, null, 2));
assert.equal(note.spawnY, 12);
assert.equal(note.mayorY, 12);
assert.ok(note.facing.stageNorthEdge < spawn[1]);
assert.equal(note.oldRange.distance, 10);
for (const [label, route] of Object.entries(walkRoutes)) assert.equal(route.failed, undefined, label);
assert.deepEqual(directRoute.failed?.point, [223, 165.75]);
assert.equal(note.training.distance, 8);
assert.equal(note.training.standY, 12);
assert.equal(note.training.targetY, 12);
assert.deepEqual(extraReach, { sideOffset: .75, normalHit: false, trainingHit: true });
assert.ok(gathered && thrown && marker.visible);
assert.equal(ammoAfterGather, 5);
assert.equal(testedState.ammo, ammoAfterGather - 1);
assert.equal(testedState.hits, 1);
assert.equal(note.training.impact?.target, trainingTarget.id);
assert.ok(note.training.impact.scored);
assert.equal(note.training.impact.id, note.training.launchId);
assert.ok(aimMarker.position.distanceTo(impact.at) < 1e-6);
