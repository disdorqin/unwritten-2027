import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createFirstNightHomeAssignments } from '../src/presence/first-night-home.ts';

const rosterPath = process.argv[2];
if (!rosterPath) throw new Error('Pass the JX-6 release lantern roster JSON file.');
const bytes = readFileSync(rosterPath);
const roster = JSON.parse(bytes.toString('utf8'));
assert.equal(roster.sha, '75859a094757c5dcee8b874eef86ec37f4204907');
assert.equal(roster.tableBlob, 'df3dec065ae186b190aa5f92a693052267f817e9');
assert.equal(roster.rows.length, 52);
assert.deepEqual(roster.summary.oldIdsMissing, []);
assert.deepEqual(roster.summary.newIds, []);
const ids = roster.rows.map(row => row.id);
assert.equal(new Set(ids).size, 52);
assert.ok(ids.every(id => /^old-town:\d+:\d+$/.test(id)));

let packed;
let writes = 0;
const store = {
  load: () => packed === undefined ? undefined : JSON.parse(packed),
  save(rows) {
    packed = JSON.stringify(rows);
    writes++;
  },
};
const allocator = createFirstNightHomeAssignments(ids, store);
const claimed = ids.map((id, index) => {
  const assigned = allocator.assign(`test-principal-${index}`);
  assert.equal(assigned, id);
  return assigned;
});
const restored = createFirstNightHomeAssignments(ids, store);
const reconnects = ids.map((id, index) => restored.assign(`test-principal-${index}`));
assert.deepEqual(reconnects, claimed);
assert.equal(restored.assign('overflow-fixture'), undefined);
assert.equal(writes, 52);
console.log(JSON.stringify({
  base: roster.sha,
  rosterSha256: createHash('sha256').update(bytes).digest('hex'),
  rosterTableGitBlob: roster.tableBlob,
  uniqueHouseIds: new Set(claimed).size,
  storedWrites: writes,
  sameIdsAfterReload: reconnects.length,
  overflowAssigned: false,
  transportPrincipalKeys: 'test-only inputs, supplied by the future identity host',
  tableOrder: 'input roster order for the proof, not an allocation order ruling',
  houseIds: ids,
}, null, 2));
