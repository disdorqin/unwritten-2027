import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import {
  snowPracticeStand, snowPracticeTarget, type TownSnowballTarget,
} from '../tools/voxel-tavern/town-blockout/town-snow-target.ts';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world.ts';

const { Vector3 } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as typeof import('three');

function capsule(id: string, x: number): TownSnowballTarget {
  return { id, label: id, x, y: 0, z: 0, radius: .3, height: 1.8, onHit() {} };
}

function sweepAgainst(targets: TownSnowballTarget[], colliders: Box[] = []) {
  const cell = { colliders, floors: [] };
  return createSnowballSweep({
    targets, geometryAt: () => cell, occupiedAt: () => false, surfaceHeight: () => -10,
    scoreAt: target => target.id !== 'near',
  });
}

test('sweep finds the nearest capsule, skips the thrower and reports score eligibility', () => {
  const sweep = sweepAgainst([capsule('far', 6), capsule('near', 4), capsule('local', 0)]);
  const hit = sweep(new Vector3(0, .5, 0), new Vector3(8, .5, 0), .1, 'local');
  assert.equal(hit?.kind, 'target');
  assert.equal(hit.targetId, 'near');
  assert.equal(hit.score, false);
  assert.ok(Math.abs(hit.at.x - 3.6) < 1e-9);

  const top = sweep(new Vector3(4, 3, 0), new Vector3(4, .4, 0), .1);
  assert.equal(top?.targetId, 'near');
  assert.ok(Math.abs(top.at.y - 1.9) < 1e-9);
});

test('sweep stops at a thin wall before a capsule and avoids false box-corner hits', () => {
  const target = capsule('npc', 4);
  const sweep = sweepAgainst([target], [{ min: [3, 0, -.6], max: [3.01, 2, .6] }]);
  const hit = sweep(new Vector3(0, 1.1, 0), new Vector3(8, 1.1, 0), .1);
  assert.equal(hit?.kind, 'world');
  assert.ok(Math.abs(hit.at.x - 2.9) < 1e-9);

  const unobstructed = sweepAgainst([target]);
  assert.equal(unobstructed(new Vector3(0, 1.85, .36), new Vector3(7, 1.85, .36), .1), undefined);
});

test('chest-height grazes receive a small bonus only with a clear path to the torso', () => {
  const target = capsule('npc', 4);
  const from = new Vector3(0, 1.12, .44);
  const to = new Vector3(7, 1.12, .44);
  const open = sweepAgainst([target]);
  assert.equal(open(from, to, .1)?.targetId, 'npc');
  const lowFrom = from.clone().setY(.45);
  const lowTo = to.clone().setY(.45);
  assert.equal(open(lowFrom, lowTo, .1), undefined);

  const behindCover = sweepAgainst([target], [{ min: [3.6, 0, .2], max: [4.4, 2, .25] }]);
  assert.equal(behindCover(from, to, .1), undefined);
});

test('the practice marker stands ten meters from the snowman', () => {
  assert.equal(Math.hypot(snowPracticeStand[0] - snowPracticeTarget[0], snowPracticeStand[1] - snowPracticeTarget[1]), 10);
});
