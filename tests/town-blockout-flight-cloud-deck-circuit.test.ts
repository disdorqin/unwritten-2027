import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assembleAircraftAtStarport, createAircraftFlight, surveyAircraftRunway,
  type AircraftPoint, type AircraftThrottle,
} from '../src/shared/aircraft-flight';
import { createCloudDeckCircuit } from '../src/shared/flight-field';
import { createFlightThrust, fuelSecondsPerStardustOre } from '../src/shared/flight-thrust';
import { createStarportReviewWorld, starportFlightSite } from '../tools/voxel-tavern/town-blockout/starport-flight-site';

const stepSeconds = 0.1;
const stepMs = 100;
const aimByGate = [
  { along: 71, cross: 1, height: 373 },
  { along: 85, cross: 79, height: 380 },
  { along: -75, cross: 78, height: 378 },
  { along: -87, cross: -2, height: 371 },
] as const;
const landingAim = { along: 24, cross: 14 };

/** Repeat human keyboard states with a fixed clock. Every sampled point is the sim's actual result. */
function flyCloudDeckCircuit() {
  const { world } = createStarportReviewWorld();
  const { runway, assembly } = starportFlightSite;
  const loadout = assembleAircraftAtStarport({ snowWingClaimed: true, boosterOwned: true, aircraftAssembled: false },
    'starport-assembly-pad', { ...assembly, north: assembly.north - 1.18 }, assembly);
  assert.ok(loadout.ok && loadout.loadout.aircraftAssembled);
  const survey = surveyAircraftRunway(runway, world);
  assert.ok(survey.ok);
  const pad = { east: (runway.start.east + runway.end.east) / 2,
    north: (runway.start.north + runway.end.north) / 2, height: runway.start.height };
  const route = createCloudDeckCircuit(pad, survey.heading);
  const initialFuel = fuelSecondsPerStardustOre;
  assert.ok(Object.values(route.prepare({ assembled: loadout.loadout.aircraftAssembled,
    fuelSeconds: initialFuel, clearAirspace: survey.ok })).every(Boolean));
  const flight = createAircraftFlight(world, createFlightThrust(initialFuel));
  assert.ok(flight.launchRunway(loadout.loadout.aircraftAssembled, runway.start, runway));

  const directionEast = Math.sin(survey.heading);
  const directionNorth = Math.cos(survey.heading);
  const completedGates: { gate: number; elapsedMs: number; at: AircraftPoint; radiusM: number }[] = [];
  const keyRuns: { fromMs: number; toMs: number; throttle: AircraftThrottle; pitch: number; turn: number }[] = [];
  let turnRemainder = 0;
  let pitchRemainder = 0;
  let airborneSteps = 0;
  let liftoffMs: number | undefined;
  let touchdown: { elapsedMs: number; at: AircraftPoint; surface: string | null } | undefined;
  let maximumHeight = runway.start.height as number;
  let maximumStep = 0;

  for (let tick = 1; tick <= 650; tick++) {
    const previous = flight.snapshot()!;
    const currentGate = route.snapshot().nextGate;
    let throttle: AircraftThrottle = 'full';
    let pitch = 0;
    let turn = 0;
    if (previous.phase === 'airborne') {
      airborneSteps++;
      const target = aimByGate[currentGate];
      const aim = target ?? landingAim;
      const goalEast = pad.east + aim.along * directionEast + aim.cross * directionNorth;
      const goalNorth = pad.north + aim.along * directionNorth - aim.cross * directionEast;
      const error = Math.atan2(goalEast - previous.point.east, goalNorth - previous.point.north) - previous.heading;
      turnRemainder += Math.max(-1, Math.min(1, 1.5 * Math.atan2(Math.sin(error), Math.cos(error))));
      turn = Math.round(turnRemainder);
      turnRemainder -= turn;
      // Pulses map to W/S or A/D, with key-up for zero, rather than fractional axis input.
      if (airborneSteps < 60) pitchRemainder += .85;
      else {
        throttle = target && previous.point.height <= target.height ? 'cruise' : 'off';
        pitchRemainder += target ? .65 : -.6;
      }
      pitch = Math.round(pitchRemainder);
      pitchRemainder -= pitch;
    }
    const previousRun = keyRuns.at(-1);
    if (previousRun && previousRun.throttle === throttle && previousRun.pitch === pitch && previousRun.turn === turn) {
      previousRun.toMs = tick * stepMs;
    } else keyRuns.push({ fromMs: (tick - 1) * stepMs, toMs: tick * stepMs, throttle, pitch, turn });
    const current = flight.advance(stepSeconds, { throttle, pitch, turn })!;
    maximumHeight = Math.max(maximumHeight, current.point.height);
    maximumStep = Math.max(maximumStep, Math.hypot(current.point.east - previous.point.east, current.point.north - previous.point.north));
    assert.equal(current.damage, 0);
    assert.equal(current.recovery, null);
    if (current.phase === 'airborne') liftoffMs ??= tick * stepMs;
    if (current.phase === 'sliding') touchdown ??= { elapsedMs: tick * stepMs, at: current.point, surface: current.touchdown };
    const sample = route.update({ at: current.point, airborne: current.phase === 'airborne', elapsedMs: tick * stepMs });
    assert.notEqual(sample.stage, 'aborted');
    if (sample.nextGate > currentGate) {
      const gate = route.gates[currentGate]!;
      const side = (point: AircraftPoint) => (point.east - gate.at.east) * gate.forwardEast +
        (point.north - gate.at.north) * gate.forwardNorth;
      const before = side(previous.point), after = side(current.point);
      assert.ok(before < 0 && after >= 0);
      const fraction = -before / (after - before);
      const at = { east: previous.point.east + fraction * (current.point.east - previous.point.east),
        north: previous.point.north + fraction * (current.point.north - previous.point.north),
        height: previous.point.height + fraction * (current.point.height - previous.point.height) };
      const radiusM = Math.hypot(at.east - gate.at.east, at.north - gate.at.north, at.height - gate.at.height);
      assert.ok(radiusM <= 15);
      completedGates.push({ gate: sample.nextGate, elapsedMs: (tick - 1 + fraction) * stepMs, at, radiusM });
    }
    if (current.phase === 'landed') break;
  }
  const final = flight.snapshot()!;
  assert.ok(touchdown);
  assert.ok(maximumStep <= 4.000001, '100 ms reaches at most four horizontal metres, with no coordinate jumps');
  assert.deepEqual(completedGates.map(({ gate }) => gate), [1, 2, 3, 4]);
  assert.equal(liftoffMs, 10_000);
  assert.equal(final.rollMetres, 40);
  assert.equal(touchdown.elapsedMs, 56_900);
  assert.equal(touchdown.surface, 'snow');
  assert.equal(final.point.height, runway.start.height);
  assert.equal(final.phase, 'landed');
  assert.equal(final.usesBothHands, false);
  assert.deepEqual(route.snapshot(), { stage: 'complete', nextGate: 4, durationMs: 46_900 });
  for (const { east, north } of [touchdown.at, final.point]) {
    assert.ok(east >= Math.min(runway.start.east, runway.end.east) && east <= Math.max(runway.start.east, runway.end.east));
    assert.ok(Math.abs(north - runway.start.north) <= runway.width / 2);
  }
  return { launch: { elapsedMs: liftoffMs, metres: final.rollMetres, speed: 8 }, gates: completedGates,
    touchdown, fullStop: { at: final.point, elapsedMs: Math.round(final.elapsed * 1_000) }, result: route.snapshot(),
    horizontalMetres: final.metres, maximumHeight, maximumStep, fuelSpent: initialFuel - final.fuelSeconds, damage: final.damage,
    recovery: final.recovery, keyRuns };
}

test('F-9 flies four directional gates and lands on the original runway using only normal aircraft input', t => {
  const { keyRuns, ...result } = flyCloudDeckCircuit();
  t.diagnostic(JSON.stringify({ ...result, inputRuns: keyRuns.length }));
});
