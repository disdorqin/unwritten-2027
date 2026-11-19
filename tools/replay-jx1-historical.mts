import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout, revision] = process.argv.slice(2);
assert.ok(checkout && ['b0ce75c', 'dbaab43'].includes(revision), 'Usage: node --import tsx replay-jx1-historical.mts CHECKOUT b0ce75c|dbaab43');
const root = resolve(checkout);
const townRoot = resolve(root, 'tools/voxel-tavern/town-blockout');
const town = (file: string) => import(pathToFileURL(resolve(townRoot, file + '.ts')).href);
const require = createRequire(resolve(townRoot, '../package.json'));
const { Group } = require('three');

const exactSourceHashes = {
  'market-home-interior.ts': 'b9d7dd8f87698cd6cab17023b1e09b0500072a9ff51ddd8414651746db5ec07b',
  'market-home-furnishings.ts': '6e7345515d89f26ec9e74676a2e7e229a7d3e9eed378b6e7284cd46ad314efb0',
  'market-home-walk.ts': '8cb8b3d07698366ad7263deef65cb41ffa00230eafa0774e87b11a8e701f3d50',
  'market-homes-review.ts': 'd41ad95508bc28615c108f6cbac212a0d1db6e1dc6fc8cf48a26558b42b562c2',
  'market-homes-review-routes.json': '899aba57da7a20bea659eb6a22076f686b675e281610e6427336864e8af42106',
};
for (const [file, expected] of Object.entries(exactSourceHashes)) {
  assert.equal(createHash('sha256').update(readFileSync(resolve(townRoot, file))).digest('hex'), expected, file);
}

const [
  { createTerrainGrid, canEnter, isWater }, { buildPineCamp }, { addScenery }, { createTownRailway },
  { addDistrictHousing }, { buildMarketHomeInterior, marketHomeIds }, { buildMarketHomeFurnishings },
  { canStandInMarketHome, marketHomeWalkRoute, sampleMarketHomeWalk },
] = await Promise.all([
  town('terrain'), town('town-pine-camp'), town('scenery'), town('town-railway'), town('district-layout'),
  town('market-home-interior'), town('market-home-furnishings'), town('market-home-walk'),
]);

const landscape = new Group();
const grid = createTerrainGrid();
const pine = buildPineCamp(grid);
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
  }) }) },
});
let scenery;
try {
  scenery = addScenery(landscape, grid, pine.keepClear);
} finally {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
  else Reflect.deleteProperty(globalThis, 'document');
}
const rail = createTownRailway(grid, () => 0);
const district = addDistrictHousing(landscape, grid, scenery.blocked, rail.keepClear);
const market = district.housePortals.flatMap((portal, index) => portal.zone === 'market'
  ? [{ portal, site: district.sites[index], card: district.housingCards.get(portal.id) }] : []);
assert.deepEqual(market.map(({ portal }) => portal.id), [...marketHomeIds]);
assert.equal(district.count, 52);
assert.equal(market.length, 17);

type Point = { x: number; z: number };
type Route = [number, number][];
const streets: Record<string, Route> = JSON.parse(readFileSync(resolve(townRoot, 'market-homes-review-routes.json'), 'utf8'));
const layoutSource = readFileSync(resolve(townRoot, 'district-layout.ts'), 'utf8');
function relocationTable(name: string) {
  const lines = layoutSource.split('\n');
  const start = lines.findIndex(line => line.startsWith(`const ${name}`));
  const end = lines.indexOf(']);', start + 1);
  assert.ok(start >= 0 && end > start, name);
  const body = lines.slice(start + 1, end).join('\n');
  return new Map([...body.matchAll(/'([\d:]+)', \[([\d.]+), ([\d.]+)\]/g)]
    .map(([, id, x, n]) => [id, [+x, +n]] as const));
}
const theater = relocationTable('theaterHouseRelocations');
const railMoves = relocationTable('centralRailHouseRelocations');

