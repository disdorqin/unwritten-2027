import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler, PerspectiveCamera } from 'three';
import { createTavernDrinkEffects } from '../tools/voxel-tavern/town-blockout/tavern-drink-effects.ts';

test('drinks raise one capped visual level per empty cup, decay, and restore the hit-adjusted camera', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  function pass(milliseconds: number) {
    now += milliseconds;
    t.mock.timers.tick(milliseconds);
  }

  const drinks = createTavernDrinkEffects();
  const camera = new PerspectiveCamera(63) as unknown as Parameters<typeof drinks.apply>[0];
  const rollAtQuarterWave = (moving: boolean) => {
    drinks.apply(camera, 1080, moving);
    const roll = new Euler().setFromQuaternion(camera.quaternion, 'YXZ').z * 180 / Math.PI;
    drinks.restore(camera);
    return roll;
  };
  const assertAngle = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, String(actual));
  const finishes: number[] = [];

  for (const next of [1, 2, 3, 4]) {
    assert.equal(drinks.sip('#bc7e46', level => finishes.push(level)), true);
    assert.equal(drinks.isDrinking(), true);
    assert.equal(drinks.sip('#bc7e46', () => assert.fail('duplicate sip')), false);
    pass(479);
    assert.equal(drinks.isDrinking(), true);
    pass(1);
    assert.equal(drinks.isDrinking(), false);
    assert.equal(drinks.getLevel(), next);
    if (next === 1) assertAngle(rollAtQuarterWave(true), .4);
    if (next === 2 || next === 3) {
      assertAngle(rollAtQuarterWave(false), .9);
      assertAngle(rollAtQuarterWave(true), .9 * 1.5);
    }
    if (next === 4) assertAngle(rollAtQuarterWave(true), 1.3);
  }
  assert.deepEqual(finishes, [1, 2, 3, 4]);

  camera.rotateX(.042);
  camera.rotateY(-.031);
  const hitOrientation = camera.quaternion.clone();
  const projection = camera.projectionMatrix.clone();
  const breathNow = 4 * 480 + 11_150;
  drinks.apply(camera, breathNow, true);
  assert.ok(!camera.quaternion.equals(hitOrientation));
  assertAngle(camera.fov, 63.32);
  drinks.restore(camera);
  assert.ok(camera.quaternion.equals(hitOrientation));
  assert.ok(camera.projectionMatrix.equals(projection));
  assert.equal(camera.fov, 63);
  assert.equal(drinks.getLevel(), 4);

  drinks.apply(camera, breathNow, true, false);
  drinks.restore(camera);
  assert.ok(camera.quaternion.equals(hitOrientation));
  assert.equal(camera.fov, 63);

  drinks.setMotionEnabled(false);
  drinks.apply(camera, breathNow, true);
  drinks.restore(camera);
  assert.ok(camera.quaternion.equals(hitOrientation));
  assert.equal(camera.fov, 63);
  assert.equal(drinks.getLevel(), 4);
  drinks.setMotionEnabled(true);

  pass(45_480 - now);
  assert.equal(drinks.getLevel(), 3, 'the heavy tier ends after one 45-second unit');
  pass(45_000);
  assert.equal(drinks.getLevel(), 2);
  pass(5_000);
  drinks.setSoaking(true);
  pass(19_999);
  assert.equal(drinks.getLevel(), 2);
  pass(1);
  assert.equal(drinks.getLevel(), 1);
  drinks.setSoaking(false);
  pass(44_999);
  assert.equal(drinks.getLevel(), 1);
  pass(1);
  assert.equal(drinks.getLevel(), 0);
  drinks.apply(camera, now, true);
  drinks.restore(camera);
  assert.ok(camera.quaternion.equals(hitOrientation));
});

test('hot tea takes one visible level immediately, including after drinking above the heavy cap', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const drinks = createTavernDrinkEffects();
  assert.equal(drinks.drinkHot(), false);
  for (let cup = 0; cup < 6; cup++) {
    assert.equal(drinks.sip('#bc7e46', () => {}), true);
    now += 480;
    t.mock.timers.tick(480);
  }
  assert.equal(drinks.getLevel(), 4);
  assert.equal(drinks.drinkHot(), true);
  assert.equal(drinks.getLevel(), 3);
  for (const level of [2, 1, 0]) {
    assert.equal(drinks.drinkHot(), true);
    assert.equal(drinks.getLevel(), level);
  }
  assert.equal(drinks.drinkHot(), false);
});
