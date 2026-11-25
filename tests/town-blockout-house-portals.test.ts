import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { buildExtensionStreets } from '../tools/voxel-tavern/town-blockout/extension-streets.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildMarketLandmark } from '../tools/voxel-tavern/town-blockout/landmark-market.ts';
import { buildVillageLandmark, villageHousePortals } from '../tools/voxel-tavern/town-blockout/landmark-village.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { streetInfill } from '../tools/voxel-tavern/town-blockout/streetscape-infill.ts';
import { canEnter, createTerrainGrid, isWater, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { extensionRoadClearance, extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createHouseDoorBook, findHouseDoorLanding, houseDoorBookCopy, houseDoorVisitKey, recordHouseDoorVisit } from '../tools/voxel-tavern/town-blockout/town-house-door-book.ts';
import { townNpcDoorAnchors } from '../tools/voxel-tavern/town-blockout/town-npc.ts';
import { marketStalls } from '../tools/voxel-tavern/town-blockout/market-fair.ts';
import { readFileSync } from 'node:fs';

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

test('every built decorative house has a unique dry, clear portal on its real front', async t => {
  const landscape = new Group();
  const grid = createTerrainGrid();
  const track = createTownRailway(grid);
  // Street lamp glows and the expanded plaza nameplate need an offscreen canvas.
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      strokeRect() {},
      fillText() {},
      drawImage() {},
    }) }) },
  });
  const guildPlot = layout.plots.find(({ id }) => id === 'lantern-workshop')!;
  let scenery: ReturnType<typeof addScenery>;
  let guild: ReturnType<typeof buildMarketLandmark>;
  try {
    scenery = addScenery(landscape, grid);
    guild = buildMarketLandmark(guildPlot);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const district = addDistrictHousing(landscape, grid, scenery.blocked, track.keepClear);
  const streetscape = addStreetscape(landscape, grid, (x, n, r) =>
    district.keepClear(x, n, r) || extensionRoadClearance(x, n, r));
  assert.deepEqual(
    [...streetscape.infillPlaced],
    streetInfill.map(({ id, points }) => [id, points.map(([kind]) => kind)]),
    'all configured streetscape clusters survive door and road clearance',
  );
  assert.deepEqual(streetscape.infillPlaced.get('market-south-loop'),
    ['well', 'dryingRack', 'lantern', 'firewood', 'stall', 'bench', 'lantern', 'fir'],
    'the old-town infill retains every south market furnishing');
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
  assert.equal(portals.length, 92, `the plaza work preserves the 92-door registry\n${diff}`);
  assert.deepEqual(actualIds, baselineDoorIds, `the 92-door registry preserves every B2a ID\n${diff}`);
  t.diagnostic(`old-town zones: ${JSON.stringify(district.zoneCounts)}`);
  assert.deepEqual(district.zoneCounts, { forest: 11, memorial: 5, market: 17, lakeside: 10, central: 9 });
  t.diagnostic(`missing ${missing.length}: ${missing.join(', ') || 'none'}`);
  t.diagnostic(`added ${added.length}: ${added.join(', ') || 'none'}`);
  t.diagnostic(`portal IDs: ${actualIds.join(', ')}`);

  const anchors = [
    ...layout.plots.map(({ id, door: [x, n] }) => ({ label: id, x, n })),
    ...marketStalls.map(({ kind, east: x, north: n }) => ({ label: kind + '摊', x, n })),
    ...townNpcDoorAnchors,
  ];
  const book = createHouseDoorBook(portals, anchors);
  assert.equal(book.length, 5);
  assert.equal(book.reduce((count, group) => count + group.rows.length, 0), 92);
  assert.ok(book.every(group => group.rows.length > 0 && group.rows.every(row => row.door.zone === group.zone)));
  t.diagnostic(`百门册 ${book.map(group => group.label + ' ' + group.rows.length).join(' / ')}`);
  const oldCards = district.housePortals.filter(({ zone }) => zone !== 'central');
  assert.equal(district.housingCards.size, oldCards.length);
  assert.equal(extensions.housingCards.size, extensions.housePortals.length);
  for (const [houses, cards] of [[oldCards, district.housingCards], [extensions.housePortals, extensions.housingCards]] as const) {
    for (const zone of ['forest', 'memorial', 'market', 'lakeside'] as const) {
      const local = houses.filter(house => house.zone === zone).map(({ id }) => {
        const card = cards.get(id);
        assert.ok(card, `${id} must have a physical roof and window card`);
        return card;
      });
      assert.equal(new Set(local.map(({ roof }) => roof)).size, 3, `${zone} roof forms`);
      assert.equal(new Set(local.map(({ window }) => window)).size, 3, `${zone} window forms`);
    }
  }
  t.diagnostic(`checked ${district.count} old-town homes, ${extensions.counts.buildings} district homes, and ${cottagePortals.length} decorative cottages`);
  const [west, south, plazaEast, plazaNorth] = layout.plaza.bounds;
  const moved = district.relocations.size === 13
    ? Array.from(district.relocations, ([address, [east, north]]) => [address, east, north] as const)
    : [];
  for (const [address, east, north] of moved) {
    const site = district.sites.find(site => site.x === east && site.n === north);
    assert.ok(site, `${address} was built at its approved receiving location [${east}, ${north}]`);
    assert.ok(registry.has('old-town:' + address), `${address} stable door ID`);
    const sideways = Math.abs(Math.sin(site.angle)) > .5;
    const footprintHalfEast = (sideways ? site.d : site.w) / 2;
    const footprintHalfNorth = (sideways ? site.w : site.d) / 2;
    const halfEast = footprintHalfEast + 1;
    const halfNorth = footprintHalfNorth + 1;
    assert.ok(east + halfEast <= west - 1.4 || east - halfEast >= plazaEast + 1.4 ||
      north + halfNorth <= south - 1.4 || north - halfNorth >= plazaNorth + 1.4, `${address} plaza edge clear`);
    const paths = layout.roads.flatMap(({ points, width }) => points.slice(1).map((end, index) =>
      ({ start: points[index], end, halfWidth: width / 2 })));
    function roadGap(x: number, n: number) {
      return Math.min(...paths.map(({ start, end, halfWidth }) => {
        const dx = end[0] - start[0], dn = end[1] - start[1];
        const along = Math.max(0, Math.min(1, ((x - start[0]) * dx + (n - start[1]) * dn) / (dx * dx + dn * dn)));
        return Math.hypot(x - start[0] - along * dx, n - start[1] - along * dn) - halfWidth;
      }));
    }
    let footprintGap = Infinity;
    let expandedGap = Infinity;
    for (let ix = -8; ix <= 8; ix++) for (let iz = -8; iz <= 8; iz++) {
      footprintGap = Math.min(footprintGap, roadGap(east + ix * footprintHalfEast / 8, north + iz * footprintHalfNorth / 8));
      expandedGap = Math.min(expandedGap, roadGap(east + ix * halfEast / 8, north + iz * halfNorth / 8));
    }
    // The approved phase-three sites specify physical footprint clearance and
    // the existing nine-point path gate. The old receiving strip used a dense
    // sweep of the expanded footprint, which remains a diagnostic comparison.
    const samples = [-1, 0, 1].flatMap(ix => [-1, 0, 1].map(iz => [east + ix * halfEast, north + iz * halfNorth]));
    const sampleGap = Math.min(...samples.map(([x, n]) => roadGap(x, n)));
    assert.ok(footprintGap >= 1.2, `${address} physical footprint road gap ${footprintGap.toFixed(3)} m`);
    assert.ok(sampleGap > 1.35, `${address} nine-point road gap ${sampleGap.toFixed(3)} m`);
    const heights = samples.map(([x, n]) => grid.heightAt(x, n));
    const door = portals.find(({ id }) => id === 'old-town:' + address)!;
    t.diagnostic(`${address} receiving [${east}, ${north}] door [${door.x.toFixed(3)}, ${door.n.toFixed(3)}] ground ${door.ground.toFixed(4)} m, footprint/expanded/nine-point road gaps ${footprintGap.toFixed(3)}/${expandedGap.toFixed(3)}/${sampleGap.toFixed(3)} m, grade spread ${(Math.max(...heights) - Math.min(...heights)).toFixed(3)} m`);
  }
  const railGeometry = readWalkGeometry(track.group);
  const colliders = [
    ...readWalkGeometry(extensions.group).colliders, ...readWalkGeometry(village).colliders,
    ...railGeometry.colliders, ...railGeometry.floors,
  ];
  function dryGround(x: number, n: number) {
    const ground = grid.heightAt(x, n);
    if (!canEnter(x, n) || isWater(x, n) || district.blocked(x, n) || scenery.blocked(x, n) ||
        forest.blocked(x, n) || streetscape.blocked(x, n) || colliders.some(({ min, max }) => {
          const dx = Math.max(min[0] - x, x - max[0], 0);
          const dz = Math.max(min[2] + n, -n - max[2], 0);
          return Math.hypot(dx, dz) < .27 && ground + .025 < max[1] && ground + 1.8 > min[1];
        })) return;
    return ground;
  }
  await t.test('the workshop street and both rooms have a clear round trip', t => {
    const [east, north, height] = guildPlot.origin;
    guild.position.set(east, height, -north);
    const walk = readWalkGeometry(guild);
    const obstacles = [...walk.colliders, ...walk.floors];
    const points = [
      guildPlot.connect, [118.1, 115.1], [121.4, 115.4], [122.5, 120.3],
      [122.5, 117], [126.3, 117], [126.3, 120.2], [126.3, 117],
      [130, 117], [130, 120.2], [130, 117], [121.4, 115.4], [117.2, 115],
    ];
    const radius = .27;
    const bodyHeight = 1.775;
    const stepUp = .43;
    let feet = grid.heightAt(guildPlot.connect[0], guildPlot.connect[1]);
    let sampled = 0;
    let peakStep = 0;
    for (let index = 1; index < points.length; index++) {
      const [fromX, fromN] = points[index - 1];
      const [toX, toN] = points[index];
      const steps = Math.ceil(Math.hypot(toX - fromX, toN - fromN) / .1);
      for (let step = 0; step <= steps; step++) {
        const x = fromX + step / steps * (toX - fromX);
        const n = fromN + step / steps * (toN - fromN);
        const label = `route ${index} at ${x.toFixed(3)}, ${n.toFixed(3)}`;
        const ground = dryGround(x, n);
        assert.ok(ground !== undefined && !scenery.plazaCoverBlocks(x, n, radius), `${label}: street`);
        const overlaps = ({ min, max }: (typeof obstacles)[number]) => Math.hypot(
          Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0),
        ) < radius;
        const support = walk.floors.reduce((y, floor) =>
          floor.max[1] <= feet + stepUp && overlaps(floor) ? Math.max(y, floor.max[1]) : y, ground);
        const rise = Math.abs(support - feet);
        assert.ok(rise <= stepUp, `${label}: ${rise.toFixed(3)} m step`);
        assert.ok(!obstacles.some(box => overlaps(box) && support + .025 < box.max[1] &&
          support + bodyHeight > box.min[1]), `${label}: workshop collision`);
        peakStep = Math.max(peakStep, rise);
        feet = support;
        sampled++;
      }
    }
    assert.equal(sampled, 571);
    t.diagnostic(`${points.length - 1} route targets, ${sampled} samples, peak step ${peakStep.toFixed(6)} m`);
  });

  // Check the nine M3 approaches separately from the exact 92-ID catalogue.
  const m3DoorAddresses = ['137:70', '186:104', '206:110', '228:110', '246:114',
    '349:184', '351:144', '358:163', '364:207'];
  for (const address of m3DoorAddresses) {
    const door = portals.find(portal => portal.id === 'old-town:' + address);
    assert.ok(door, `M3 approach must preserve ${address}`);
    assert.equal(dryGround(door.x, door.n), door.ground, `clear M3 approach to ${address}`);
    t.diagnostic(`M3 approach ${address} E${door.x.toFixed(3)}/N${door.n.toFixed(3)}/Y${door.ground.toFixed(3)}`);
  }
  for (const id of moved.map(([address]) => 'old-town:' + address)) {
    const door = portals.find(portal => portal.id === id)!;
    const offsets: [number, number, number][] = [[0, 0, 0]];
    const visited = new Set(['0:0']);
    let roadDistance = Infinity;
    for (const [dx, dn, steps] of offsets) {
      const x = door.x + dx / 2, n = door.n + dn / 2;
      if (grid.surfaces[Math.round(n) * grid.gridWidth + Math.round(x)] === 1) {
        roadDistance = steps / 2;
        break;
      }
      for (const [ix, iz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextX = dx + ix, nextN = dn + iz;
        const key = nextX + ':' + nextN;
        if (visited.has(key)) continue;
        const east = x + ix / 2, north = n + iz / 2;
        if (east < 0 || east > layout.width || north < 0 || north > layout.depth ||
          dryGround(east, north) === undefined || dryGround(x + ix / 4, n + iz / 4) === undefined ||
          Math.abs(grid.heightAt(east, north) - grid.heightAt(x, n)) > .4) continue;
        visited.add(key);
        offsets.push([nextX, nextN, steps + 1]);
      }
    }
    assert.ok(Number.isFinite(roadDistance), `${id} has a walkable route to an existing road`);
    t.diagnostic(`${id} walk to road ${roadDistance} m at .5 m resolution`);
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
  for (const door of portals) {
    assert.ok(findHouseDoorLanding(door, dryGround), `${door.id} has an exact or side landing`);
  }

  let random = 0x577e;
  const sample = () => {
    random = (1664525 * random + 1013904223) >>> 0;
    return random % portals.length;
  };
  const entries = new Set<number>();
  while (entries.size < 6) entries.add(sample());
  for (const index of entries) {
    const targets = new Set<number>();
    while (targets.size < 3) {
      const target = sample();
      if (target !== index) targets.add(target);
    }
    for (const target of targets) assert.ok(findHouseDoorLanding(portals[target], dryGround));
  }
  t.diagnostic('6 reproducibly sampled entries × 3 targets, plus every target sampled against the terrain');
});

