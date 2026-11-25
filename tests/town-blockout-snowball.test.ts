import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  createTownSnowballFight, snowballGravity, snowballRange, snowballSegmentBox, snowballSpeed, type SnowballEvent,
} from '../tools/voxel-tavern/town-blockout/town-snowball.ts';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world.ts';

const { Scene, Vector3 } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as typeof import('three');

test('remote replay uses the victim capsule and does not score on local simulation', () => {
  const scene = new Scene();
  const origin = new Vector3(0, 1.65, 0);
  const direction = new Vector3(1, 0, 0);
  const local = { id: 'local', label: '你', x: 4, y: 0, z: 0, radius: .27, height: 1.78, onHit() {} };
  const remote = { ...local, id: 'p:9', label: '小镇邻居', z: 2 };
  const cell = { colliders: [], floors: [] };
  const sweep = createSnowballSweep({
    geometryAt: () => cell, surfaceHeight: () => 0, occupiedAt: () => false, targets: [local],
  });
  const events: SnowballEvent[] = [];
  const outgoing: number[] = [];
  const game = createTownSnowballFight({
    scene,
    sweep: (from, to, radius, thrower, source) => sweep(from, to, radius, thrower, source === 'player' ? [remote] : []),
    relayPlayerThrow(ballId) { outgoing.push(ballId); return true; },
    onEvent: event => events.push(event),
  });
  assert.ok(game.throwRemote(origin, direction, 'p:9', 48));
  assert.equal(game.throwRemote(origin, direction, 'p:9', 48), false);
  for (let i = 0; i < 25; i++) game.update(1 / 60);
  const received = events.find(event => event.type === 'impact');
  assert.ok(received?.type === 'impact');
  assert.equal(received.targetId, 'local');
  assert.equal(received.zone, 'head');
  assert.equal(received.ballId, 48);
  assert.equal(received.scored, false);
  assert.deepEqual(game.getState(), { ammo: 0, hits: 0, combo: 0 });

  assert.ok(game.gather());
  origin.z = 2;
  assert.ok(game.throwBall(origin, direction, 'local', 1));
  for (let i = 0; i < 25; i++) game.update(1 / 60);
  const predicted = events.at(-1);
  assert.ok(predicted?.type === 'impact');
  assert.equal(predicted.targetId, 'p:9');
  assert.equal(predicted.relayed, true);
  assert.equal(predicted.scored, false);
  assert.deepEqual(outgoing, [predicted.ballId]);
  assert.equal(game.getState().hits, 0);
  game.confirmPlayerHit();
  assert.deepEqual(game.getState(), { ammo: 0, hits: 1, combo: 1 });
  game.dispose();
});

test('remote replay caps eight balls per shooter, shares the pool, and clears on session loss', () => {
  const scene = new Scene();
  const origin = new Vector3(3, 2, 3);
  const direction = new Vector3(1, 0, 0);
  const game = createTownSnowballFight({ scene, sweep: () => undefined });
  for (let id = 0; id < 8; id++) assert.ok(game.throwRemote(origin, direction, 'p:10', id));
  assert.equal(game.throwRemote(origin, direction, 'p:10', 8), false);
  assert.ok(game.gather());
  assert.ok(game.throwBall(origin, direction, 'local', 1));
  assert.ok(game.throwRemote(origin, direction, 'p:11', 8));
  const projectiles = scene.getObjectByName('Town snowball projectiles') as import('three').InstancedMesh;
  game.update(1 / 60);
  assert.equal(projectiles.count, 10);
  game.clearRemote();
  game.update(1 / 60);
  assert.equal(projectiles.count, 1);
  assert.ok(game.throwRemote(origin, direction, 'p:10', 0));
  game.dispose();
});

test('snowball sweep intersects thin geometry and misses outside expanded bounds', () => {
  const from = new Vector3(0, 1, 0);
  const to = new Vector3(6, 1, 0);
  assert.equal(snowballSegmentBox(from, to, [3, 0, -.02], [3.01, 2, .02], 0), .5);
  assert.equal(snowballSegmentBox(from, to, [3, 0, .25], [3.01, 2, .5], .12), undefined);
  assert.equal(snowballSegmentBox(to, from, [5.95, 0, -.1], [6.04, 2, .1], .12), 0);
});

