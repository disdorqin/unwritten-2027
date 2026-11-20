import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTownPresenceNight } from '../tools/voxel-tavern/town-blockout/town-presence-night';

const night = {
  phase: 'night-window', shift: 'night', canEnterRestricted: true, layersOverlap: true,
  chapterGatesLocked: true, beaconAt: 100, morningBellAt: 60_200,
} as const;
const cue = { type: 'event', kind: 'town-night-beacon', at: 100, expiresAt: 120 } as const;

test('night snapshots expose gate state with no audio, and disconnect drops the old session', () => {
  const host = createTownPresenceNight(() => 105);
  const heard: number[] = [];
  host.onBeacon(event => heard.push(event.at));

  host.acceptWindow(night);
  host.acceptBeacon(cue);
  assert.equal(host.state(), undefined);
  assert.deepEqual(heard, []);

  host.join(101, night);
  assert.equal(host.connectedAt(), 101);
  assert.deepEqual(host.state(), night);
  assert.ok(Object.isFrozen(host.state()));
  host.acceptBeacon(cue);
  assert.deepEqual(heard, []);

  const later = { ...night, layersOverlap: false };
  host.acceptWindow(later);
  assert.deepEqual(host.state(), later);
  host.acceptWindow({ ...night, canEnterRestricted: false });
  assert.deepEqual(host.state(), later);
  host.disconnect();
  assert.equal(host.state(), undefined);
  assert.equal(host.connectedAt(), undefined);
});

test('one live cue waits for the synchronized server clock and never replays on reconnect', () => {
  let now = 99;
  const host = createTownPresenceNight(() => now);
  const heard: number[] = [];
  host.join(90, undefined);
  host.onBeacon(event => heard.push(event.at));
  host.acceptBeacon(cue);
  assert.deepEqual(heard, []);
  now = 100;
  host.tick();
  host.acceptBeacon(cue);
  assert.deepEqual(heard, [100]);

  host.disconnect();
  host.join(101, night);
  host.acceptBeacon(cue);
  assert.deepEqual(heard, [100]);
  host.acceptBeacon({ ...cue, at: 102, expiresAt: 103 });
  now = 103;
  host.tick();
  assert.deepEqual(heard, [100]);
});

test('a cue is discarded when its subscriber or trusted connection changes', () => {
  let now = 99;
  const host = createTownPresenceNight(() => now);
  const heard: number[] = [];
  host.join(90, undefined);
  const unsubscribe = host.onBeacon(event => heard.push(event.at));
  host.acceptBeacon(cue);
  unsubscribe();
  host.onBeacon(event => heard.push(event.at));
  now = 100;
  host.tick();
  assert.deepEqual(heard, []);

  host.acceptBeacon({ ...cue, at: 105 });
  host.disconnect();
  host.join(102, night);
  now = 105;
  host.tick();
  assert.deepEqual(heard, []);
});