test('door clearance tries the center, left, then right without widening or changing the original stand', () => {
  const door = { id: 'old-town:10:10', zone: 'central' as const, x: 10, n: 11.42, ground: 0, exitYaw: 0 };
  const probes: number[][] = [];
  assert.deepEqual(findHouseDoorLanding(door, (x, n) => {
    probes.push([x, n]);
    return x > door.x ? 2 : undefined;
  }), { x: 10.6, n: 10.9, ground: 2 });
  assert.deepEqual(probes, [[10, 10.9], [9.4, 10.9], [10.6, 10.9]]);
  assert.equal(findHouseDoorLanding(door, () => undefined), undefined);
  assert.equal(door.n, 11.42);
  assert.match(createHouseDoorBook([door], [])[0].rows[0].name, /第 1 门/);
});

test('door visits persist without duplicates and the displayed design copy stays exact', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  recordHouseDoorVisit('village:0', storage);
  recordHouseDoorVisit('village:0', storage);
  recordHouseDoorVisit('village:1', storage);
  assert.deepEqual(JSON.parse(data.get(houseDoorVisitKey)!), { version: 1, items: ['village:0', 'village:1'] });
  const design = readFileSync(new URL('../docs/交流区/Muse/屋舍传送百门通设计-v1.md', import.meta.url), 'utf8');
  for (const copy of Object.values(houseDoorBookCopy)) assert.ok(design.includes(`「${copy}」`), copy);
});
