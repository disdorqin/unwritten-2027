import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPublicExhibits, publicExhibitSlots, publicExhibitWeekMs } from '../../src/presence/public-exhibits.js';

const start = Date.parse('2026-11-19T00:00:00Z');
const closes = start + publicExhibitWeekMs;

function fixture() {
  let at = start;
  const inventory = new Map<string, unknown>();
  const exhibits = createPublicExhibits({
    firstWeekStartsAt: start,
    now: () => at,
    readInventoryItem: id => inventory.get(id),
  });
  return { ...exhibits, inventory, setTime(value: number) { at = value; } };
}

function mineral(ownerId: string) {
  return { ownerId, kind: 'mineral-specimen', motif: 'none' };
}

test('only owned system items without authored fields or protected motifs may enter the ballot', () => {
  const exhibits = fixture();
  const valid = ['golden-goat-figurine', 'mineral-specimen', 'roasted-fish-specimen', 'photo-frame'];
  for (const kind of valid) {
    exhibits.inventory.set(kind, { ownerId: 'owner', kind, motif: 'none' });
    assert.equal(exhibits.nominate('stranger', kind), false);
    assert.equal(exhibits.nominate('owner', kind), true);
    assert.equal(exhibits.nominate('owner', kind), false);
  }

  const rejected = [
    { ...mineral('owner'), caption: 'player text' },
    { ownerId: 'owner', kind: 'custom-text-plaque', motif: 'none' },
    { ownerId: 'owner', kind: 'photo-frame', motif: 'none', url: 'https://example.invalid/photo.png' },
    ...['town-chronicle-ring', 'weiyang-moon-arc', 'indigenous-goat-scroll'].map(motif =>
      ({ ...mineral('owner'), motif })),
    { ownerId: 'owner', kind: 'mineral-specimen' },
  ];
  rejected.forEach((item, index) => {
    const id = `not-eligible-${index}`;
    exhibits.inventory.set(id, item);
    assert.equal(exhibits.nominate('owner', id), false);
    assert.equal(exhibits.vote('voter', id), false);
  });
  assert.equal(exhibits.nominate('owner', 'unissued'), false);
  // Failed attempts did not consume this player's only vote.
  assert.equal(exhibits.vote('voter', valid[0]), true);
  assert.equal(exhibits.vote('voter', valid[1]), false);
});

test('the ballot is global, each trusted player gets one vote, and the exact week boundary closes it', () => {
  const exhibits = fixture();
  exhibits.inventory.set('a', mineral('author'));
  exhibits.inventory.set('b', mineral('author'));
  exhibits.setTime(start - 1);
  assert.equal(exhibits.nominate('author', 'a'), false);
  exhibits.setTime(start);
  assert.equal(exhibits.nominate('author', 'a'), true);
  assert.equal(exhibits.nominate('author', 'b'), true);
  assert.equal(exhibits.vote('first-player', 'a'), true);
  assert.equal(exhibits.vote('first-player', 'b'), false);
  exhibits.setTime(closes - 1);
  assert.deepEqual(exhibits.settle(), { status: 'open' });
  assert.equal(exhibits.vote('other-player', 'b'), true);
  exhibits.setTime(closes);
  assert.equal(exhibits.vote('too-late', 'b'), false);
  assert.equal(exhibits.nominate('author', 'a'), false);
  const result = exhibits.settle();
  assert.equal(result.status, 'settled');
  if (result.status !== 'settled') return;
  assert.equal(result.placements.length, 2);
  assert.ok(result.placements.every(item =>
    item.termStartsAt === closes && item.termEndsAt - item.termStartsAt === publicExhibitWeekMs));
  assert.deepEqual(exhibits.settle(), { status: 'open' });
  assert.equal(exhibits.nominate('author', 'a'), true);
  assert.equal(exhibits.vote('first-player', 'a'), true);
});

