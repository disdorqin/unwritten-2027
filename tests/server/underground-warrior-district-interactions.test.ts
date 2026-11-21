import assert from 'node:assert/strict';
import test from 'node:test';
import { createWarriorDistrictAuthority } from '../../src/presence/underground-warrior-district-interactions.js';
import {
  warriorDistrictHouses, warriorDistrictStation, warriorDistrictStations,
  warriorDistrictTransform, type WarriorDistrictAction, type WarriorDistrictPoint,
} from '../../src/shared/underground-warrior-district.js';

const frame = { domainId: 'fixture-warrior', east: -205, north: 360, height: -165, yaw: .24 };
type ServiceOptions = Parameters<typeof createWarriorDistrictAuthority<string>>[0];
function fixture() {
  const all = warriorDistrictStations.map(s => ({
    ...s, worldFoot: warriorDistrictTransform(frame, s.localFoot),
  }));
  const book = new Map<string, { locationId: string; role: WarriorDistrictAction; result: string }>();
  const feet = new Map<string, ServiceOptions['readAcceptedFoot'] extends
    (id: string) => infer T ? T : never>();
  let active = true, support = true, lineOfSight = true, revision = 31;
  const calls: Array<Parameters<ServiceOptions['submit']>[0]> = [];
  const first = all[0]!;
  feet.set('a', { playerId: 'a', domainId: frame.domainId, ...first.worldFoot });
  feet.set('b', { playerId: 'b', domainId: frame.domainId, ...first.worldFoot });
  const options: ServiceOptions = {
    frame,
    isCertifiedFrame: () => active,
    supportsStation: () => support,
    readAcceptedFoot: playerId => feet.get(playerId),
    canReach: () => lineOfSight,
    readRevision: () => revision,
    async readReceipt(playerId, requestId) { return book.get(playerId + '/' + requestId); },
    async submit(command) {
      calls.push(command);
      book.set(command.playerId + '/' + command.requestId, {
        role: command.role, locationId: command.locationId, result: 'recorded',
      });
      return 'recorded';
    },
  };
  return {
    first, all, feet, calls, options,
    service: createWarriorDistrictAuthority(options),
    setActive(v: boolean) { active = v; },
    setSupport(v: boolean) { support = v; },
    setLOS(v: boolean) { lineOfSight = v; },
    setVersion(v: number) { revision = v; },
    move(playerId: string, point: WarriorDistrictPoint, domainId = frame.domainId) {
      feet.set(playerId, { playerId, domainId, east: point.east,
        north: point.north, height: point.height });
    },
  };
}

test('U-10 single-source stable station plan includes four search sites and four shelters but no blocked-home loot', () => {
  assert.equal(warriorDistrictHouses.length, 12);
  assert.equal(warriorDistrictHouses.filter(home => home.accessible).length, 4);
  assert.equal(warriorDistrictStations.length, 11);
  const byRole = new Map<string, number>();
  for (const station of warriorDistrictStations) {
    byRole.set(station.role, 1 + (byRole.get(station.role) ?? 0));
    assert.equal(warriorDistrictStation(station.id, station.role), station);
    assert.ok(station.localFoot.every(Number.isFinite));
  }
  assert.deepEqual(Object.fromEntries(byRole), {
    'search-room': 4, 'take-cover': 4,
    'arcade-cover': 1, lookout: 1, trace: 1,
  });
  assert.ok(warriorDistrictHouses.filter(h => !h.accessible).every(h =>
    !warriorDistrictStation(h.id, 'search-room') &&
    !warriorDistrictStation(h.id, 'take-cover')));
});

test('U-10 a real nearby accepted player sends one world-foot-stamped revision to the host receipt authority', async () => {
  const f = fixture();
  const intent = { playerId: 'a', requestId: 'u10-quest-1',
    locationId: f.first.id, role: f.first.role, expectedRevision: 31 } as const;
  assert.equal(f.service.stationCount, 11);
  assert.deepEqual(await f.service.interact(intent), { kind: 'submitted', result: 'recorded' });
  assert.deepEqual(f.calls, [{
    ...intent, worldFoot: f.first.worldFoot, domainId: frame.domainId, serverRevision: 31,
  }]);
  assert.deepEqual(await f.service.interact(intent), { kind: 'replayed', result: 'recorded' });
  assert.equal(f.calls.length, 1, 'same request ID must not create a second loot or cover transaction');
});

test('U-10 scene role and ID cannot be invented by a remote client or used for a closed house', async () => {
  const f = fixture();
  for (const attempt of [
    { role: 'search-room', locationId: 'u10/stone-home-01' },
    { role: 'take-cover', locationId: f.first.id + '/ghost' },
    { role: 'borrow-inventory', locationId: f.first.id },
    { role: 'search-room', locationId: 'forged-world-anchor' },
  ]) {
    const result = await f.service.interact({ playerId: 'a', requestId: 'q1', ...attempt } as never);
    assert.equal(result.kind, 'invalid');
  }
  for (const [playerId, requestId] of [['', 'q'], ['a', ''], [' ', 'q']]) {
    assert.equal((await f.service.interact({ playerId, requestId,
      locationId: f.first.id, role: f.first.role })).kind, 'invalid');
  }
  assert.equal(f.calls.length, 0);
});

