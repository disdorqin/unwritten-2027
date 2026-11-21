import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstancedMesh, LineSegments, Scene, Vector3 } from 'three';
import { createTownSnowballFight, snowballRange } from '../tools/voxel-tavern/town-blockout/town-snowball.ts';
import { townSnowballWindAcceleration } from '../tools/voxel-tavern/town-blockout/town-snowball-wind.ts';
import type { TownOutdoorWeatherState } from '../src/shared/town-outdoor-weather.ts';

const weather = (weather: TownOutdoorWeatherState['weather']): TownOutdoorWeatherState => ({
  weather, startedAt: 1000, nextChangeAt: 2000, windEast: 0, windNorth: 1, windStrength: 1,
});

test('wind leaf has no drift in clear weather, and obeys exposure and server wind direction', () => {
  assert.deepEqual(townSnowballWindAcceleration(weather('clear-snow'), 'front-mountain'), { east: 0, north: 0 });
  const exposed = townSnowballWindAcceleration(weather('wind'), 'front-mountain');
  const sheltered = townSnowballWindAcceleration(weather('wind'), 'plaza');
  assert.ok(exposed.north > sheltered.north && sheltered.north > 0);
  assert.equal(exposed.east, 0);
  assert.equal(exposed.north, 1.6);
  const west = townSnowballWindAcceleration({ ...weather('whiteout'), windEast: -1, windNorth: 0 }, 'plaza');
  assert.ok(Math.abs(west.east + .64) < 1e-12);
  assert.equal(west.north, 0);
});

test('G-09 crosswind curves the released ball toward its visible aiming marker', () => {
  const scene = new Scene();
  const origin = new Vector3(0, 1.8, 0);
  const direction = new Vector3(1, 0, 0);
  const wind = townSnowballWindAcceleration(weather('wind'), 'front-mountain');
  const events: { type: string; at?: Vector3 }[] = [];
  let distance = 0;
  const fight = createTownSnowballFight({
    scene, windAtLaunch: () => wind, onEvent: event => events.push(event),
    sweep(from, to) { distance += from.distanceTo(to); return undefined; },
  });
  fight.showAim(origin, direction, 1);
  const marker = scene.getObjectByName('Town snowball aim marker') as LineSegments;
  const predicted = marker.position.clone();
  assert.ok(predicted.z > 0.6, `wind should curve the trajectory north, got ${predicted.z}`);
  distance = 0; // Ignore aim-preview probes; measure only the launched projectile.
  assert.ok(fight.gather());
  assert.ok(fight.throwBall(origin, direction, 'local', 1));
  for (let i = 0; i < 175; i++) fight.update(1 / 60);
  const actual = events.find(event => event.type === 'miss')?.at;
  assert.ok(actual);
  assert.ok(actual.distanceTo(predicted) < .02, `predicted ${predicted.toArray()} vs actual ${actual.toArray()}`);
  assert.ok(distance <= snowballRange + .02, `wind must not extend normal shot reach: ${distance}`);
  const mesh = scene.getObjectByName('Town snowball projectiles') as InstancedMesh;
  assert.equal(mesh.count, 0);
  fight.dispose();
});

test('weather is snapshotted per projectile; later weather updates do not steer an in-flight shot', () => {
  const scene = new Scene();
  let wind = { east: 0, north: 1.2 };
  const shots: Vector3[] = [];
  const fight = createTownSnowballFight({
    scene, windAtLaunch: () => wind,
    sweep(from, to) { shots.push(to.clone()); return undefined; },
  });
  assert.ok(fight.throwNpc(new Vector3(0, 1, 0), new Vector3(1, 0, 0), 'npc', 1));
  fight.update(1 / 60);
  wind = { east: 0, north: -1.2 };
  for (let i = 0; i < 30; i++) fight.update(1 / 60);
  assert.ok(shots.at(-1)!.z > 0);
  fight.dispose();
});
