import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Vector3 } from 'three';
import { createFlightThrust } from '../src/shared/flight-thrust.ts';
import {
  aircraftAirspaceAt, aircraftChapterGateOpen, aircraftFlightSpec, assembleAircraftAtStarport, createAircraftFlight,
  surveyAircraftRunway, type AircraftRunway, type AircraftSurface, type AircraftWorld,
} from '../src/shared/aircraft-flight.ts';
import { resolveOrbitalGateTravel } from '../src/presence/orbital-gates.ts';
import {
  createStarportReviewWorld, mountStarportFlightSite, starportFlightSite, townFlightRunwayCandidates,
} from '../tools/voxel-tavern/town-blockout/starport-flight-site.ts';

const dock = starportFlightSite.assembly;
const owned = { snowWingClaimed: true, boosterOwned: true, aircraftAssembled: false };
const flatNorth = { east: 0, north: 0, height: 0 };
const ramp: AircraftRunway = { id: 'fixture', start: flatNorth, end: { ...flatNorth, north: 42 }, width: 4.4 };
const snow: AircraftSurface = { kind: 'snow', height: 0, slopeDegrees: 0, obstacleAhead: 0 };
const surfaceWorld: AircraftWorld = { contains: () => true, surfaceAt: () => snow, sweep: () => undefined,
  recoveryAt: () => flatNorth };

test('F-3 mounts the exact two F-7 sockets and assembles once at the reached starport table', () => {
  const { craft, dispose } = mountStarportFlightSite(new Group());
  const snowWing = craft.getObjectByName('snow-wing')!;
  const booster = craft.getObjectByName('flight-booster')!;
  const bay = snowWing.getObjectByName('mount:boosterBay')!.getWorldPosition(new Vector3());
  const socket = booster.getObjectByName('mount:wingSocket')!.getWorldPosition(new Vector3());
  assert.ok(bay.distanceTo(socket) < 1e-9);
  assert.deepEqual(assembleAircraftAtStarport(owned, 'summit-lodge', dock, dock), { ok: false, reason: 'wrong-station' });
  assert.deepEqual(assembleAircraftAtStarport(owned, 'starport-assembly-pad', { ...dock, height: 344 }, dock),
    { ok: false, reason: 'out-of-reach' });
  assert.deepEqual(assembleAircraftAtStarport({ ...owned, boosterOwned: false }, 'starport-assembly-pad', dock, dock),
    { ok: false, reason: 'missing-equipment' });
  assert.deepEqual(assembleAircraftAtStarport({ ...owned, snowWingClaimed: false }, 'starport-assembly-pad', dock, dock),
    { ok: false, reason: 'missing-equipment' });
  const result = assembleAircraftAtStarport(owned, 'starport-assembly-pad', { ...dock, north: dock.north - 1.15 }, dock);
  assert.ok(result.ok && result.changed && result.loadout.aircraftAssembled);
  assert.deepEqual(assembleAircraftAtStarport(result.loadout, 'starport-assembly-pad', dock, dock),
    { ok: true, loadout: result.loadout, changed: false });
  assert.equal(owned.aircraftAssembled, false);
  dispose();
});

test('F-3 keeps both S-1 doors locked at the current chapter and clamps the ceiling', () => {
  for (const gate of ['starport', 'core'] as const) {
    assert.deepEqual(resolveOrbitalGateTravel({ gate, direction: 'enter' }, { site: gate, pose: { ...dock, yaw: 0 } }, {
      isOpen: () => aircraftChapterGateOpen, isAtOpening: () => true,
      landingAt: () => { throw new Error('The current chapter must not query the destination.'); },
      isLegalLanding: () => false,
    }), { ok: false, reason: 'locked' });
  }
  assert.deepEqual([379, 380, 560, 561, 1_000].map(aircraftAirspaceAt),
    ['below-clouds', 'cloud-belt', 'cloud-belt', 'above-clouds', 'ceiling']);
  const edge = { ...flatNorth, height: 999.7 };
  const highWorld = { ...surfaceWorld, surfaceAt: (_east: number, north: number) =>
    north < .1 ? { ...snow, height: edge.height } : snow };
  // The host may supply a positive vertical impulse at the boundary.
  const power = createFlightThrust(60);
  const flight = createAircraftFlight(highWorld, { ...power, step: (seconds, request, height) =>
    ({ ...power.step(seconds, request, height), liftMetres: 20 * seconds }) });
  assert.ok(flight.launchEdge(true, edge, 0));
  assert.equal(flight.snapshot()?.point.height, aircraftFlightSpec.ceiling);
  const reading = flight.advance(1, { throttle: 'full' })!;
  assert.equal(reading.point.height, aircraftFlightSpec.ceiling);
  assert.ok(reading.ceilingReached);
});

const { world } = createStarportReviewWorld();