test('snowball carries launch and landing metadata, builds a combo, and stops behind a wall', () => {
  const scene = new Scene();
  const origin = new Vector3(0, 2, 0);
  const direction = new Vector3(1, 0, 0);
  const events: SnowballEvent[] = [];
  let wall = false;
  const game = createTownSnowballFight({
    scene, now: () => 1760000000000, onEvent: event => events.push(event),
    sweep(from, to, radius) {
      const target = snowballSegmentBox(from, to, [5, 0, -.3], [5.5, 2, .3], radius);
      const blocked = wall ? snowballSegmentBox(from, to, [3, 0, -.35], [3.01, 2.5, .35], radius) : undefined;
      if (blocked !== undefined && (target === undefined || blocked < target)) {
        return { at: from.clone().lerp(to, blocked), kind: 'world' };
      }
      if (target !== undefined) return { at: from.clone().lerp(to, target), kind: 'target', targetId: 'snowman', zone: 'head' };
    },
  });
  const step = (n: number) => { for (let i = 0; i < n; i++) game.update(1 / 60); };
  const sparkMesh = scene.getObjectByName('Town snowball impacts');
  assert.ok(sparkMesh && !sparkMesh.visible);
  assert.equal(game.throwBall(origin, direction), false);
  for (let i = 0; i < 10; i++) assert.ok(game.gather());
  assert.equal(game.gather(), false);
  assert.equal(game.throwBall(origin, new Vector3()), false);
  assert.equal(game.getState().ammo, 10);

  assert.ok(game.throwBall(origin, direction, 'guest'));
  assert.equal(game.throwBall(origin, direction, 'guest'), false);
  step(20);
  assert.ok(sparkMesh.visible);
  assert.deepEqual(game.getState(), { ammo: 9, hits: 1, combo: 1 });
  const [launch, impact] = events;
  assert.equal(launch.type, 'throw');
  assert.equal(impact.type, 'impact');
  assert.equal(impact.id, launch.id);
  assert.equal(impact.thrower, 'guest');
  assert.equal(impact.time, 1760000000000);
  assert.equal(impact.targetId, 'snowman');
  assert.equal(impact.zone, 'head');
  assert.equal(launch.from, 'guest');
  assert.equal(launch.t, 1760000000000);
  assert.equal(launch.dir.x, 1);
  assert.equal(impact.by, 'guest');
  assert.equal(impact.streak, 1);
  assert.equal(impact.scored, true);
  assert.ok(Math.abs(impact.at.y - (2 - .5 * snowballGravity * (impact.at.x / 19.5) ** 2)) < .001);

  assert.ok(game.throwBall(origin, direction));
  step(20);
  assert.equal(game.getState().combo, 2);
  wall = true;
  assert.ok(game.throwBall(origin, direction));
  step(20);
  assert.deepEqual(game.getState(), { ammo: 7, hits: 2, combo: 0 });
  const last = events.at(-1);
  assert.ok(last?.type === 'impact' && last.kind === 'world' && last.at.x < 3);
  step(65);
  assert.equal(sparkMesh.visible, false);
  game.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(game.gather(), false);
});

test('fixed-power aim ring marks the same wall, terrain and person contacts as the released ball', () => {
  const origin = new Vector3(0, 1.6, 0);
  const direction = new Vector3(1, 0, 0);
  for (const situation of ['wall', 'terrain', 'person'] as const) {
    const scene = new Scene();
    const events: SnowballEvent[] = [];
    const colliders = situation === 'wall' ? [{ min: [5, 0, -1], max: [5.02, 2.4, 1] }] : [];
    const cell = { colliders, floors: [] };
    const sweep = createSnowballSweep({
        geometryAt: () => cell,
        surfaceHeight: () => 0,
        occupiedAt: () => false,
        targets: situation === 'person' ? [{
          id: 'npc', label: 'NPC', x: 10, y: 0, z: 0, radius: .32, height: 1.8, onHit() {},
        }] : [],
    });
    const game = createTownSnowballFight({
      scene, onEvent: event => events.push(event),
      sweep: (from, to, radius, thrower) => sweep(from, to, radius, thrower),
    });
    const line = scene.getObjectByName('Town snowball aim') as import('three').Line;
    const marker = scene.getObjectByName('Town snowball aim marker') as
      import('three').LineSegments<import('three').BufferGeometry, import('three').LineBasicMaterial>;
    game.showAim(origin, direction, 1);
    assert.ok(line.visible && marker.visible);
    assert.ok(line.geometry.drawRange.count >= 24);
    assert.equal(marker.material.color.getHex(), situation === 'person' ? 0xffce89 : 0xd3eaff);
    const predicted = marker.position.clone();
    const positions = line.geometry.attributes.position;
    const endpoint = new Vector3().fromBufferAttribute(positions, line.geometry.drawRange.count - 1);
    assert.ok(predicted.distanceTo(endpoint) < .00001);
    if (situation === 'wall') assert.ok(Math.abs(predicted.x - 4.885) < 1e-9);
    if (situation === 'terrain') assert.ok(Math.abs(predicted.y - .115) < 1e-9);

    assert.ok(game.gather());
    assert.ok(game.throwBall(origin, direction, 'local', 1));
    assert.ok(!line.visible && !marker.visible);
    for (let i = 0; i < 120; i++) game.update(1 / 60);
    const [throwEvent, impact] = events;
    assert.equal(throwEvent.velocity.length(), 26);
    assert.ok(impact?.type === 'impact');
    assert.equal(impact.kind, situation === 'person' ? 'target' : 'world');
    assert.equal(impact.zone, situation === 'person' ? 'torso' : undefined);
    assert.ok(predicted.distanceTo(impact.at) <= .5);
    game.dispose();
  }
});

