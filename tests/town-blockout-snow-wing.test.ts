import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  claimSnowWing, createSnowWingFlight, snowWingLaunchAllowed, snowWingSpec, snowWingStallCue,
} from '../src/shared/snow-wing.ts';

const tick = 1 / 60;
const summit = { east: 50, north: 975, height: 800, heading: Math.PI, speed: 8, drop: 18, pathClear: true, claimed: true };

function close(actual: number, expected: number, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected} ± ${tolerance}, observed ${actual}`);
}

test('approved P-4 registration claims once from the summit lodge and gates launch', () => {
  const registered = { snowWingEligible: true };
  assert.equal(claimSnowWing(false, 'summit-lodge', { snowWingEligible: false }), false);
  assert.equal(claimSnowWing(false, 'cloud-terrace-lodge', registered), false);
  assert.equal(claimSnowWing(false, 'summit-lodge', registered), true);
  assert.equal(claimSnowWing(true, 'other', { snowWingEligible: false }), true);
  assert.ok(snowWingLaunchAllowed({ ...summit, drop: 15 }));
  for (const launch of [
    { ...summit, drop: 14.99 }, { ...summit, drop: 0 }, { ...summit, drop: Infinity },
    { ...summit, pathClear: false }, { ...summit, claimed: false }, { ...summit, speed: -1 },
  ]) assert.equal(snowWingLaunchAllowed(launch), false);
  const flight = createSnowWingFlight(() => 0);
  assert.ok(flight.launch(summit));
  assert.equal(flight.launch(summit), false);
});

test('mountain edge lift has a 0.3 s half-metre drop and slower starts get a 1 s wing beat', () => {
  const flight = createSnowWingFlight(() => 0);
  assert.ok(flight.launch({ ...summit, speed: 3 }));
  const lift = flight.advance(.3)!;
  assert.equal(lift.phase, 'flap-assist');
  assert.equal(lift.speed, 3);
  close(lift.height, 799.5);
  const assisted = flight.advance(1)!;
  assert.equal(assisted.phase, 'glide');
  assert.equal(assisted.speed, 8);
  assert.equal(assisted.stallCue, 'clear');
  assert.equal(flight.advance(1)!.speed > 10, true);
});

test('slow departures from the receding summit slope skim safely while the wing beat assists', () => {
  const summitSlopeAt = (_east: number, north: number) => 800 - Math.max(0, 975 - north) * 650 / 1375;
  for (const speed of [0, 3]) {
    const flight = createSnowWingFlight(summitSlopeAt);
    assert.ok(flight.launch({ ...summit, speed }));
    const lift = flight.advance(.3)!;
    assert.equal(lift.phase, 'flap-assist');
    assert.ok(lift.height >= summitSlopeAt(lift.east, lift.north));
    const assisted = flight.advance(1)!;
    assert.equal(assisted.phase, 'glide');
    assert.equal(assisted.speed, 8);
    assert.ok(assisted.height > summitSlopeAt(assisted.east, assisted.north));
    assert.equal(flight.advance(1)!.phase, 'glide');
  }
});

test('from 800 m, steady 15 m/s glide descends at 2.5 m/s and reaches approximately 4.8 km', t => {
  const flight = createSnowWingFlight(() => 0);
  assert.ok(flight.launch({ ...summit, speed: 15 }));
  const afterLift = flight.advance(.3)!;
  let steady = afterLift;
  for (let second = 0; second < 10; second++) steady = flight.advance(1, { cloudReferenceVisible: true })!;
  close(steady.speed, 15);
  close(steady.horizontalMetres - afterLift.horizontalMetres, 150);
  close(afterLift.height - steady.height, 25);
  close((steady.horizontalMetres - afterLift.horizontalMetres) / (afterLift.height - steady.height), 6);
  while (steady.phase !== 'landed' && steady.elapsed < 400) steady = flight.advance(1, { cloudReferenceVisible: true })!;
  assert.equal(steady.phase, 'landed');
  assert.equal(steady.touchdown, 'soft');
  assert.equal(steady.height, 0);
  assert.equal(steady.usesBothHands, false);
  assert.ok(steady.horizontalMetres >= 4_790 && steady.horizontalMetres <= 4_810);
  t.diagnostic(`flat zero-altitude range from 800 m at settled cruise: ${steady.horizontalMetres.toFixed(3)} m in ${steady.elapsed.toFixed(3)} s`);
});

test('zero input returns to cruise, turns stay within 35 degrees and a soft stall can recover', t => {
  const flight = createSnowWingFlight(() => 0);
  assert.ok(flight.launch(summit));
  flight.advance(.3);
  let state = flight.advance(1)!;
  for (let second = 1; second < 10; second++) state = flight.advance(1)!;
  assert.equal(state.speed, 15);
  assert.equal(state.usesBothHands, true);
  const banked = flight.advance(1, { turn: 1 })!;
  close(banked.bank, snowWingSpec.maximumBank);
  assert.notEqual(banked.heading, state.heading);
  assert.equal(banked.speed, 15);
  assert.equal(flight.advance(1)!.bank, 0);
  assert.equal(snowWingStallCue(10.500001), 'clear');
  assert.equal(snowWingStallCue(10.5), 'flutter');
  assert.equal(snowWingStallCue(10), 'dim');
  assert.equal(snowWingStallCue(9.999999), 'settling');
  const cues = new Set<string>();
  for (let frame = 0; frame < 180; frame++) {
    state = flight.advance(tick, { pitch: 1 })!;
    cues.add(state.stallCue);
    if (state.phase === 'settling') break;
  }
  assert.ok(cues.has('flutter') && cues.has('dim') && cues.has('settling'));
  const atStall = state;
  const oneSecondLater = flight.advance(1)!;
  assert.equal(oneSecondLater.phase, 'settling');
  close(atStall.height - oneSecondLater.height, 6);
  const release = flight.advance(.5, { pitch: -1 })!;
  assert.equal(release.phase, 'settling');
  flight.advance(.25);
  assert.equal(flight.advance(.99, { pitch: -1 })!.phase, 'settling');
  const recovered = flight.advance(.01, { pitch: -1 })!;
  assert.equal(recovered.phase, 'glide');
  assert.ok(recovered.speed > 10.5);
  t.diagnostic(`steady stall descent: ${(atStall.height - oneSecondLater.height).toFixed(3)} m/s; recovered in one continuous second`);
});

test('unrecovered stall ends seated, with controls released by terrain contact', () => {
  const flight = createSnowWingFlight(() => 20);
  assert.ok(flight.launch({ ...summit, height: 40, speed: 15 }));
  flight.advance(.3);
  let result = flight.advance(1, { pitch: 1 })!;
  while (result.phase !== 'landed' && result.elapsed < 10) result = flight.advance(1, { pitch: 1 })!;
  assert.equal(result.phase, 'landed');
  assert.equal(result.touchdown, 'seated');
  assert.equal(result.usesBothHands, false);
  assert.equal(result.speed, 0);
  assert.equal(result.height, 20);
});

test('cloud cues follow the 380–560 m band and request references when visibility stays masked', () => {
  const flight = createSnowWingFlight(() => 0);
  assert.ok(flight.launch({ ...summit, height: 560, speed: 15 }));
  assert.equal(flight.advance(.3)!.visibilityMetres, 400);
  for (let second = 0; second < 20; second++) flight.advance(1, { cloudReferenceVisible: false });
  assert.equal(flight.snapshot()!.needsCloudReference, true);
  assert.equal(flight.advance(tick, { cloudReferenceVisible: true })!.needsCloudReference, false);
  while (flight.snapshot()!.height > 379) flight.advance(1, { cloudReferenceVisible: true });
  assert.equal(flight.snapshot()!.visibilityMetres, null);
});