test('U-10 wrong registered layer, unsupported foot, bad player ID or blocked sight cannot claim an action', async () => {
  const f = fixture();
  const action = { playerId: 'a', requestId: 'q', locationId: f.first.id, role: f.first.role };
  f.move('a', { ...frame, east: frame.east + 300 });
  assert.equal((await f.service.interact(action)).kind, 'unreachable');
  f.move('a', { ...f.first.worldFoot }, 'town');
  assert.equal((await f.service.interact(action)).kind, 'unreachable');
  f.move('a', { ...f.first.worldFoot });
  f.setLOS(false);
  assert.equal((await f.service.interact(action)).kind, 'unreachable');
  f.setLOS(true);
  f.setSupport(false);
  assert.equal((await f.service.interact(action)).kind, 'unreachable');
  f.setSupport(true);
  f.setActive(false);
  assert.equal((await f.service.interact(action)).kind, 'unreachable');
  f.setActive(true);
  f.feet.set('a', { ...f.feet.get('a')!, playerId: 'b' });
  assert.equal((await f.service.interact(action)).kind, 'unreachable');
  f.feet.set('a', { playerId: 'a', domainId: frame.domainId,
    east: NaN, north: f.first.worldFoot.north, height: -165 });
  assert.equal((await f.service.interact(action)).kind, 'unreachable');
  assert.equal(f.calls.length, 0);
});

test('U-10 stale client revision cannot override current world or update a loot journal', async () => {
  const f = fixture();
  const action = { playerId: 'a', requestId: 'fresh1',
    locationId: f.first.id, role: f.first.role, expectedRevision: 30 };
  assert.deepEqual(await f.service.interact(action), { kind: 'stale', revision: 31 });
  assert.equal(f.calls.length, 0);
  f.setVersion(NaN);
  assert.equal((await f.service.interact({ ...action, expectedRevision: 31 })).kind, 'unavailable');
  f.setVersion(32);
  assert.equal((await f.service.interact({ ...action, expectedRevision: -1 })).kind, 'invalid');
  assert.equal((await f.service.interact({ ...action, expectedRevision: Infinity })).kind, 'invalid');
  assert.equal((await f.service.interact({ ...action, expectedRevision: 32 })).kind, 'submitted');
  assert.equal(f.calls[0].serverRevision, 32);
});

test('U-10 durable receipt does not let one request ID be reused to obtain a different action', async () => {
  const f = fixture();
  const first = { playerId: 'a', requestId: 'same-nonce',
    locationId: f.first.id, role: f.first.role } as const;
  assert.equal((await f.service.interact(first)).kind, 'submitted');
  const cover = f.all.find(s => s.id === f.first.id && s.role === 'take-cover')!;
  f.move('a', { ...cover.worldFoot });
  assert.deepEqual(await f.service.interact({ ...first, role: 'take-cover' }),
    { kind: 'conflicting-request' });
  assert.equal(f.calls.length, 1);
});

test('U-10 overlapping requests from one player are rejected while two distinct nearby players remain independent', async () => {
  const f = fixture();
  let finish!: (value: string) => void;
  let firstPending = true;
  const service = createWarriorDistrictAuthority({
    ...f.options,
    submit(command) {
      if (command.playerId === 'a' && firstPending) {
        firstPending = false;
        return new Promise<string>(resolve => { finish = resolve; });
      }
      return Promise.resolve('ok');
    },
  });
  const intent = { playerId: 'a', requestId: 'pending',
    role: f.first.role, locationId: f.first.id } as const;
  const pending = service.interact(intent);
  // Allow the durable receipt await to complete before the first submit enters its hold.
  await Promise.resolve();
  assert.equal((await service.interact({ ...intent, requestId: 'another' })).kind, 'busy');
  assert.equal((await service.interact({ ...intent, playerId: 'b',
    requestId: 'other-player' })).kind, 'submitted');
  finish('committed');
  assert.deepEqual(await pending, { kind: 'submitted', result: 'committed' });
  assert.equal((await service.interact({ ...intent, requestId: 'after' })).kind, 'submitted');
});

test('U-10 cannot register fake city dimensions or player action feet without host permission', () => {
  const f = fixture();
  assert.throws(() => createWarriorDistrictAuthority({
    ...f.options, frame: { ...frame, yaw: NaN },
  }), /certified domain/);
  assert.throws(() => createWarriorDistrictAuthority({
    ...f.options, frame: { ...frame, domainId: '' },
  }), /certified domain/);
  assert.throws(() => createWarriorDistrictAuthority({
    ...f.options, supportsStation: (_foot, role) => role !== 'lookout',
  }), /lacks a certified supported foot/);
  assert.deepEqual(warriorDistrictTransform({ ...frame, yaw: 0 }, [5, 7, -2]),
    { east: frame.east + 5, north: frame.north - 2, height: frame.height + 7 });
});
