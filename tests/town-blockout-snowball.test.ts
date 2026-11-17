import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  createTownSnowballFight, snowballSegmentBox, type SnowballEvent,
} from '../tools/voxel-tavern/town-blockout/town-snowball.ts';

const { Scene, Vector3 } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as typeof import('three');

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
      if (target !== undefined) return { at: from.clone().lerp(to, target), kind: 'target', targetId: 'snowman' };
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
  assert.ok(Math.abs(impact.at.y - (2 - 7 * (impact.at.x / 19.5) ** 2)) < .001);

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