const isExteriorFree = ({ x, z }: Point) => canEnter(x, -z) && !isWater(x, -z) &&
  !district.blocked(x, -z) && !scenery.blocked(x, -z);

// Mirrors archived review.ts lines 192–212. Every nonzero segment includes both endpoints.
function replayPhase(points: Point[], canStand: (point: Point) => boolean) {
  let samples = 0;
  let length = 0;
  for (const [index, end] of points.slice(1).entries()) {
    const start = points[index];
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    if (!distance) continue;
    length += distance;
    const count = Math.ceil(distance / .075);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const point = { x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t };
      assert.ok(canStand(point), JSON.stringify(point));
      samples++;
    }
  }
  return { samples, length };
}

function nearest(index: number, sameCard = false) {
  const current = market[index];
  const neighbors = market.flatMap(({ portal, site, card }, otherIndex) => {
    if (index === otherIndex || (sameCard && (current.card.roof !== card.roof || current.card.window !== card.window))) return [];
    return [{ id: portal.id, meters: Math.hypot(site.x - current.site.x, site.n - current.site.n) }];
  }).sort((a, b) => a.meters - b.meters || a.id.localeCompare(b.id));
  return neighbors.filter(neighbor => Math.abs(neighbor.meters - neighbors[0].meters) < 1e-9);
}

const points = Array.from({ length: 57 }, (_, ix) => Array.from({ length: 49 }, (_, iz) =>
  { return { x: ix / 4 - 7, z: iz / 4 - 6 }; })).flat();
const signatures = new Set<string>();
const masks: { clear: boolean[]; inScope: boolean[]; furnitureBlocked: boolean[] }[] = [];
const rooms = market.map(({ portal, site, card }, index) => {
  const { id } = portal;
  const room = buildMarketHomeInterior(id, site.w, site.d);
  try {
    const furniture = buildMarketHomeFurnishings({
      theme: room.theme, arrangement: index, halfWidth: room.halfWidth, halfDepth: room.halfDepth, accent: room.accent,
    });
    assert.deepEqual(room.colliders.slice(0, furniture.colliders.length), furniture.colliders, id);
    signatures.add(JSON.stringify(room.colliders));
    const canStand = ({ x, z }: Point) => canStandInMarketHome(x, z, room.colliders, room.halfWidth, room.halfDepth);
    const inScope = ({ x, z }: Point) => Math.abs(x) + .27 <= room.halfWidth && Math.abs(z) + .27 <= room.halfDepth;
    masks.push({
      clear: points.map(canStand),
      inScope: points.map(inScope),
      furnitureBlocked: points.map(({ x, z }) => inScope({ x, z }) &&
        !canStandInMarketHome(x, z, furniture.colliders, room.halfWidth, room.halfDepth)),
    });
    const interior = marketHomeWalkRoute(room.halfWidth, room.halfDepth);
    assert.deepEqual(interior[0], interior.at(-1));
    const isolatedRoom = sampleMarketHomeWalk(interior, room.colliders, room.halfWidth, room.halfDepth);
    assert.equal(isolatedRoom.blockedAt, undefined, id);
    const original = { x: portal.x, z: -portal.n };
    const street = streets[id].map(([east, north]) => ({ x: east, z: -north }));
    assert.ok(Math.hypot(street.at(-1)!.x - original.x, street.at(-1)!.z - original.z) < .001, id);
    street[street.length - 1] = original;
    const inbound = replayPhase(street, isExteriorFree);
    const inside = replayPhase(interior, canStand);
    const outbound = replayPhase([...street].reverse(), isExteriorFree);
    const oldAddress = id.slice('old-town:'.length);
    const oldCenter = oldAddress.split(':').map(Number);
    const currentCenter = [site.x, site.n];
    const migration = theater.has(oldAddress) ? 'theaterHouseRelocations'
      : railMoves.has(oldAddress) ? 'centralRailHouseRelocations' : null;
    assert.deepEqual(currentCenter, theater.get(oldAddress) ?? railMoves.get(oldAddress) ?? oldCenter, id);
    return {
      id, oldCenter, currentCenter, migration, portal, exterior: [site.w, site.d], card,
      interior: [2 * room.halfWidth, 2 * room.halfDepth], furnitureTheme: room.theme, categories: room.categories,
      colliders: { all: room.colliders.length, furniture: furniture.colliders.length, shell: room.colliders.length - furniture.colliders.length },
      localScopeStandable: masks.at(-1)!.clear.filter(Boolean).length,
      nearest: nearest(index), nearestMatchingCard: nearest(index, true),
      isolatedRoomSamples: isolatedRoom.samples, replay: { inbound, inside, outbound },
      outdoorVertices: street.length, halfMeterSegments: Math.round(inbound.length * 2),
      triangles: room.group.children.reduce((sum: number, child) => sum +
        (child.isInstancedMesh ? child.count * child.geometry.index.count / 3 : 0), 0),
    };
  } finally {
    room.dispose();
  }
});
assert.equal(signatures.size, 17);

