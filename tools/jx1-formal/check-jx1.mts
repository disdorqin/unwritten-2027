import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { dryPorchLanding, legacyAnchorContact, probePorch, type MarketHome } from './probe-porch.mts';
import { auditBookLanding, productionLandingHelper } from './check-book-landing.mts';

const [tree, mode, snapshotFile, ...options] = process.argv.slice(2);
assert.ok(tree && ['snapshot', 'baseline', 'candidate'].includes(mode), [
  'Usage: check-jx1.mts CHECKOUT snapshot',
  '       check-jx1.mts CHECKOUT baseline|candidate BASELINE.json [--require-all] [--known-book-four|--known-book-five] [--viewer=FILE]',
].join('\n'));
assert.ok(mode === 'snapshot' || snapshotFile);
const root = resolve(tree);
const source = (module: string) =>
  import(pathToFileURL(resolve(root, 'tools/voxel-tavern/town-blockout', module + '.ts')).href);
const require = createRequire(resolve(root, 'package.json'));
const { Group } = require('three');
const [
  { buildPineCamp }, { canEnter, createTerrainGrid, layout }, { createTownRailway }, { addScenery },
  { addDistrictHousing }, { buildExtensionStreets }, { buildVillageLandmark, villageHousePortals },
  { createHouseDoorBook, findHouseDoorLanding },
] = await Promise.all([
  source('town-pine-camp'), source('terrain'), source('town-railway'), source('scenery'),
  source('district-layout'), source('extension-streets'), source('landmark-village'), source('town-house-door-book'),
]);

// B-04 §1, integrated submission b8ccd857. Order here follows the signed ticket, not the legacy registry.
const approved = [
  '137:168', '158:184', '179:155', '173:135', '156:141', '94:100', '137:70', '188:65', '217:66',
  '234:74', '186:104', '206:110', '228:110', '246:114', '246:135', '220:138', '197:132',
].map(address => 'old-town:' + address);
const approvedSet = new Set(approved);
const unlisted = ['old-town:349:184', 'district:513:366', 'village:0', 'old-town:137:129'];
const grid = createTerrainGrid();
const railway = createTownRailway(grid, () => 0);
const landscape = new Group();
const pineCamp = buildPineCamp(grid);
// CPU-only canvas substitute reused from tests/town-blockout-house-portals.test.ts.
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
  }) }) },
});
let scenery;
try {
  scenery = addScenery(landscape, grid, pineCamp.keepClear);
} finally {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
}
const villagePlot = layout.plots.find((plot: { id: string }) => plot.id === 'cabins');
assert.ok(villagePlot);
const village = buildVillageLandmark(villagePlot);
village.position.set(villagePlot.origin[0], villagePlot.origin[2], -villagePlot.origin[1]);
const cottages = villageHousePortals(village, grid.heightAt);

type Door = { id: string; zone: string; x: number; n: number; ground: number; exitYaw: number };
type Site = { x: number; n: number; w: number; d: number; angle: number; style: string; variant: number };
const encode = (value: number) => {
  assert.ok(Number.isFinite(value));
  return Object.is(value, -0) ? '-0' : value;
};
const doorRow = ({ id, zone, x, n, ground, exitYaw }: Door) =>
  [id, zone, ...[x, n, ground, exitYaw].map(encode)];
