import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIceTreasureRoom, type IceTreasureRoomSite,
  type IceTreasureRoomUpdate,
} from '../../src/presence/ice-treasure-room.js';

const site: IceTreasureRoomSite = {
  pedestal: { east: 10, north: 10 }, pickupRadius: 1, scoreRingRadius: .75,
  scoreRings: new Map([['east', { east: 30, north: 10 }], ['west', { east: 0, north: 10 }]]),
  mode: 'round', resetAfterScoreMs: 250, returnOnCarrierExit: true,
};

test('the room requires sanctioned arena dimensions, two teams, and reset timing', () => {
  const host = { now: () => 0, isIceOpen: () => false, acceptedSkater: () => undefined, deliver() {} };
  for (const unsafe of [
    { ...site, pickupRadius: 0 },
    { ...site, scoreRingRadius: Infinity },
    { ...site, resetAfterScoreMs: NaN },
    { ...site, scoreRings: new Map() },
  ]) assert.throws(() => createIceTreasureRoom(unsafe, host), RangeError);
});

test('official ice callback controls enrollment, and host dimensions and reset timing reach the round', () => {
  let east = 10, epoch = 200, isOpen = false;
  const updates: IceTreasureRoomUpdate['state'][] = [];
  const room = createIceTreasureRoom(site, {
    now: () => epoch, isIceOpen: () => isOpen,
    acceptedSkater: id => id === 1 ? { east, north: 10, team: 'east' } : undefined,
    deliver(id, event) {
      assert.equal(id, 1);
      updates.push(event.state);
    },
  });
  room.observeAcceptedMove(1);
  assert.equal(room.requestPickup(1), false);
  assert.equal(updates.length, 0);
  isOpen = true;
  room.observeAcceptedMove(1);
  assert.equal(room.requestPickup(1), true);
  east = 29.2;
  room.observeAcceptedMove(1);
  assert.equal(updates.at(-1)?.treasure.phase, 'carried');
  east = 29.25;
  room.observeAcceptedMove(1);
  assert.deepEqual(updates.at(-1)?.scores, [['east', 1]]);
  epoch = 449;
  room.tick();
  assert.equal(updates.at(-1)?.treasure.phase, 'awaiting-reset');
  epoch++;
  room.tick();
  assert.equal(updates.at(-1)?.treasure.phase, 'available');
  isOpen = false;
  room.tick();
  assert.equal(updates.at(-1), null);
});
