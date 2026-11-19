import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout, receipt] = process.argv.slice(2);
assert.ok(checkout && receipt, 'Usage: node --import tsx SCRIPT CANDIDATE_CHECKOUT CANDIDATE_RECEIPT');
const source = resolve(checkout, 'tools/voxel-tavern/town-blockout');
const load = name => import(pathToFileURL(resolve(source, name)));
const { buildMarketHomeInterior, marketHomeIds } = await load('market-home-interior.ts');
const { canStandInMarketHome, marketHomeWalkRoute, sampleMarketHomeWalk } = await load('market-home-walk.ts');
const routes = JSON.parse(await readFile(resolve(source, 'market-homes-review-routes.json'), 'utf8'));
const roster = [...(await readFile(receipt, 'utf8')).matchAll(
  /^\| `(\d+:\d+)` \| ([\d.]+)\/([\d.]+) \| ([\d.]+)\/([\d.]+)\/[\d.]+ \| [^|]+ \| ([\d.]+)×([\d.]+) \| [^|]+ \| ([^|]+) \|\r?$/gm,
)].map(([, address, east, north, doorEast, doorNorth, width, depth, card]) => ({
  id: `old-town:${address}`, east: Number(east), north: Number(north),
  door: { x: Number(doorEast), z: -Number(doorNorth) }, width: Number(width), depth: Number(depth), card: card.trim(),
}));
assert.deepEqual(roster.map(({ id }) => id), marketHomeIds);

function replaySampleCount(points, canStand = () => true) {
  let samples = 0;
  for (const [index, end] of points.slice(1).entries()) {
    const start = points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const steps = Math.ceil(Math.hypot(dx, dz) / .075);
    if (!steps) continue;
    for (let step = 0; step <= steps; step++) {
      assert.ok(canStand(start.x + dx * (step / steps), start.z + dz * (step / steps)), 'Interior replay collided');
      samples++;
    }
  }
  return samples;
}

const grid = Array.from({ length: 57 * 49 }, (_, index) => ({
  x: -7 + (index % 57) * .25, z: -6 + Math.floor(index / 57) * .25,
}));
const masks = [];
const furnishings = [];
const houses = [];
for (const site of roster) {
  const { id, width, depth, door } = site;
  const room = buildMarketHomeInterior(id, width, depth);
  try {
    const { colliders, halfWidth, halfDepth } = room;
    const inside = marketHomeWalkRoute(halfWidth, halfDepth);
    const canStand = (x, z) => canStandInMarketHome(x, z, colliders, halfWidth, halfDepth);
    const staticWalk = sampleMarketHomeWalk(inside, colliders, halfWidth, halfDepth);
    assert.equal(staticWalk.blockedAt, undefined, id);
    const street = routes[id].map(([east, north]) => ({ x: east, z: -north }));
    const end = street.at(-1);
    assert.ok(Math.hypot(end.x - door.x, end.z - door.z) < .001, `${id} route end does not match door`);
    street[street.length - 1] = door;
    const closest = roster.filter(other => other !== site).map(other => ({
      id: other.id, distance: Math.hypot(site.east - other.east, site.north - other.north), sameCard: site.card === other.card,
    })).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0];
    masks.push(grid.map(({ x, z }) => canStand(x, z)));
    // The four furniture boxes precede the walls in the historical interior builder.
    const furniture = colliders.slice(0, 4);
    furnishings.push(grid.map(({ x, z }) =>
      Math.abs(x) + .27 <= halfWidth && Math.abs(z) + .27 <= halfDepth &&
      !canStandInMarketHome(x, z, furniture, halfWidth, halfDepth)));
    houses.push({ id, closest, staticIndoor: staticWalk.samples, replayIndoor: replaySampleCount(inside, canStand),
      outbound: replaySampleCount(street), inbound: replaySampleCount(street.toReversed()) });
  } finally {
    room.dispose();
  }
}

const pairDifferences = masks.flatMap((one, i) => masks.slice(i + 1).map(two =>
  one.filter((value, point) => value !== two[point]).length));
const furnitureConflicts = masks.flatMap((one, i) => masks.slice(i + 1).map((two, j) => {
  const otherFurniture = furnishings[i + 1 + j];
  return one.some((free, point) => (free && otherFurniture[point]) || (two[point] && furnishings[i][point]));
}));
const pairsWithFurnitureConflict = furnitureConflicts.filter(Boolean).length;
const totals = Object.fromEntries(['staticIndoor', 'replayIndoor', 'outbound', 'inbound'].map(key =>
  [key, houses.reduce((sum, house) => sum + house[key], 0)]));
const replayTotal = totals.replayIndoor + totals.outbound + totals.inbound;
const common = grid.filter((_, point) => masks.every(mask => mask[point])).length;
assert.deepEqual(totals, { staticIndoor: 3722, replayIndoor: 4019, outbound: 3520, inbound: 3520 });
assert.equal(replayTotal, 11059);
assert.deepEqual([pairDifferences.length, Math.min(...pairDifferences), Math.max(...pairDifferences), common], [136, 7, 735, 620]);
assert.equal(pairsWithFurnitureConflict, 136);
console.log(JSON.stringify({ houses, totals, replayTotal, grid: grid.length, pairCount: pairDifferences.length,
  minPairDifference: Math.min(...pairDifferences), maxPairDifference: Math.max(...pairDifferences), common, pairsWithFurnitureConflict }, null, 2));
