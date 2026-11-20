import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [reference, shifted] = process.argv.slice(2);
assert.ok(reference && shifted, 'Usage: node compare-stall5-snapshots.mjs REFERENCE_JSON SHIFTED_JSON');
const [before, after] = await Promise.all([reference, shifted].map(async file => JSON.parse(await readFile(file, 'utf8'))));
const normalized = structuredClone(after);
const porch = normalized.keyPositions.find(row => row.id === 'old-town:186:104');
const previous = before.keyPositions.find(row => row.id === porch.id);
assert.equal(before.doors.length, 92);
assert.equal(before.oldTown.length, 52);
assert.equal(before.keyPositions.length, 17);
assert.equal(previous.foundation.samples[0], 8.873316812515263);
assert.equal(porch.foundation.samples[0], 8.88413124084473);
const sampleDelta = porch.foundation.samples[0] - previous.foundation.samples[0];
porch.foundation.samples[0] = previous.foundation.samples[0];
assert.deepEqual(normalized, before, 'The moved market apron may change only the nonlimiting sample at 186:104');
console.log(JSON.stringify({
  unchangedDoors: before.doors.length,
  unchangedOldTownSites: before.oldTown.length,
  unchangedMarketFoundationLevels: before.keyPositions.length,
  changedNonlimitingTerrainSample: { id: porch.id, sample: 0, deltaY: sampleDelta },
}));
