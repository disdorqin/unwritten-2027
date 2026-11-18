import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  inPlazaPhotoArc, plazaPhotoCapacity, plazaPhotoLineup, readPlazaPhotoNotice, type PlazaPhotoPerson,
} from '../src/presence/plaza-photo.ts';

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
