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

test('heating stoke is routed only after F-2 enables it and an accepted foot reaches the bellows', () => {
  const { options, calls, move } = fixture();
  let acceptsHeatingStoke = false;
  const forge = createUndergroundWarriorForge({
    ...options, readForge: () => ({ phase: 'heating', revision: 6, acceptsHeatingStoke }),
  });
  const command = { playerId: 'smith', requestId: 'refuel', action: 'stoke' } as const;
  move(sockets.stoke.point);
  assert.deepEqual(forge.interact(command), { kind: 'unavailable', phase: 'heating' });
  acceptsHeatingStoke = true;
  move(sockets.place.point);
  assert.equal(forge.interact(command).kind, 'unreachable');
  move(sockets.stoke.point);
  assert.deepEqual(forge.interact(command), { kind: 'submitted', result: 'accepted' });
  assert.deepEqual(calls, [{ ...command, forgeId: 'fixture-forge', socketId: 'bellows', expectedRevision: 6 }]);
});

test('core installation and flight fueling require their explicitly registered reachable sockets', () => {
  const { options, calls, forge, move, advance } = fixture();
  const install = { playerId: 'smith', requestId: 'core', action: 'install-core' } as const;
  const fuel = { playerId: 'smith', requestId: 'fuel', action: 'fuel' } as const;
  const core = { id: 'core-stand', point: { ...place, east: 145 } };
  assert.equal(forge.interact(install).kind, 'invalid');
  move(sockets.collect.point);
  assert.equal(forge.interact(fuel).kind, 'invalid');

  const serviceSockets = { ...sockets, 'install-core': core, fuel: sockets.collect };
  const station = createUndergroundWarriorForge({
    ...options,
    sockets: serviceSockets,
    receipt: (playerId, requestId, action) =>
      playerId === 'smith' && requestId === 'fuel' && action === 'fuel' && calls.length === 2 ? 'accepted' : undefined,
  });
  assert.equal(station.interact(install).kind, 'unreachable');
  move({ ...core.point, layer: 'fixture-crystal-cave' });
  assert.equal(station.interact(install).kind, 'unreachable');
  move(core.point);
  assert.equal(station.interact(install).kind, 'submitted');

  advance('heating');
  assert.equal(station.interact(fuel).kind, 'unreachable');
  move(sockets.collect.point);
  assert.equal(station.interact(fuel).kind, 'submitted');
  assert.equal(station.interact(fuel).kind, 'submitted');
  move(core.point);
  assert.equal(station.interact(fuel).kind, 'unreachable');
  assert.deepEqual(calls, [
    { ...install, forgeId: 'fixture-forge', socketId: 'core-stand', expectedRevision: 0 },
    { ...fuel, forgeId: 'fixture-forge', socketId: 'outlet', expectedRevision: 1 },
  ]);
});

test('explicit service sockets must still be finite and in the forge domain', () => {
  const { options } = fixture();
  assert.throws(() => createUndergroundWarriorForge({
    ...options, sockets: { ...sockets, fuel: { ...sockets.collect, point: { ...place, height: NaN } } },
  }), /finite points/);
  assert.throws(() => createUndergroundWarriorForge({
    ...options, sockets: { ...sockets, 'install-core': { id: 'core-stand', point: { ...place, layer: 'another' } } },
  }), /same confirmed domain/);
});

test('a known authority receipt can be returned after its action has moved the furnace to a new phase', () => {
  const { options, calls, move } = fixture();
  const forge = createUndergroundWarriorForge<'accepted' | 'replayed' | 'invalid'>({
    ...options, readForge: () => ({ phase: 'heating', revision: 7 }),
    receipt: (player, request, action) => player === 'smith' && request === 'ignition'
      ? (action === 'stoke' ? 'replayed' : 'invalid') : undefined,
  });
  const command = { playerId: 'smith', requestId: 'ignition', action: 'stoke' } as const;
  assert.equal(forge.interact(command).kind, 'unreachable');
  assert.deepEqual(forge.interact({ ...command, action: 'place' }), { kind: 'submitted', result: 'invalid' });
  move(sockets.stoke.point);
  assert.deepEqual(forge.interact(command), { kind: 'submitted', result: 'replayed' });
  assert.deepEqual(calls, []);
});