const normals = ({ exitYaw }: Door) => [Math.sin(exitYaw), Math.cos(exitYaw)] as const;
function doorProbe(door: Door, setback: number, offset: number): [number, number] {
  const [east, north] = normals(door);
  return [door.x - east * setback + north * offset, door.n - north * setback - east * offset];
}
function foundation(site: Site) {
  const quarterTurn = Math.abs(Math.sin(site.angle)) > .5;
  const halfWidth = (quarterTurn ? site.d : site.w) / 2 + 1;
  const halfDepth = (quarterTurn ? site.w : site.d) / 2 + 1;
  const samples = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(z =>
    grid.heightAt(site.x + x * halfWidth, site.n + z * halfDepth)));
  return {
    samples,
    min: Math.min(...samples),
    max: Math.max(...samples),
    expected: Math.max(grid.heightAt(site.x, site.n), ...samples) + .14,
  };
}
function buildWorld(requested?: ReadonlySet<string>) {
  const start = performance.now();
  const district = addDistrictHousing(new Group(), grid, scenery.blocked, railway.keepClear, undefined, requested);
  const extension = buildExtensionStreets(grid, railway.keepClear, district.keepClear);
  // Viewer registers the village synchronously, then the lazily constructed extension streets.
  const legacyOrder: Door[] = [...district.housePortals, ...cottages, ...extension.housePortals];
  const market = district.housePortals.filter((door: Door) => door.zone === 'market');
  assert.deepEqual(market.map((door: Door) => door.id).sort(), [...approved].sort());
  assert.equal(legacyOrder.length, 92);
  assert.equal(new Set(legacyOrder.map(({ id }) => id)).size, 92);
  assert.equal(district.sites.length, district.housePortals.length);
  const bookOrder = createHouseDoorBook(legacyOrder, []).map(group =>
    [group.zone, ...group.rows.map(row => row.door.id)]);
  assert.deepEqual(bookOrder.map(row => row.length - 1), [9, 28, 14, 20, 21]);
  const oldTown = district.housePortals.map((door: Door, index: number) => ({
    id: door.id,
    site: district.sites[index] as Site,
    returnStandBlocked: district.blocked(door.x, door.n),
    frontage: [1.12, 1.42, 1.72].map(setback =>
      [-1, 0, 1].map(offset => district.blocked(...doorProbe(door, setback, offset)))),
  }));
  const keyPositions = market.map((door: Door) => ({
    id: door.id,
    frontageAtWall: doorProbe(door, 1.42, 0),
    foundation: foundation(district.sites[district.housePortals.indexOf(door)]),
  }));
  return {
    district, market, legacyOrder, elapsedMs: performance.now() - start,
    snapshot: { doors: legacyOrder.map(doorRow), bookOrder, oldTown, keyPositions },
  };
}
function legacyRows(actual: ReturnType<typeof buildWorld>, expected: ReturnType<typeof buildWorld>['snapshot']) {
  assert.equal(actual.snapshot.doors.length, expected.doors.length);
  for (const [index, row] of actual.snapshot.doors.entries()) {
    assert.deepEqual(row, expected.doors[index], 'changed ID/position/yaw or registration order at ' + index);
  }
  assert.deepEqual(actual.snapshot.bookOrder, expected.bookOrder, 'changed door-book order or zone');
  assert.deepEqual(actual.snapshot.keyPositions, expected.keyPositions, 'changed foundation or market door wall position');
  const { district, snapshot } = actual;
  const activeIds: ReadonlySet<string> = new Set(district.marketHomes?.keys() ?? []);
  for (const [index, row] of snapshot.oldTown.entries()) {
    const before = expected.oldTown[index];
    assert.deepEqual(row.site, before.site, row.id + ' legacy site moved');
    assert.equal(row.returnStandBlocked, false, row.id + ' legacy return stand obstructed');
    if (!activeIds.has(row.id)) assert.deepEqual(row.frontage, before.frontage, row.id + ' inactive frontage changed');
  }
}
function validatePolicy(actual: ReturnType<typeof buildWorld>, requested: ReadonlySet<string>) {
  const { district } = actual;
  assert.ok(district.marketHomes instanceof Map, 'missing staged housing API');
  const activated: string[] = [...district.marketHomes.keys()];
  for (const id of activated) {
    assert.ok(approvedSet.has(id) && requested.has(id), id + ' was activated without approval');
  }
  assert.deepEqual(activated.filter(id => unlisted.includes(id)), []);
  return { active: activated, held: approved.filter(id => requested.has(id) && !district.marketHomes.has(id)),
    elapsedMs: actual.elapsedMs };
}

function auditGeometry(actual: ReturnType<typeof buildWorld>, baseline: ReturnType<typeof buildWorld>, hasBookHelper: boolean) {
  const { district, snapshot } = actual;
  const lookup = new Map<string, ReturnType<typeof foundation>>(snapshot.keyPositions.map(p => [p.id, p.foundation]));
  const audits = [];
  const problems: string[] = [];
  const start = performance.now();
  for (const [id, home] of district.marketHomes as Map<string, MarketHome>) {
    const expected = lookup.get(id);
    assert.ok(expected, 'unknown market home ' + id);
    assert.equal(home.id, id);
    const portal = district.housePortals.find((door: Door) => door.id === id);
    assert.deepEqual(doorRow(home.portal), doorRow(portal), id + ' legacy action points to a different portal');
    assert.ok(Math.abs(home.foundationY - expected.expected) <= 1e-10, id + ' foundation sample mismatch');
    assert.ok(Math.abs(home.minTerrainY - expected.min) <= 1e-10, id + ' minimum terrain sample mismatch');
    assert.ok(Math.abs(home.maxTerrainY - expected.max) <= 1e-10, id + ' maximum terrain sample mismatch');
    assert.ok(home.colliders.length > 0 && home.floors.length > 0, id + ' would open a nonphysical room');
    assert.deepEqual(legacyAnchorContact(home), { raisesGround: false, hitsBody: false }, id + ' legacy B13 standing envelope changed');
    const before = findHouseDoorLanding(portal, (x, n) =>
      canEnter(x, n) && !baseline.district.blocked(x, n) && !scenery.blocked(x, n) ? grid.heightAt(x, n) : undefined);
    const after = findHouseDoorLanding(portal, (x, n) => canEnter(x, n) && !district.blocked(x, n) &&
      !scenery.blocked(x, n) ? dryPorchLanding(home, [x, n], grid.heightAt(x, n)) : undefined);
    if (before && !after && !hasBookHelper) problems.push(id + ' book destination has no available unoccupied landing');
    const evidence = probePorch(home, grid.heightAt, (east, north) =>
      !canEnter(east, north) || scenery.blocked(east, north) || district.blocked(east, north));
    for (const [direction, row] of [['forward', evidence.forward], ['backward', evidence.backward]] as const) {
      if (row.failures) problems.push(id + ' ' + direction + ' grounded capsule sweep');
      if (!(row.minLeft > 0 && row.minRight > 0 && row.minWidth > .54 && row.minHeight > 1.8) ||
        ![row.minLeft, row.minRight, row.minWidth, row.minHeight].every(Number.isFinite)) {
        problems.push(id + ' ' + direction + ' positive measured throat margins');
      }
    }
    if (!evidence.wallSides.every(side => side.blocked)) problems.push(id + ' both walls beside the opening');
    audits.push({ ...evidence, bookLanding: { before: before ?? null, after: after ?? null } });
  }
  return { elapsedMs: performance.now() - start, audits, problems };
}

