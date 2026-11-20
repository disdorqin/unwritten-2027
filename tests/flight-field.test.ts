import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStarportFuelDispenser, type StarportFuelFoot, type StarportFuelProfile } from '../src/presence/starport-fuel';
import { createCloudDeckCircuit, flightAirspaceAt, registerFlightEmergencySites, type FlightEmergencySite } from '../src/shared/flight-field';

const at = (east: number, north: number, height = 347) => ({ east, north, height });

test('cloud bounds, frost, ceiling and sparse presence follow the approved altitude cuts', () => {
  assert.deepEqual([379.99, 380, 559.99, 560, 899.99, 900, 1000].map(y => flightAirspaceAt(y).band),
    ['云下', '云中', '云中', '云上', '云上', '结霜', '升限']);
  assert.equal(flightAirspaceAt(380).sparsePresence, false);
  assert.equal(flightAirspaceAt(380.01).sparsePresence, true);
  assert.equal(flightAirspaceAt(1000).overCeiling, false);
  assert.equal(flightAirspaceAt(1000.01).overCeiling, true);
  assert.throws(() => flightAirspaceAt(NaN), RangeError);
});

test('three forced-landing types register only when the matching surface and each exit can be reached', () => {
  const sites = [
    { id: 'cloud-deck', area: 'north-ridge', pad: at(20, 0), exit: [at(22, 0), at(24, 0)] },
    { id: 'square', area: 'town', pad: at(80, 0, 12), exit: [at(82, 0, 12)] },
    { id: 'mirror-lake', area: 'town', pad: at(95, 0, 11), exit: [at(97, 0, 11)] },
  ] as const satisfies readonly FlightEmergencySite[];
  const surfaceAt = (area: string, point: ReturnType<typeof at>) => area === 'north-ridge' ? 'terrace' :
    point.east < 90 ? 'pavement' : 'ice';
  const all = registerFlightEmergencySites(sites, { surfaceAt, canWalk: () => true });
  assert.equal(all.sites().length, 3);
  assert.equal(all.nearest('town', at(94, 0, 27))?.id, 'mirror-lake');
  assert.equal(all.nearest('north-ridge', at(20, 0, 346)), undefined);
  const blocked = registerFlightEmergencySites(sites, { surfaceAt, canWalk: (_area, _start, end) => end.east < 97 });
  assert.deepEqual(blocked.sites().map(site => site.id), ['cloud-deck', 'square']);
});

test('the sample counter requires successful checks, directional gates and return to the same runway', () => {
  const route = createCloudDeckCircuit(at(0, 0), 0);
  const sample = (position: ReturnType<typeof at>, elapsedMs: number, airborne = true) =>
    route.update({ at: position, airborne, elapsedMs });
  assert.equal(sample(at(0, 0), 0, false).stage, 'idle');
  assert.deepEqual(route.prepare({ assembled: true, fuelSeconds: 0, clearAirspace: true }),
    { 合体: true, 燃料: false, 空域: true });
  assert.equal(sample(at(0, 0), 1, false).stage, 'aborted');
  route.prepare({ assembled: true, fuelSeconds: 600, clearAirspace: true });
  sample(at(0, 0), 0, false);
  assert.equal(sample(at(0, 4, 349), 1000).stage, 'airborne');
  let now = 1000;
  for (const gate of route.gates) {
    const offset = (sign: number) => at(gate.at.east + 2 * sign * gate.forwardEast,
      gate.at.north + 2 * sign * gate.forwardNorth, gate.at.height);
    sample(offset(-1), now += 2000);
    sample(offset(1), now += 2000);
  }
  assert.equal(route.snapshot().nextGate, 4);
  assert.deepEqual(sample(at(3, 0), now + 2000, false), { stage: 'complete', nextGate: 4, durationMs: 18000 });
  const falseStart = createCloudDeckCircuit(at(0, 0), 0);
  falseStart.prepare({ assembled: true, fuelSeconds: 600, clearAirspace: true });
  assert.equal(falseStart.update({ at: at(0, 0, 355), airborne: true, elapsedMs: 1000 }).stage, 'aborted');
});

test('starport fuel charges one ore once only when a grounded aircraft is actually at the point', () => {
  const point = at(312, 650);
  let sample: StarportFuelFoot = { area: 'test-deck', at: point, grounded: true };
  let profile: StarportFuelProfile = { revision: 1, assembled: true, stardustOre: 2, fuelSeconds: 45 };
  let allowCommit = true;
  const fuel = createStarportFuelDispenser({ area: 'test-deck', point }, {
    foot: () => sample, profile: () => profile,
    commit(_player, revision, next) {
      if (!allowCommit || revision !== profile.revision) return false;
      profile = next;
      return true;
    },
  });
  assert.deepEqual(fuel.inspect(3), { revision: 1, ore: 2, fuelSeconds: 45, fullThrustSecondsPerOre: 600 });
  sample = { ...sample, grounded: false };
  assert.equal(fuel.refill(3, 1), false);
  sample = { ...sample, grounded: true, area: 'other' };
  assert.equal(fuel.refill(3, 1), false);
  sample = { ...sample, area: 'test-deck' };
  allowCommit = false;
  assert.equal(fuel.refill(3, 1), false);
  assert.equal(profile.stardustOre, 2);
  allowCommit = true;
  assert.equal(fuel.refill(3, 1), true);
  assert.deepEqual(profile, { revision: 2, assembled: true, stardustOre: 1, fuelSeconds: 645 });
  assert.equal(fuel.refill(3, 1), false);
  assert.equal(profile.stardustOre, 1);
});
