import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { addStageBackstage, stageBackstage } from '../tools/voxel-tavern/town-blockout/stage-backstage.ts';

test('stage wing has a walk-through doorway and solid enclosed sides', () => {
  const colliders: Box[] = [];
  const size: Box[] = [];
  addStageBackstage((_color, x, y, z, width, height, depth) => {
    size.push({ min: [x - width / 2, y - height / 2, z - depth / 2],
      max: [x + width / 2, y + height / 2, z + depth / 2] });
  }, colliders);

  const { west, east, front, back, deck, entrance, inside } = stageBackstage;
  assert.ok(size.length > 40);
  assert.ok(size.every(({ min, max }) =>
    min[0] > 6 && max[0] < 9 && min[2] > 3 && max[2] < 7 && min[1] >= deck - .001));
  const blocks = (x: number, z: number, feet: number = deck) => colliders.some(({ min, max }) => {
    const distanceX = Math.max(min[0] - x, 0, x - max[0]);
    const distanceZ = Math.max(min[2] - z, 0, z - max[2]);
    return Math.hypot(distanceX, distanceZ) < .27 && feet + .025 < max[1] && feet + 1.8 - .025 > min[1];
  });

  const approach = 4.85;
  const count = Math.ceil((inside.x - approach) / .05);
  for (let i = 0; i <= count; i++) {
    const x = approach + (inside.x - approach) * i / count;
    assert.equal(blocks(x, inside.z), false);
  }
  assert.equal(blocks(west, entrance.front - .15), true);
  assert.equal(blocks(west, entrance.back + .15), true);
  assert.equal(blocks(west, inside.z, entrance.head - 1.5), true);
  assert.equal(blocks(inside.x, front), true);
  assert.equal(blocks(east, inside.z), true);
  assert.equal(blocks(inside.x, back), true);
});