test('eight furniture slots go to elected works, other works remain in their authors’ houses', () => {
  const exhibits = fixture();
  for (let index = 1; index <= 9; index++) {
    const id = `item-${index}`;
    const owner = `owner-${index}`;
    exhibits.inventory.set(id, mineral(owner));
    assert.equal(exhibits.nominate(owner, id), true);
    if (index < 9) assert.equal(exhibits.vote(`voter-${index}`, id), true);
  }
  exhibits.setTime(closes);
  const result = exhibits.settle();
  assert.equal(result.status, 'settled');
  if (result.status !== 'settled') return;
  assert.deepEqual(result.placements.map(entry => entry.slotId), publicExhibitSlots.map(entry => entry.id));
  assert.deepEqual(publicExhibitSlots.map(slot => slot.site),
    ['plaza', 'plaza', 'plaza', 'plaza', 'market', 'clocktower', 'clocktower', 'starport']);
  assert.deepEqual(result.returnedHome, [{ itemId: 'item-9', ownerId: 'owner-9' }]);
  assert.deepEqual(exhibits.location('item-9'), { type: 'home', ownerId: 'owner-9' });
  assert.equal(exhibits.location('item-1')?.type, 'public');
  assert.equal(exhibits.inventory.size, 9);
  result.placements[0].termEndsAt = closes;
  assert.equal(exhibits.placements()[0].termEndsAt, closes + publicExhibitWeekMs);
});

test('renewal is an election, and a term that receives no next-week votes returns home at expiry', () => {
  const exhibits = fixture();
  exhibits.inventory.set('keepsake', mineral('resident'));
  for (let week = 0; week < 3; week++) {
    assert.equal(exhibits.nominate('resident', 'keepsake'), true);
    assert.equal(exhibits.vote('returning-voter', 'keepsake'), true);
    exhibits.setTime(start + (week + 1) * publicExhibitWeekMs);
    const result = exhibits.settle();
    assert.equal(result.status, 'settled');
    if (result.status !== 'settled') return;
    assert.equal(result.returnedHome.length, 0);
    assert.equal(result.placements[0].termEndsAt, start + (week + 2) * publicExhibitWeekMs);
  }
  exhibits.setTime(start + 4 * publicExhibitWeekMs);
  assert.deepEqual(exhibits.location('keepsake'), { type: 'home', ownerId: 'resident' });
  assert.deepEqual(exhibits.settle(), {
    status: 'settled', placements: [], returnedHome: [{ itemId: 'keepsake', ownerId: 'resident' }],
  });
  assert.equal(exhibits.inventory.size, 1);
});

test('a cutoff tie requires the exact host-approved selection and does not invent a winner', () => {
  const exhibits = fixture();
  for (let index = 1; index <= 9; index++) {
    const item = `item-${index}`;
    exhibits.inventory.set(item, mineral('owner'));
    assert.equal(exhibits.nominate('owner', item), true);
    assert.equal(exhibits.vote(`voter-${index}`, item), true);
  }
  assert.equal(exhibits.vote('extra-voter', 'item-1'), true);
  exhibits.setTime(closes);
  const tied = Array.from({ length: 8 }, (_, index) => `item-${index + 2}`);
  const pending = { status: 'cutoff-tie', itemIds: tied, places: 7 };
  assert.deepEqual(exhibits.settle(), pending);
  assert.deepEqual(exhibits.settle([...tied.slice(0, 6), 'item-1']), pending);
  assert.deepEqual(exhibits.settle([...tied.slice(0, 6), tied[0]]), pending);
  assert.deepEqual(exhibits.placements(), []);
  const result = exhibits.settle(tied.slice(1));
  assert.equal(result.status, 'settled');
  if (result.status !== 'settled') return;
  assert.deepEqual(result.placements.map(entry => entry.itemId), ['item-1', ...tied.slice(1)]);
  assert.deepEqual(result.returnedHome, [{ itemId: 'item-2', ownerId: 'owner' }]);
});

test('ownership is rechecked and an expired unprocessed election never restarts an old term', () => {
  const exhibits = fixture();
  for (const id of ['transferred', 'delayed']) {
    exhibits.inventory.set(id, mineral('old-owner'));
    assert.equal(exhibits.nominate('old-owner', id), true);
    assert.equal(exhibits.vote(`vote-${id}`, id), true);
  }
  exhibits.inventory.set('transferred', mineral('new-owner'));
  assert.equal(exhibits.vote('fresh-voter', 'transferred'), false);
  exhibits.setTime(closes + publicExhibitWeekMs);
  assert.deepEqual(exhibits.settle(), {
    status: 'settled', placements: [],
    returnedHome: [{ itemId: 'transferred', ownerId: 'new-owner' }, { itemId: 'delayed', ownerId: 'old-owner' }],
  });
  assert.equal(exhibits.nominate('new-owner', 'transferred'), true);
  assert.equal(exhibits.vote('vote-transferred', 'transferred'), true);
});
