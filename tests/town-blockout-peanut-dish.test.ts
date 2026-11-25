import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import {
  createPeanutDish, mountPeanutDish, PEANUT_DISH_PICKUP_ID, PEANUT_DISH_SERVING,
} from '../tools/voxel-tavern/town-blockout/tavern-peanut-dish.ts';

test('peanut dish builds with its pickup contract for ZB-22 / ZB-25', () => {
  const dish = createPeanutDish();
  assert.equal(dish.name, 'tavern-peanut-dish');
  assert.ok(dish.children.length >= 10);
  assert.equal(dish.userData.pickup.id, PEANUT_DISH_PICKUP_ID);
  assert.equal(dish.userData.pickup.serving, PEANUT_DISH_SERVING);
  assert.equal(dish.userData.pickup.feedsMascot, true);
  const parent = new Group();
  const mounted = mountPeanutDish(parent, { x: 1, y: 1.1, z: -2 }, 0.5);
  assert.equal(parent.children.length, 1);
  assert.equal(mounted.pickupId, PEANUT_DISH_PICKUP_ID);
  mounted.dispose();
  assert.equal(parent.children.length, 0);
});
