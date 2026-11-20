import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [reference, shifted] = process.argv.slice(2);
assert.ok(reference && shifted, 'Usage: node compare-stall5-snapshots.mjs REFERENCE_JSON SHIFTED_JSON');
const [before, after] = await Promise.all([reference, shifted].map(async file => JSON.parse(await readFile(file, 'utf8'))));
assert.equal(before.doors.length, 92);
assert.equal(before.oldTown.length, 52);
assert.equal(before.keyPositions.length, 17);
assert.deepEqual(after, before, 'Stall five must keep every original door, old-town site and foundation sample');
console.log(JSON.stringify({
  unchangedDoors: before.doors.length,
  unchangedOldTownSites: before.oldTown.length,
  unchangedMarketFoundationLevels: before.keyPositions.length,
  changedTerrainSamples: 0,
}));
