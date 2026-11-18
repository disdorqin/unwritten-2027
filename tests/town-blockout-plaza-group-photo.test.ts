import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  inPlazaPhotoArc, plazaPhotoCapacity, plazaPhotoLineup, plazaPhotoLockMs, readPlazaPhotoNotice, type PlazaPhotoPerson,
} from '../src/presence/plaza-photo.ts';
import { createPlazaGroupPhoto } from '../tools/voxel-tavern/town-blockout/plaza-group-photo.ts';

const person = (id: number, east = 224, north = 182, height = 12): PlazaPhotoPerson =>
  ({ id, name: `镇民 ${id}`, east, north, height });

test('the temporary capture zone uses both northern rows and rejects births, roofs and other areas', () => {
  assert.equal(inPlazaPhotoArc(224, 182, 12), true);
  assert.equal(inPlazaPhotoArc(227, 183, 12), true);
  assert.equal(inPlazaPhotoArc(223, 180, 12), false);
  assert.equal(inPlazaPhotoArc(224, 182, 160), false);
  assert.equal(inPlazaPhotoArc(224, 170, 12), false);
  assert.equal(inPlazaPhotoArc(224, 193, 12), false);
  assert.equal(inPlazaPhotoArc(Infinity, 182, 12), false);
});

test('one authoritative roster is sorted and capped, with malformed or duplicate names packets rejected', () => {
  const players = Array.from({ length: 54 }, (_, index) => person(55 - index));
  players.push(person(1, 224, 172));
  const lineup = plazaPhotoLineup(players);
  assert.equal(lineup.length, plazaPhotoCapacity);
  assert.equal(lineup[0].id, 2);
  assert.equal(lineup.at(-1)?.id, 49);

  const packet = { type: 'event', kind: 'plaza-photo-lineup', id: 3, captureAt: 1794981600000, people: lineup };
  assert.deepEqual(readPlazaPhotoNotice(packet), packet);
  assert.equal(readPlazaPhotoNotice({ ...packet, people: [person(1), person(1)] }), undefined);
  assert.equal(readPlazaPhotoNotice({ ...packet, people: [{ ...person(1), name: '\u0000' }] }), undefined);
  assert.equal(readPlazaPhotoNotice({ ...packet, people: [person(1, 224, 182, 160)] }), undefined);
  assert.equal(readPlazaPhotoNotice({ ...packet, captureAt: Infinity }), undefined);
  const invite = { type: 'event', kind: 'plaza-photo-invite', id: 3, captureAt: packet.captureAt };
  assert.deepEqual(readPlazaPhotoNotice(invite), invite);
});

test('a missing shared lineup unlocks movement without another animation frame', t => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let panel: { hidden: boolean } | undefined;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ hidden: false, dataset: {}, append() {}, setAttribute() {} }),
      body: { append: (element: { hidden: boolean }) => { panel = element; } },
    },
  });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const captureAt = 40_000;
  let now = 0;
  const host = person(1);
  const photo = createPlazaGroupPhoto({
    now: () => now,
    ownId: () => host.id,
    request: () => true,
    leave: () => assert.fail('expiry must not send opt-out'),
    nearby: () => [host],
    announce: () => undefined,
    open: () => assert.fail('no preview should open without a lineup'),
  });
  photo.receive({ type: 'event', kind: 'plaza-photo-invite', id: 1, captureAt });
  now = captureAt - plazaPhotoLockMs;
  assert.equal(photo.update({ east: host.east, north: host.north, height: host.height, active: true })?.shutter, false);
  assert.equal(photo.locked(), true);
  assert.equal(panel?.hidden, false);

  // Stop calling update entirely after entering the freeze.
  t.mock.timers.tick(plazaPhotoLockMs + 499);
  assert.equal(photo.locked(), true);
  t.mock.timers.tick(1);
  assert.equal(photo.locked(), false);
  assert.equal(photo.active(), false);
  assert.equal(panel?.hidden, true);
});