function bookReport(actual: ReturnType<typeof buildWorld>, baseline: ReturnType<typeof buildWorld>) {
  const homes = actual.district.marketHomes as ReadonlyMap<string, MarketHome>;
  const viewerPath = options.find(value => value.startsWith('--viewer='))?.slice('--viewer='.length);
  const choose = productionLandingHelper(root, require, findHouseDoorLanding, homes, viewerPath);
  if (!choose) return;
  const geometry = {
    colliders: Array.from(homes.values()).flatMap(value => value.colliders),
    floors: Array.from(homes.values()).flatMap(value => value.floors),
    ramps: Array.from(homes.values()).flatMap(value => value.ramps),
  };
  const start = performance.now();
  const audit = auditBookLanding(actual.legacyOrder, findHouseDoorLanding, choose, id => homes.has(id),
    (x, n) => canEnter(x, n) && !baseline.district.blocked(x, n) && !scenery.blocked(x, n) ? grid.heightAt(x, n) : undefined,
    (x, n) => canEnter(x, n) && !actual.district.blocked(x, n) && !scenery.blocked(x, n)
      ? dryPorchLanding(geometry, [x, n], grid.heightAt(x, n)) : undefined);
  return { ...audit, elapsedMs: performance.now() - start };
}

const plain = buildWorld();
if (mode === 'snapshot') {
  assert.equal(plain.district.marketHomes?.size ?? 0, 0);
  for (const door of plain.market) {
    assert.ok(plain.district.blocked(...doorProbe(door, 1.42, 0)), door.id + ' frozen frontage is not sealed');
  }
  console.log(JSON.stringify(plain.snapshot, null, 2));
} else {
  const expected = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  legacyRows(plain, expected);
  assert.equal(plain.district.marketHomes?.size ?? 0, 0);
  if (mode === 'baseline') {
    console.log(JSON.stringify({ exactDoors: plain.snapshot.doors.length, defaultElapsedMs: plain.elapsedMs }, null, 2));
  } else {
    const deniedIds = new Set(unlisted);
    const denied = buildWorld(deniedIds);
    legacyRows(denied, expected);
    const deniedOutcome = validatePolicy(denied, deniedIds);
    assert.deepEqual(deniedOutcome.active, [], 'unlisted IDs must stay legacy');
    const requested = new Set(approved);
    const trial = buildWorld(requested);
    legacyRows(trial, expected);
    const outcome = validatePolicy(trial, requested);
    const book = bookReport(trial, plain);
    const geometry = auditGeometry(trial, plain, book !== undefined);
    let mixedOutcome;
    if (outcome.active.length) {
      const one = new Set([outcome.active[0], ...unlisted]);
      const mixed = buildWorld(one);
      legacyRows(mixed, expected);
      mixedOutcome = validatePolicy(mixed, one);
      assert.deepEqual(mixedOutcome.active, [outcome.active[0]], 'one request must not open another frontage');
    }
    console.log(JSON.stringify({ exactDoors: plain.snapshot.doors.length, defaultElapsedMs: plain.elapsedMs,
      denied: deniedOutcome, requestedAllForTestOnly: outcome, mixed: mixedOutcome, book, geometry }, null, 2));
    if (options.includes('--require-all')) assert.deepEqual(outcome.held, []);
    if (options.includes('--known-book-four') || options.includes('--known-book-five')) {
      assert.ok(book, 'viewer resolver unavailable');
      const expectedExceptions = [
        'old-town:186:104', 'old-town:197:132', 'old-town:246:114', 'old-town:246:135',
      ];
      if (options.includes('--known-book-five')) expectedExceptions.unshift('old-town:137:168');
      assert.deepEqual(book.exceptions.map(entry => entry.id).sort(), expectedExceptions);
    }
    if (book) assert.deepEqual(book.failures, []);
    assert.deepEqual(geometry.problems, []);
  }
}
