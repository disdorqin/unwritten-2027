import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveOrbitalGateTravel,
  type OrbitalGate,
  type OrbitalGateEndpoint,
  type OrbitalGateHost,
  type OrbitalGateState,
} from '../../src/presence/orbital-gates.ts';

// Fixture coordinates distinguish openings. The production host supplies surveyed poses.
const endpoints: Record<OrbitalGateEndpoint, OrbitalGateState> = {
  'starport-ground': { site: 'starport', pose: { east: 1, north: 2, height: 3, yaw: 0 } },
  'core-ground': { site: 'core', pose: { east: 4, north: 5, height: -6, yaw: 1 } },
  'starport-airlock': { site: 'airlock', pose: { east: 7, north: 8, height: 9, yaw: 2 } },
  'core-airlock': { site: 'airlock', pose: { east: 10, north: 11, height: 12, yaw: 3 } },
};

function makeHost(open: ReadonlySet<OrbitalGate>): OrbitalGateHost {
  const atOpening: OrbitalGateHost['isAtOpening'] = (endpoint, pose) => {
    const expected = endpoints[endpoint].pose;
    return pose.east === expected.east && pose.north === expected.north && pose.height === expected.height;
  };
  return {
    isOpen: gate => open.has(gate),
    isAtOpening: atOpening,
    landingAt: endpoint => endpoints[endpoint],
    isLegalLanding: atOpening,
  };
}

test('starport and core each reach the corresponding airlock opening and return to their own ground opening', () => {
  const host = makeHost(new Set(['starport', 'core']));
  for (const gate of ['starport', 'core'] as const) {
    const ground = `${gate}-ground` as const;
    const airlock = `${gate}-airlock` as const;

    const entry = resolveOrbitalGateTravel({ gate, direction: 'enter' }, endpoints[ground], host);
    assert.deepEqual(entry, { ok: true, destination: airlock, state: endpoints[airlock] });
    assert.equal(entry.ok, true);
    assert.notEqual(entry.state.pose, endpoints[airlock].pose);

    const returned = resolveOrbitalGateTravel({ gate, direction: 'return' }, entry.state, host);
    assert.deepEqual(returned, { ok: true, destination: ground, state: endpoints[ground] });
  }
});

test('the host checks each ground and airlock opening independently instead of trusting a claimed route', () => {
  const host = makeHost(new Set(['starport', 'core']));
  const rejected = { ok: false, reason: 'wrong-origin' };
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'core', direction: 'enter' }, endpoints['starport-ground'], host), rejected);
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'starport', direction: 'enter' }, endpoints['core-ground'], host), rejected);
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'core', direction: 'return' }, endpoints['starport-airlock'], host), rejected);
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'starport', direction: 'return' }, endpoints['core-airlock'], host), rejected);
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'core', direction: 'return' }, endpoints['core-ground'], host), rejected);
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'starport', direction: 'enter' }, {
    site: 'starport', pose: { ...endpoints['starport-ground'].pose, east: Infinity },
  }, host), rejected);
});

test('boarding via starport does not prevent returning via core after walking to its airlock opening', () => {
  const host = makeHost(new Set(['starport', 'core']));
  assert.equal(resolveOrbitalGateTravel({ gate: 'starport', direction: 'enter' }, endpoints['starport-ground'], host).ok, true);
  const acceptedPositionAfterWalking = endpoints['core-airlock'];
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'core', direction: 'return' }, acceptedPositionAfterWalking, host),
    { ok: true, destination: 'core-ground', state: endpoints['core-ground'] });
});

test('either direction requires the specific gate to be open at traversal time', () => {
  const open = new Set<OrbitalGate>(['starport']);
  const host = makeHost(open);
  let landingReads = 0;
  const withoutLanding = { ...host, landingAt() { landingReads++; return undefined; } };
  const locked = { ok: false, reason: 'locked' };
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'core', direction: 'enter' }, endpoints['core-ground'], withoutLanding), locked);
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'core', direction: 'return' }, endpoints['core-airlock'], withoutLanding), locked);
  assert.equal(landingReads, 0);

  open.add('core');
  assert.equal(resolveOrbitalGateTravel({ gate: 'core', direction: 'return' }, endpoints['core-airlock'], host).ok, true);
  open.delete('core');
  assert.deepEqual(resolveOrbitalGateTravel({ gate: 'core', direction: 'return' }, endpoints['core-airlock'], host), locked);
});

test('a missing, mismatched, invalid or obstructed landing is refused instead of falling back', () => {
  const host = makeHost(new Set(['core']));
  const request = { gate: 'core', direction: 'return' };
  const current = endpoints['core-airlock'];
  const invalidPoses = [
    undefined,
    endpoints['starport-ground'],
    { site: 'core', pose: { ...endpoints['core-ground'].pose, height: Infinity } },
    { site: 'core', pose: { ...endpoints['core-ground'].pose, north: 17 } },
  ] as const;
  const denied = { ok: false, reason: 'invalid-landing' };
  for (const landing of invalidPoses) {
    assert.deepEqual(resolveOrbitalGateTravel(request, current, { ...host, landingAt: () => landing }), denied);
  }
  assert.deepEqual(resolveOrbitalGateTravel(request, current, { ...host, isLegalLanding: () => false }), denied);
  assert.equal(current.site, 'airlock');
  assert.equal(current.pose.east, 10);
});

test('rejects unknown requests and ignores client-supplied positions, lock state and destinations', () => {
  const host = makeHost(new Set(['starport']));
  const current = endpoints['starport-ground'];
  for (const request of [null, {}, { gate: 'constructor', direction: 'enter' }, { gate: 'starport', direction: 'jump' }]) {
    assert.deepEqual(resolveOrbitalGateTravel(request, current, host), { ok: false, reason: 'invalid-request' });
  }
  assert.deepEqual(resolveOrbitalGateTravel({
    gate: 'core', direction: 'enter', open: true, source: endpoints['core-ground'],
  }, current, host), { ok: false, reason: 'wrong-origin' });
  assert.deepEqual(resolveOrbitalGateTravel({
    gate: 'starport', direction: 'enter', destination: endpoints['core-airlock'],
  }, current, host), { ok: true, destination: 'starport-airlock', state: endpoints['starport-airlock'] });
});
