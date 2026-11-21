import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundCampOfferings,
  undergroundCampOfferingLighting,
} from '../tools/voxel-tavern/town-blockout/underground-camp-offerings.ts';

const [first, second, third] = ['open-1', 'open-2', 'open-3'];
const niches = [
  { id: 'spent-1', hasSpentLamp: true },
  { id: first, hasSpentLamp: false },
  { id: 'spent-2', hasSpentLamp: true },
  { id: second, hasSpentLamp: false },
  { id: 'spent-3', hasSpentLamp: true },
  { id: third, hasSpentLamp: false },
];

test('only configured empty niches may request inventory and a lit niche cannot debit twice', () => {
  const camp = createUndergroundCampOfferings(niches);
  let debits = 0;
  const takeLamp = () => { debits++; return true; };

  assert.equal(camp.offerLamp('unknown', takeLamp).kind, 'unavailable-niche');
  assert.equal(camp.offerLamp('spent-1', takeLamp).kind, 'unavailable-niche');
  assert.equal(debits, 0);
  assert.equal(camp.offerLamp(first, takeLamp).kind, 'offered');
  assert.equal(camp.offerLamp(first, takeLamp).kind, 'unavailable-niche');
  assert.equal(debits, 1);
  assert.deepEqual(camp.snapshot(), { litNicheIds: [first], extraCampLightCount: 0 });
});

test('an inventory rejection or failure leaves the niche empty and the same request can retry', () => {
  const camp = createUndergroundCampOfferings(niches);
  assert.equal(camp.offerLamp(first, () => false).kind, 'no-lamp');
  assert.throws(() => camp.offerLamp(first, () => { throw new Error('inventory unavailable'); }), /inventory unavailable/);
  assert.deepEqual(camp.snapshot(), { litNicheIds: [], extraCampLightCount: 0 });
  assert.equal(camp.offerLamp(first, () => true).kind, 'offered');
});

test('reentry during the inventory callback cannot debit again or clear the active offer', () => {
  const camp = createUndergroundCampOfferings(niches);
  const unexpectedDebit = () => assert.fail('reentrant placement attempted to debit');
  assert.equal(camp.offerLamp(first, () => {
    assert.equal(camp.offerLamp(first, unexpectedDebit).kind, 'busy');
    assert.equal(camp.offerLamp(second, unexpectedDebit).kind, 'busy');
    assert.equal(camp.clear(), false);
    return true;
  }).kind, 'offered');
  assert.deepEqual(camp.snapshot(), { litNicheIds: [first], extraCampLightCount: 0 });
});

test('a third offering lights two additional positions until the host explicitly clears the scope', () => {
  const camp = createUndergroundCampOfferings(niches);
  const otherScope = createUndergroundCampOfferings(niches);
  const emptyLights = { litNicheIds: [], extraCampLightCount: 0 };
  assert.deepEqual(camp.snapshot(), emptyLights);
  camp.offerLamp(first, () => true);
  camp.offerLamp(second, () => true);
  assert.deepEqual(camp.snapshot(), { litNicheIds: [first, second], extraCampLightCount: 0 });
  camp.offerLamp(third, () => true);
  const lit = camp.snapshot();
  assert.deepEqual(lit, { litNicheIds: [first, second, third], extraCampLightCount: 2 });
  assert.deepEqual(camp.snapshot(), lit);
  assert.deepEqual(otherScope.snapshot(), emptyLights);
  assert.equal(camp.clear(), true);
  assert.equal(camp.clear(), true);
  assert.deepEqual(camp.snapshot(), emptyLights);
  assert.deepEqual(lit, { litNicheIds: [first, second, third], extraCampLightCount: 2 });
  assert.deepEqual(undergroundCampOfferingLighting, {
    niche: { radius: 8, tone: 'warm' },
    camp: { radius: 4, tone: 'cool' },
    visibleLightLimit: 5,
  });
});

test('duplicate or empty niche IDs fail before an activity scope can accept inventory', () => {
  assert.throws(() => createUndergroundCampOfferings([...niches, niches[0]]), /unique IDs/);
  assert.throws(() => createUndergroundCampOfferings([{ id: '', hasSpentLamp: false }]), /unique IDs/);
});