test('snowball speed remains bounded and every flight expires by the range limit', () => {
  const scene = new Scene();
  assert.equal(snowballSpeed(0), 12);
  assert.equal(snowballSpeed(1), 26);
  for (const direction of [new Vector3(0, -1, 0), new Vector3(1, .5, 0), new Vector3(0, 1, 0)]) {
    let distance = 0;
    const events: SnowballEvent[] = [];
    const range = createTownSnowballFight({
      scene, onEvent: event => events.push(event),
      sweep(from, to) { distance += from.distanceTo(to); return undefined; },
    });
    assert.ok(range.throwNpc(new Vector3(), direction, 'npc', 1));
    for (let i = 0; i < 180; i++) range.update(1 / 60);
    assert.ok(distance <= snowballRange);
    if (direction.y < 0 || direction.x !== 0) assert.ok(distance >= snowballRange - .01);
    assert.deepEqual(events.map(event => event.type), ['throw', 'miss']);
    assert.ok(events[1].scoreable && events[1].shotBy === 'npc');
    range.dispose();
  }
});

test('snowball pool retires oldest projectile and limits catch-up work to two ticks', () => {
  const scene = new Scene();
  const visited = new Set<string>();
  let sweeps = 0;
  const game = createTownSnowballFight({
    scene, sweep(_from, _to, _radius, thrower) { visited.add(thrower); sweeps++; return undefined; },
  });
  const origin = new Vector3();
  const direction = new Vector3(1, 0, 0);
  for (let i = 0; i < 65; i++) assert.ok(game.throwNpc(origin, direction, 'npc-' + i, 1));
  const elapsed = game.update(9);
  assert.ok(Number.isFinite(elapsed) && elapsed >= 0);
  assert.equal(sweeps, 2 * 64);
  assert.ok(!visited.has('npc-0') && visited.has('npc-64'));
  const projectiles = scene.getObjectByName('Town snowball projectiles') as import('three').InstancedMesh;
  assert.equal(projectiles.count, 64);
  assert.equal(game.getState().ammo, 0);
  game.dispose();
});

test('snow depths cap ammo and indoor impacts keep player and NPC scores unchanged', () => {
  const scene = new Scene();
  const events: SnowballEvent[] = [];
  const from = new Vector3(0, 1.7, 0);
  const direction = new Vector3(1, 0, 0);
  let launchOutdoors = false;
  let targetOutdoors = true;
  const game = createTownSnowballFight({
    scene, canScoreAtLaunch: () => launchOutdoors, onEvent: event => events.push(event),
    sweep(_from, to, _radius, thrower) {
      return { at: to, kind: 'target', targetId: thrower === 'npc' ? 'local-player' : 'snowman', score: targetOutdoors };
    },
  });
  const step = () => { for (let i = 0; i < 16; i++) game.update(1 / 60); };
  assert.ok(game.gather(3) && game.gather(4) && game.gather(5));
  assert.equal(game.getState().ammo, 10);
  assert.ok(game.throwBall(from, direction, 'local', 0));
  step();
  assert.equal(game.getState().hits, 0);
  launchOutdoors = true;
  targetOutdoors = false;
  assert.ok(game.throwBall(from, direction, 'local', 0));
  step();
  assert.equal(game.getState().hits, 0);
  targetOutdoors = true;
  assert.ok(game.throwBall(from, direction, 'local', 1));
  step();
  assert.equal(game.getState().combo, 1);
  launchOutdoors = false;
  assert.ok(game.throwBall(from, direction, 'local', 0));
  step();
  assert.ok(events.at(-1)?.scoreable === false);
  assert.equal(game.getState().combo, 1);
  launchOutdoors = true;
  targetOutdoors = false;
  assert.ok(game.throwNpc(from, direction, 'npc', 1));
  step();
  assert.ok(events.at(-1)?.scoreable === false);
  assert.equal(game.getState().combo, 1);
  targetOutdoors = true;
  assert.ok(game.throwNpc(from, direction, 'npc', 1));
  step();
  assert.deepEqual(game.getState(), { ammo: 6, hits: 1, combo: 0 });
  const last = events.at(-1);
  assert.ok(last?.type === 'impact' && last.shotBy === 'npc' && last.scored && last.target === 'local-player');
  game.dispose();
});
