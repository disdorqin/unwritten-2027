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

// Fixed 92-door snapshot from the B2a layout [161, 152, 251, 212]. Use IDs,
// rather than just the total, so an accidental replacement door cannot cover a loss.
const baselineDoorIds = [
  ...[
    '101:184', '105:152', '117:202', '133:266', '137:168', '137:70', '149:281',
    '156:141', '158:184', '172:282', '172:323', '173:135', '179:155', '179:248',
    '186:104', '188:65', '191:282', '191:325', '197:132', '199:262', '200:151',
    '202:247', '206:110', '216:280', '217:66', '220:138', '221:251', '228:110',
    '234:74', '246:114', '246:135', '249:264', '253:243', '262:180', '264:228',
    '329:155', '331:172', '337:130', '349:184', '351:144', '358:163', '364:207',
    '375:177', '391:234', '405:51', '406:165', '410:119', '410:219', '414:190',
    '422:101', '70:229', '94:100',
  ].map(address => 'old-town:' + address),
  ...[
    '125:470', '145:467', '151:493', '168:489', '211:491', '410:343', '421:363',
    '489:438', '502:401', '503:451', '513:366', '516:273', '520:417', '521:82',
    '528:207', '532:448', '535:267', '539:85', '550:412', '551:385', '551:65',
    '552:216', '554:272', '555:438', '560:85', '571:376', '572:280', '576:207',
    '586:136', '589:295', '590:362', '603:314', '603:338', '619:146', '620:175',
    '76:449', '92:477', '94:431',
  ].map(address => 'district:' + address),
  'village:0', 'village:1',
].sort();

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
      fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
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
  const actualIds = portals.map(({ id }) => id).sort();
  const registry = new Set(actualIds);
  assert.equal(registry.size, portals.length);
  const baselineRegistry = new Set(baselineDoorIds);
  const missing = baselineDoorIds.filter(id => !registry.has(id));
  const added = actualIds.filter(id => !baselineRegistry.has(id));
  const rejectedById = new Map(district.rejectedHomes.map(home => [home.id, home]));
  const details = missing.map(id => {
    const rejection = rejectedById.get(id);
    if (!rejection) return id;
    const { zone, location, relocated, reason, overlapsPlaza } = rejection;
    return `${id} ${zone} [${location.join(', ')}] (${relocated ? 'mapped' : 'unmapped'}, ${reason}${overlapsPlaza ? ', plaza overlap' : ''})`;
  });
  const diff = [`missing ${missing.length}: ${details.join('; ') || 'none'}`,
    `added ${added.length}: ${added.join(', ') || 'none'}`].join('\n');
  t.diagnostic(`checked ${district.count} old-town homes, ${extensions.counts.buildings} district homes, and ${cottagePortals.length} decorative cottages`);
  assert.equal(portals.length, 92, `the plaza work preserves the 92-door registry\n${diff}`);
  assert.deepEqual(actualIds, baselineDoorIds, `the 92-door registry preserves every B2a ID\n${diff}`);
  t.diagnostic(diff);

  const [west, south, plazaEast, plazaNorth] = layout.plaza.bounds;
  const moved = Array.from(district.relocations, ([address, [east, north]]) => [address, east, north] as const);
  for (const [address, east, north] of moved) {
    const site = district.sites.find(site => site.x === east && site.n === north);
    assert.ok(site, `${address} was built at its approved receiving location [${east}, ${north}]`);
    assert.ok(registry.has('old-town:' + address), `${address} stable door ID`);
    const sideways = Math.abs(Math.sin(site.angle)) > .5;
    const halfEast = (sideways ? site.d : site.w) / 2 + 1;
    const halfNorth = (sideways ? site.w : site.d) / 2 + 1;
    assert.ok(east + halfEast <= west - 1.4 || east - halfEast >= plazaEast + 1.4 ||
      north + halfNorth <= south - 1.4 || north - halfNorth >= plazaNorth + 1.4, `${address} plaza edge clear`);
    const paths = layout.roads.flatMap(({ points, width }) => points.slice(1).map((end, index) =>
      ({ start: points[index], end, halfWidth: width / 2 })));
    let minimum = Infinity;
    for (let ix = -8; ix <= 8; ix++) for (let iz = -8; iz <= 8; iz++) {
      const x = east + ix * halfEast / 8, n = north + iz * halfNorth / 8;
      for (const { start, end, halfWidth } of paths) {
        const dx = end[0] - start[0], dn = end[1] - start[1];
        const along = Math.max(0, Math.min(1, ((x - start[0]) * dx + (n - start[1]) * dn) / (dx * dx + dn * dn)));
        minimum = Math.min(minimum, Math.hypot(x - start[0] - along * dx, n - start[1] - along * dn) - halfWidth);
      }
    }
    assert.ok(minimum >= 1.2, `${address} road gap ${minimum.toFixed(3)} m`);
    t.diagnostic(`${address} road gap ${minimum.toFixed(3)} m`);
  }
  const colliders = [...readWalkGeometry(extensions.group).colliders, ...readWalkGeometry(village).colliders];
  function clear(x: number, n: number) {
    return canEnter(x, n) && !isWater(x, n) && !district.blocked(x, n) &&
      !scenery.blocked(x, n) && !forest.blocked(x, n) && !streetscape.blocked(x, n);
  }
  for (const id of moved.map(([address]) => 'old-town:' + address)) {
    const door = portals.find(portal => portal.id === id)!;
    const offsets: [number, number][] = [[0, 0]];
    const visited = new Set(['0:0']);
    let roadReached = false;
    for (const [dx, dn] of offsets) {
      const x = door.x + dx / 2, n = door.n + dn / 2;
      if (grid.surfaces[Math.round(n) * grid.gridWidth + Math.round(x)] === 1) {
        roadReached = true;
        break;
      }
      for (const [ix, iz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextX = dx + ix, nextN = dn + iz;
        const key = nextX + ':' + nextN;
        if (Math.abs(nextX) + Math.abs(nextN) > 85 || visited.has(key)) continue;
        const east = x + ix / 2, north = n + iz / 2;
        if (!clear(east, north) || !clear(x + ix / 4, n + iz / 4) ||
          Math.abs(grid.heightAt(east, north) - grid.heightAt(x, n)) > .4) continue;
        visited.add(key);
        offsets.push([nextX, nextN]);
      }
    }
    assert.ok(roadReached, `${id} has a walkable route to an existing road`);
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
});
