import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AircraftPoint } from '../src/shared/aircraft-flight';
import { createStarportAssembly, starportAssemblyParts, type StarportAssemblyState } from '../src/shared/starport-assembly';

function prepare() {
  const point = (east: number): AircraftPoint => ({ east, north: 657, height: 347 });
  const sockets = { 'snow-wing': point(325), booster: point(327), 'navigation-core': point(329) };
  const profiles = new Map<string, StarportAssemblyState>([
    ['pilot', { revision: 0, carried: [...starportAssemblyParts], installed: [], ignited: false }],
    ['guest', { revision: 0, carried: [], installed: [], ignited: false }],
  ]);
  let feet: AircraftPoint | undefined = sockets['snow-wing'];
  let access = { keyOne: false, layersOverlap: false };
  let beforeCommit = () => {};
  const assembly = createStarportAssembly({ sockets, ignitionPoint: point(327) }, {
    read: id => profiles.get(id), pose: () => feet, readIgnition: () => access,
    commit(id, expected, next, guard) {
      beforeCommit();
      if (profiles.get(id)?.revision !== expected || !guard()) return false;
      profiles.set(id, next);
      return true;
    },
  });
  return { assembly, sockets, move(point: AircraftPoint | undefined) { feet = point; },
    setAccess(keyOne: boolean, layersOverlap: boolean) { access = { keyOne, layersOverlap }; },
    setBeforeCommit(hook: () => void) { beforeCommit = hook; } };
}

test('physical reach and ownership protect each distinct socket; concurrent installs consume exactly once', async () => {
  const { assembly, sockets, move } = prepare();
  assert.equal((await assembly.place('guest', 'snow-wing')).kind, 'not-carried');
  assert.equal((await assembly.place('pilot', 'booster')).kind, 'out-of-reach');
  const results = await Promise.all([assembly.place('pilot', 'snow-wing'), assembly.place('pilot', 'snow-wing')]);
  assert.deepEqual(results.map(result => result.kind).sort(), ['conflict', 'placed']);
  assert.equal((await assembly.place('pilot', 'snow-wing')).kind, 'already-installed');
  assert.deepEqual(await assembly.snapshot('pilot'), { revision: 1, carried: ['booster', 'navigation-core'], installed: ['snow-wing'], ignited: false });
  move(sockets.booster);
  assert.equal((await assembly.place('pilot', 'booster')).kind, 'placed');
  assert.deepEqual((await assembly.snapshot('guest'))?.installed, []);
});

test('leaving the domain before a write does not install a component', async () => {
  const { assembly, move, setBeforeCommit } = prepare();
  setBeforeCommit(() => move(undefined));
  assert.equal((await assembly.place('pilot', 'snow-wing')).kind, 'conflict');
  assert.deepEqual((await assembly.snapshot('pilot'))?.carried, [...starportAssemblyParts]);
});

test('ignition requires the installed parts, story key and shared overlap at commit time', async () => {
  const { assembly, sockets, move, setAccess, setBeforeCommit } = prepare();
  move(sockets.booster);
  assert.equal((await assembly.ignite('pilot')).kind, 'incomplete');
  for (const part of starportAssemblyParts) {
    move(sockets[part]);
    assert.equal((await assembly.place('pilot', part)).kind, 'placed');
  }
  move(sockets.booster);
  assert.equal((await assembly.ignite('pilot')).kind, 'missing-key');
  setAccess(true, false);
  assert.equal((await assembly.ignite('pilot')).kind, 'window-closed');
  setAccess(true, true);
  setBeforeCommit(() => setAccess(true, false));
  assert.equal((await assembly.ignite('pilot')).kind, 'conflict');
  setBeforeCommit(() => {});
  setAccess(true, true);
  assert.equal((await assembly.ignite('pilot')).kind, 'ignited');
  assert.equal((await assembly.ignite('pilot')).kind, 'already-ignited');
  assert.deepEqual(await assembly.snapshot('pilot'), { revision: 4, carried: [], installed: [...starportAssemblyParts], ignited: true });
});
