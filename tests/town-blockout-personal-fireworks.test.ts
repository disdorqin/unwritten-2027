import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Points, Scene } from 'three';
import { createFestival } from '../tools/voxel-tavern/town-blockout/festival.ts';
import {
  createPersonalFireworkInventory, hangingFireworkGround, nearestPersonalFireworks, samplePersonalFirework,
  type PersonalFirework, type PersonalFireworkArea,
} from '../tools/voxel-tavern/town-blockout/personal-fireworks.ts';

test('test-period claim is capped at ten and all named indoor contexts reject use', () => {
  const inventory = createPersonalFireworkInventory();
  assert.equal(inventory.claim('sparkler', 5), 5);
  assert.equal(inventory.claim('rocket', 3), 3);
  assert.equal(inventory.claim('string', 9), 2);
  const restricted: PersonalFireworkArea[] = ['house', 'tavern', 'memorial', 'pool', 'train', 'palace-room'];
  for (const area of restricted) assert.equal(inventory.use('sparkler', area, 0), 'indoors');
  assert.deepEqual(inventory.stock(), { sparkler: 5, rocket: 3, string: 2 });
  assert.equal(inventory.use('sparkler', 'open', 0), 'fired');
  assert.equal(inventory.use('rocket', 'open', 1_999), 'cooldown');
  assert.equal(inventory.use('rocket', 'open', 2_000), 'fired');
  assert.equal(inventory.use('string', 'open', 5_999, true), 'cooldown');
  assert.equal(inventory.use('string', 'open', 6_000, true), 'fired');
});

test('stock and cooldown survive reload and corrupted stock is discarded', () => {
  let saved: unknown;
  const inventory = createPersonalFireworkInventory(undefined, stock => { saved = stock; });
  const timestamp = Date.now();
  inventory.claim('sparkler', 3);
  inventory.claim('rocket', 5);
  assert.equal(inventory.use('sparkler', 'open', timestamp), 'fired');
  const restored = createPersonalFireworkInventory(saved);
  assert.deepEqual(restored.stock(), { sparkler: 2, rocket: 5, string: 0 });
  assert.equal(restored.use('rocket', 'open', timestamp + 1_999), 'cooldown');
  assert.equal(restored.use('rocket', 'open', timestamp + 2_000), 'fired');
  assert.equal(createPersonalFireworkInventory({ stock: { sparkler: 11, rocket: 0, string: 0 } }).total(), 0);
  assert.equal(createPersonalFireworkInventory({ stock: { sparkler: -1, rocket: 0, string: 0 } }).total(), 0);
});

test('seeded personal effects replay, are capped, and use the shared festival Points', () => {
  const point = { x: 0, y: 12, z: 0 };
  const rocket: PersonalFirework = { ...point, at: 0, kind: 'rocket', owner: 1, seed: 987, yaw: 0 };
  const string = { ...rocket, kind: 'string' } as const;
  const sparkler = { ...rocket, kind: 'sparkler' } as const;
  assert.deepEqual(hangingFireworkGround(point, 0, () => 12), { x: 0, y: 12, z: -1.2 });
  assert.equal(samplePersonalFirework(rocket, 1_200)[0].y, 37);
  assert.deepEqual(samplePersonalFirework(rocket, 1_375), samplePersonalFirework(rocket, 1_375));
  assert.equal(samplePersonalFirework(string, 1_999).length, 1);
  assert.equal(samplePersonalFirework(string, 2_000).length, 16);
  assert.equal(samplePersonalFirework(string, 5_000).length, 0);
  assert.equal(samplePersonalFirework(sparkler, 20_000).length, 0);
  const hand = samplePersonalFirework(sparkler, 0, { x: 100, y: 13, z: 1 });
  assert.ok(hand.every(p => Math.abs(p.x - 100) <= .46));
  const sorted = nearestPersonalFireworks(Array.from({ length: 10 }, (_, owner) => ({ ...string, owner, x: 10 - owner })), point, 3_000);
  assert.deepEqual(sorted.map(effect => effect.owner), [9, 8, 7, 6, 5, 4, 3, 2]);

  const scene = new Scene();
  const festival = createFestival(scene);
  const cloud = scene.getObjectByName('广场烟花') as Points | undefined;
  assert.ok(cloud?.isPoints);
  festival.setPersonalFireworkFrame(samplePersonalFirework(rocket, 1_300));
  festival.update(1 / 60);
  assert.equal(cloud.geometry.drawRange.count, 16);
  assert.equal(cloud.visible, true);
  festival.setPersonalFireworkFrame([]);
  festival.update(1 / 60);
  assert.equal(cloud.geometry.drawRange.count, 0);
  assert.equal(cloud.visible, false);
});
