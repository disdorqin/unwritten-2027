import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundWarriorForge } from '../../src/presence/underground-warrior-forge.js';

const place = { layer: 'fixture-warrior-city', east: 142, north: 4.9, height: -165 };
const sockets = {
  place: { id: 'stone-table', point: place },
  stoke: { id: 'bellows', point: { ...place, east: 143 } },
  collect: { id: 'outlet', point: { ...place, east: 144 } },
} as const;

function fixture() {
  let foot = place;
  let phase: 'materials' | 'ready' | 'heating' | 'outlet' = 'materials';
  let revision = 0;
  const calls: unknown[] = [];
  const options: Parameters<typeof createUndergroundWarriorForge<'accepted'>>[0] = {
    forgeId: 'fixture-forge',
    sockets,
    readAcceptedFoot: playerId => playerId === 'smith' ? foot : undefined,
    canReach: (acceptedFoot, socket) => Math.hypot(acceptedFoot.east - socket.point.east,
      acceptedFoot.north - socket.point.north) <= .35,
    readForge: () => ({ phase, revision }),
    submit(command) { calls.push(command); return 'accepted'; },
  };
  return {
    options, calls, forge: createUndergroundWarriorForge(options),
    move(point: typeof place) { foot = point; },
    advance(next: typeof phase) { phase = next; revision++; },
  };
}

test('the three local sockets hand off the accepted request and authority revision to F-2', () => {
  const { calls, forge, move, advance } = fixture();
  assert.deepEqual(forge.interact({ playerId: 'smith', requestId: 'one', action: 'place' }),
    { kind: 'submitted', result: 'accepted' });
  move(sockets.stoke.point);
  advance('ready');
  assert.equal(forge.interact({ playerId: 'smith', requestId: 'two', action: 'stoke' }).kind, 'submitted');
  move(sockets.collect.point);
  advance('heating');
  assert.deepEqual(forge.interact({ playerId: 'smith', requestId: 'three', action: 'collect' }),
    { kind: 'unavailable', phase: 'heating' });
  advance('outlet');
  assert.equal(forge.interact({ playerId: 'smith', requestId: 'four', action: 'collect' }).kind, 'submitted');
  assert.deepEqual(calls, [
    { playerId: 'smith', requestId: 'one', action: 'place', forgeId: 'fixture-forge', socketId: 'stone-table', expectedRevision: 0 },
    { playerId: 'smith', requestId: 'two', action: 'stoke', forgeId: 'fixture-forge', socketId: 'bellows', expectedRevision: 1 },
    { playerId: 'smith', requestId: 'four', action: 'collect', forgeId: 'fixture-forge', socketId: 'outlet', expectedRevision: 3 },
  ]);
});

test('an unaccepted foot, a different domain and the wrong socket cannot submit', () => {
  const { calls, forge, move } = fixture();
  const command = { playerId: 'smith', requestId: 'one', action: 'place' } as const;
  assert.equal(forge.interact({ ...command, playerId: 'visitor' }).kind, 'unreachable');
  move({ ...place, layer: 'fixture-crystal-cave' });
  assert.equal(forge.interact(command).kind, 'unreachable');
  move(sockets.stoke.point);
  assert.equal(forge.interact(command).kind, 'unreachable');
  assert.equal(forge.interact({ ...command, requestId: '' }).kind, 'invalid');
  assert.deepEqual(calls, []);
});

test('the station refuses duplicate or cross-domain socket registration', () => {
  const { options } = fixture();
  assert.throws(() => createUndergroundWarriorForge({ ...options, sockets: { ...sockets, stoke: sockets.place } }),
    /three distinct sockets/);
  assert.throws(() => createUndergroundWarriorForge({ ...options, sockets: {
    ...sockets, stoke: { ...sockets.stoke, point: { ...sockets.stoke.point, layer: 'another' } },
  } }), /same confirmed domain/);
});