const pairs = masks.flatMap((left, a) => masks.slice(a + 1).map((right, i) => {
  const b = a + i + 1;
  let leftOnly = 0, rightOnly = 0, leftOnlyWithinBoth = 0, rightOnlyWithinBoth = 0;
  let leftOnlyFurnitureInRight = 0, rightOnlyFurnitureInLeft = 0;
  for (const [index] of points.entries()) {
    if (left.clear[index] === right.clear[index]) continue;
    if (left.clear[index]) leftOnly++;
    else rightOnly++;
    if (!left.inScope[index] || !right.inScope[index]) continue;
    if (left.clear[index]) {
      leftOnlyWithinBoth++;
      if (right.furnitureBlocked[index]) leftOnlyFurnitureInRight++;
    } else {
      rightOnlyWithinBoth++;
      if (left.furnitureBlocked[index]) rightOnlyFurnitureInLeft++;
    }
  }
  return {
    left: rooms[a].id, right: rooms[b].id, leftOnly, rightOnly, mismatches: leftOnly + rightOnly,
    leftOnlyWithinBoth, rightOnlyWithinBoth, leftOnlyFurnitureInRight, rightOnlyFurnitureInLeft,
  };
}));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const phaseNames = ['inbound', 'inside', 'outbound'] as const;
const phases = Object.fromEntries(phaseNames.map(name => [name, {
  samples: sum(rooms.map(row => row.replay[name].samples)),
  meters: sum(rooms.map(row => row.replay[name].length)),
}]));
const standing = {
  points: points.length, allRoomIntersection: points.filter((_, i) => masks.every(mask => mask.clear[i])).length,
  pairs: pairs.length, differingPairs: pairs.filter(row => row.mismatches > 0).length,
  pairDifferenceRange: [Math.min(...pairs.map(row => row.mismatches)), Math.max(...pairs.map(row => row.mismatches))],
  pairsDifferingWithinBothScopes: pairs.filter(row => row.leftOnlyWithinBoth + row.rightOnlyWithinBoth > 0).length,
  pairsWithFurnitureWitness: pairs.filter(row => row.leftOnlyFurnitureInRight + row.rightOnlyFurnitureInLeft > 0).length,
};
const result = {
  revision, base: '352aa49b825d88c432ef2dd0a9dd04a5c86441c3', sourceSha256: exactSourceHashes,
  scope: { market: market.length, oldTown: district.count, zones: district.zoneCounts },
  totals: { isolatedRoomSamples: sum(rooms.map(row => row.isolatedRoomSamples)),
    replaySamples: sum(Object.values(phases).map(phase => phase.samples)), phases,
    outsideVertices: sum(rooms.map(row => row.outdoorVertices)),
    halfMeterSegments: sum(rooms.map(row => row.halfMeterSegments)),
    trianglesRange: [Math.min(...rooms.map(row => row.triangles)), Math.max(...rooms.map(row => row.triangles))] },
  standing, rooms, pairs,
};
console.log(JSON.stringify(result, null, 2));