test('F-4 checks the four candidate strips, the verge, and actually swept collision', () => {
  const strips = [starportFlightSite.runway, ...townFlightRunwayCandidates];
  const surveys = strips.map(strip => surveyAircraftRunway(strip, world));
  assert.deepEqual(surveys.map(survey => Number(survey.length.toFixed(3))), [42.5, 64, 56, 49.439]);
  assert.ok(surveys.every(survey => survey.ok && survey.checkedMetres === survey.length));
  assert.equal(surveyAircraftRunway({ ...ramp, end: { ...ramp.end, north: 39.99 } }, surfaceWorld).ok, false);
  assert.equal(surveyAircraftRunway({ ...ramp, width: 3.8 }, surfaceWorld).ok, false);
  assert.equal(surveyAircraftRunway(ramp, { ...surfaceWorld, sweep: (_from, to) => to.north > 17 ? 'wall' : undefined }).ok, false);
  assert.equal(surveyAircraftRunway(ramp, { ...surfaceWorld, surfaceAt: east =>
    east > 1.9 ? { ...snow, obstacleAhead: 1.1 } : snow }).ok, false);
});

test('F-4 runway takes ten seconds and forty metres to lift; real sampled terrain leads to an ice landing', () => {
  const flight = createAircraftFlight(world, createFlightThrust(600));
  const runway = starportFlightSite.runway;
  assert.equal(flight.launchRunway(false, runway.start, runway), false);
  assert.equal(flight.launchRunway(true, { ...runway.start, height: 349 }, runway), false);
  const flat = createAircraftFlight(surfaceWorld, createFlightThrust(600));
  assert.equal(flat.launchEdge(true, flatNorth, 0), false, 'no vertical or flat-ground takeoff');
  assert.ok(flight.launchRunway(true, runway.start, runway));
  const sites = [[330, 425], [350, 170], [380, 70], [352, 86], [320, 75], [325, 55], [358, 47]] as const;
  let goal = 0;
  let reachedCloud = false;
  const phases: string[] = [];
  let firstAir: ReturnType<typeof flight.snapshot>;
  for (let tick = 0; tick < 3_000; tick++) {
    const before = flight.snapshot()!;
    const [east, north] = sites[goal === 0 ? 0 : 1 + (goal - 1) % (sites.length - 1)]!;
    const de = east - before.point.east, dn = north - before.point.north;
    if (Math.hypot(de, dn) < 18) goal++;
    const error = Math.atan2(de, dn) - before.heading;
    const turn = Math.max(-1, Math.min(1, Math.atan2(Math.sin(error), Math.cos(error)) * 1.8));
    const after = flight.advance(.1, { throttle: tick < 445 ? 'full' : 'off', turn })!;
    if (phases.at(-1) !== after.phase) phases.push(after.phase);
    if (after.phase === 'airborne') firstAir ??= after;
    reachedCloud ||= after.airspace === 'cloud-belt';
    assert.equal(after.damage, 0);
    assert.ok(after.speed <= aircraftFlightSpec.levelSpeedLimit);
    if (after.phase === 'landed') break;
  }
  assert.deepEqual(phases, ['rolling', 'airborne', 'sliding', 'landed']);
  assert.equal(firstAir?.rollMetres, 40);
  assert.equal(firstAir?.speed, 8);
  assert.ok(Math.abs(firstAir!.elapsed - 10) < 1e-7);
  assert.ok(reachedCloud);
  const landing = flight.snapshot()!;
  assert.equal(landing.touchdown, 'ice');
  assert.equal(landing.point.height, 5.5);
  assert.equal(landing.recovery, null);
  assert.equal(landing.usesBothHands, false);
});

test('F-4 settles wall and late runway failures in at most three seconds without loss', () => {
  let blocked = false;
  const feet = { ...flatNorth, height: 20 };
  const ledgeWorld = { ...surfaceWorld, surfaceAt: (_east: number, north: number) =>
    north < .1 ? { ...snow, height: 20 } : snow,
  sweep: () => blocked ? 'wall' as const : undefined };
  const flight = createAircraftFlight(ledgeWorld, createFlightThrust(60));
  assert.ok(flight.launchEdge(true, feet, 0));
  blocked = true;
  assert.equal(flight.advance(.5)?.phase, 'recovering');
  assert.equal(flight.snapshot()?.recovery, 'wall');
  for (let step = 0; step < 3; step++) flight.advance(1);
  assert.equal(flight.snapshot()?.phase, 'landed');
  assert.equal(flight.snapshot()?.damage, 0);
  blocked = false;
  const lateWorld = { ...surfaceWorld, sweep: () => blocked ? 'wall' as const : undefined };
  const retry = createAircraftFlight(lateWorld, createFlightThrust(60));
  assert.ok(retry.launchRunway(true, ramp.start, ramp));
  blocked = true;
  assert.equal(retry.advance(.1, { throttle: 'full' })?.recovery, 'runway-blocked');
  assert.ok(retry.skipRecovery());
  assert.equal(retry.snapshot()?.phase, 'landed');
});
