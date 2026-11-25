import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh } from 'three';
import {
  mountStoneSinkWinchSpirit, stoneSinkReturnLine, stoneSinkFadeMs, stoneSinkLampAfterglowMs,
} from '../tools/voxel-tavern/town-blockout/g03-stone-sink-winch.js';

const station = Object.freeze({ domainId: 'west', east: -123, north: 182, height: -24.2227, yaw: Math.PI / 4 });
type Frame = Parameters<Extract<ReturnType<typeof mountStoneSinkWinchSpirit>, { kind: 'ready' }>['sync']>[0];
function fixture() {
  const parent = new Group();
  const claimed = new Set<string>();
  const spoken: string[] = [];
  let accepted = true;
  let claimCalls = 0;
  const host = {
    parent, site: station,
    supportsStation: () => accepted,
    claimAcceptedReturnOnce(playerId: string, tripId: number) {
      claimCalls++;
      const key = playerId + ':' + tripId;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    speak: (line: typeof stoneSinkReturnLine) => { spoken.push(line); },
  };
  const normal: Frame = {
    nowMs: 10_000, viewerId: 'returner', activeDomain: 'west',
    soulSightGranted: true, nightWindow: true, dreamActive: true,
  };
  return { host, normal, spoken, claimed, parent, setAccepted(value: boolean) { accepted = value; },
    get claimCalls() { return claimCalls; } };
}

test('G-03 stone-sink placement fails closed without an A-window surveyed winch station', () => {
  const f = fixture();
  assert.deepEqual(mountStoneSinkWinchSpirit({ ...f.host, site: undefined }), { kind: 'unregistered' });
  f.setAccepted(false);
  assert.deepEqual(mountStoneSinkWinchSpirit(f.host), { kind: 'unsupported-site' });
  for (const site of [
    { ...station, domainId: '' }, { ...station, domainId: ' west' },
    { ...station, north: NaN }, { ...station, height: Infinity }, { ...station, yaw: NaN },
  ]) {
    assert.deepEqual(mountStoneSinkWinchSpirit({ ...f.host, site }), { kind: 'invalid-site' });
  }
  assert.equal(f.parent.children.length, 0);
});

test('night, soul authorization and dream-chain activity jointly gate the apparition; it never intercepts winch rays', () => {
  const f = fixture();
  const spirit = mountStoneSinkWinchSpirit(f.host);
  assert.equal(spirit.kind, 'ready');
  if (spirit.kind !== 'ready') assert.fail();
  assert.equal(f.parent.children.length, 1);
  assert.deepEqual(spirit.group.position.toArray(), [station.east, station.height, -station.north]);
  assert.equal(spirit.group.visible, false);
  const mesh = spirit.group.children[0] as InstancedMesh;
  assert.equal(mesh.isInstancedMesh, true);
  assert.ok(mesh.count >= 12);
  const hits: unknown[] = [];
  mesh.raycast({} as never, hits as never);
  assert.equal(hits.length, 0);
  for (const changes of [
    { nightWindow: false }, { soulSightGranted: false }, { dreamActive: false },
    { activeDomain: 'town' }, { activeDomain: 'mine' }, { viewerId: '' }, { nowMs: NaN },
  ]) {
    assert.deepEqual(spirit.sync({ ...f.normal, ...changes }), { visible: false, lampAfterglow: false, spoke: false });
    assert.equal(spirit.group.visible, false);
    assert.deepEqual(f.spoken, []);
  }
  assert.deepEqual(spirit.sync(f.normal), { visible: true, lampAfterglow: false, spoke: false });
  assert.equal(f.claimCalls, 0);
  spirit.dispose();
  spirit.dispose();
  assert.equal(f.parent.children.length, 0);
  assert.deepEqual(spirit.sync(f.normal), { visible: false, lampAfterglow: false, spoke: false });
});

test('an accepted same-viewer return speaks the exact sole canon line, fades, then leaves 10 seconds of host lamp glow', () => {
  const f = fixture();
  const spirit = mountStoneSinkWinchSpirit(f.host);
  assert.equal(spirit.kind, 'ready');
  if (spirit.kind !== 'ready') assert.fail();
  const receipt = { playerId: 'returner', domainId: 'west', tripId: 417, arrivedAtMs: f.normal.nowMs };
  assert.deepEqual(spirit.sync({ ...f.normal, acceptedReturn: receipt }),
    { visible: true, lampAfterglow: false, spoke: true });
  assert.deepEqual(f.spoken, [stoneSinkReturnLine]);
  assert.equal(f.claimCalls, 1);
  assert.equal(spirit.sync({ ...f.normal, acceptedReturn: receipt }).spoke, false);
  assert.equal(f.claimCalls, 1);
  assert.equal(spirit.sync({ ...f.normal, nowMs: f.normal.nowMs + stoneSinkFadeMs - 1 }).visible, true);
  assert.deepEqual(spirit.sync({ ...f.normal, nowMs: f.normal.nowMs + stoneSinkFadeMs }),
    { visible: false, lampAfterglow: true, spoke: false });
  assert.equal(spirit.group.visible, false);
  assert.equal(spirit.sync({ ...f.normal, nowMs: f.normal.nowMs + stoneSinkFadeMs +
    stoneSinkLampAfterglowMs - 1 }).lampAfterglow, true);
  assert.deepEqual(spirit.sync({ ...f.normal, nowMs: f.normal.nowMs + stoneSinkFadeMs +
    stoneSinkLampAfterglowMs }), { visible: false, lampAfterglow: false, spoke: false });
  assert.deepEqual(f.spoken, [stoneSinkReturnLine]);
  spirit.dispose();
});

test('stale, cross-domain, fabricated or wrong-player return receipts never play a line or extend lamp glow', () => {
  const f = fixture();
  const spirit = mountStoneSinkWinchSpirit(f.host);
  if (spirit.kind !== 'ready') assert.fail();
  const base = { playerId: 'returner', domainId: 'west', tripId: 77, arrivedAtMs: f.normal.nowMs };
  for (const receipt of [
    { ...base, playerId: 'spectator' }, { ...base, domainId: 'mine' },
    { ...base, tripId: 0 }, { ...base, tripId: -3 }, { ...base, tripId: 1.2 },
    { ...base, arrivedAtMs: f.normal.nowMs + 1 }, { ...base, arrivedAtMs: f.normal.nowMs - 3_001 },
    { ...base, arrivedAtMs: NaN },
  ]) {
    const state = spirit.sync({ ...f.normal, acceptedReturn: receipt });
    assert.deepEqual(state, { visible: true, lampAfterglow: false, spoke: false });
  }
  assert.deepEqual(f.spoken, []);
  assert.equal(f.claimCalls, 0);
  assert.equal(spirit.sync({ ...f.normal, soulSightGranted: false, acceptedReturn: base }).spoke, false);
  assert.equal(spirit.sync({ ...f.normal, nightWindow: false, acceptedReturn: base }).spoke, false);
  assert.equal(spirit.sync({ ...f.normal, dreamActive: false, acceptedReturn: base }).spoke, false);
  assert.equal(f.claimCalls, 0);
  spirit.dispose();
});

test('host-maintained idempotency survives remount; day or lost privilege suppresses the old echo', () => {
  const f = fixture();
  const receipt = { playerId: 'returner', domainId: 'west', tripId: 38, arrivedAtMs: f.normal.nowMs };
  const first = mountStoneSinkWinchSpirit(f.host);
  assert.equal(first.kind, 'ready');
  if (first.kind !== 'ready') assert.fail();
  assert.equal(first.sync({ ...f.normal, acceptedReturn: receipt }).spoke, true);
  first.dispose();
  const second = mountStoneSinkWinchSpirit(f.host);
  assert.equal(second.kind, 'ready');
  if (second.kind !== 'ready') assert.fail();
  assert.equal(second.sync({ ...f.normal, acceptedReturn: receipt }).spoke, false);
  assert.deepEqual(f.spoken, [stoneSinkReturnLine]);
  assert.deepEqual(second.sync({ ...f.normal, acceptedReturn: receipt, nightWindow: false }),
    { visible: false, lampAfterglow: false, spoke: false });
  assert.deepEqual(second.sync({ ...f.normal, acceptedReturn: receipt, soulSightGranted: false }),
    { visible: false, lampAfterglow: false, spoke: false });
  second.dispose();
});
