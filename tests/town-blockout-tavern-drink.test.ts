import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import { Euler, PerspectiveCamera } from 'three';
import { createTavernDrinkEffects } from '../tools/voxel-tavern/town-blockout/tavern-drink-effects.ts';

function drinkClock(t: TestContext) {
  let time = 0;
  t.mock.method(performance, 'now', () => time);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return {
    now: () => time,
    pass(milliseconds: number) {
      time += milliseconds;
      t.mock.timers.tick(milliseconds);
    },
  };
}

function assertClose(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
}

test('camera sway reaches each degree target, preserves slow rhythm, and restores orientation and FOV', t => {
  const clock = drinkClock(t);
  const drinks = createTavernDrinkEffects();
  const camera = new PerspectiveCamera(63);
  const finishes: number[] = [];

  function axes(time: number, moving: boolean) {
    drinks.apply(camera, time, moving);
    const { y, z } = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    drinks.restore(camera);
    return { yaw: y * 180 / Math.PI, roll: z * 180 / Math.PI };
  }

  function measurePeaks(moving: boolean) {
    let yaw = 0;
    let roll = 0;
    for (let elapsed = 0; elapsed <= 10_000; elapsed += 5) {
      const frame = axes(480 + elapsed, moving);
      yaw = Math.max(yaw, Math.abs(frame.yaw));
      roll = Math.max(roll, Math.abs(frame.roll));
    }
    return { yaw, roll };
  }

  const peaks = [
    { still: [1.2, .35], moving: [1.2, .35] },
    { still: [2, .5], moving: [3, .75] },
    { still: [3.2, .8], moving: [3.2, .8] },
  ];
  for (const next of [1, 2, 3, 3]) {
    assert.equal(drinks.sip('#bc7e46', level => finishes.push(level)), true);
    assert.equal(drinks.isDrinking(), true);
    assert.equal(drinks.sip('#bc7e46', () => assert.fail('duplicate sip')), false);
    clock.pass(479);
    assert.equal(drinks.isDrinking(), true);
    clock.pass(1);
    assert.equal(drinks.isDrinking(), false);
    assert.equal(drinks.getLevel(), next);
    for (const moving of [false, true]) {
      const { yaw, roll } = measurePeaks(moving);
      const [targetRoll, targetYaw] = peaks[next - 1][moving ? 'moving' : 'still'];
      assertClose(roll, targetRoll, .001);
      assertClose(yaw, targetYaw, .001);
      assert.ok(roll <= 3.5 && yaw <= 3.5);
      assertClose(axes(1080, moving).roll, axes(3480, moving).roll);
      assertClose(axes(1080, moving).yaw, axes(1080 + 2400 / .62, moving).yaw);
    }
  }
  assert.deepEqual(finishes, [1, 2, 3, 3]);

  camera.rotateX(.042);
  camera.rotateY(-.031);
  const hitOrientation = camera.quaternion.clone();
  const projection = camera.projectionMatrix.clone();
  const firstBreathStart = 3 * 480 + 11_000;
  for (const offset of [-1, 0, 300, 10_999]) {
    drinks.apply(camera, firstBreathStart + offset, true);
    assertClose(camera.fov, 63);
    drinks.restore(camera);
  }
  for (const now of [firstBreathStart + 150, firstBreathStart + 11_150]) {
    drinks.apply(camera, now, true);
    assert.ok(!camera.quaternion.equals(hitOrientation));
    assertClose(camera.fov, 63.6);
    drinks.restore(camera);
    assert.ok(camera.quaternion.equals(hitOrientation));
    assert.ok(camera.projectionMatrix.equals(projection));
    assert.equal(camera.fov, 63);
  }

  const breathPeak = firstBreathStart + 150;
  drinks.apply(camera, breathPeak, true, false);
  assert.ok(camera.quaternion.equals(hitOrientation));
  assert.equal(camera.fov, 63);
  drinks.apply(camera, breathPeak, true, true, true);
  assert.ok(camera.quaternion.equals(hitOrientation));
  assert.equal(camera.fov, 63);

  drinks.apply(camera, breathPeak, true);
  drinks.setMotionEnabled(false);
  assert.ok(camera.quaternion.equals(hitOrientation));
  assert.equal(camera.fov, 63);
  drinks.apply(camera, breathPeak, true);
  assert.ok(camera.quaternion.equals(hitOrientation));
  assert.equal(camera.fov, 63);
  assert.equal(drinks.getLevel(), 3);

  clock.pass(60_480 - clock.now());
  assert.equal(drinks.getLevel(), 3, 'level remains 3 when the fourth unit wears off');
  clock.pass(60_000);
  assert.equal(drinks.getLevel(), 2);
  clock.pass(5_000);
  drinks.setSoaking(true);
  clock.pass(27_499);
  assert.equal(drinks.getLevel(), 2);
  clock.pass(1);
  assert.equal(drinks.getLevel(), 1);
  drinks.setSoaking(false);
  clock.pass(59_999);
  assert.equal(drinks.getLevel(), 1);
  clock.pass(1);
  assert.equal(drinks.getLevel(), 0);
});

test('three units clear after three minutes normally and in half the time at the hot spring', t => {
  const clock = drinkClock(t);
  for (const soaking of [false, true]) {
    const drinks = createTavernDrinkEffects();
    for (const expected of [1, 2, 3]) {
      assert.ok(drinks.sip('#bc7e46', level => assert.equal(level, expected)));
      clock.pass(480);
    }
    assert.equal(drinks.getLevel(), 3);
    drinks.setSoaking(soaking);
    const afterThirdCup = soaking ? 89_520 : 179_040;
    clock.pass(afterThirdCup - 1);
    assert.equal(drinks.getLevel(), 1);
    clock.pass(1);
    assert.equal(drinks.getLevel(), 0);
  }
});

test('reduced motion disables camera motion by default and honors an explicitly enabled preference', t => {
  const clock = drinkClock(t);
  const motionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let setting: string | null = null;
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem(key: string) { assert.equal(key, 'unwritten:tavern-dizziness:v1'); return setting; } },
  });
  t.after(() => {
    if (motionDescriptor) Object.defineProperty(globalThis, 'matchMedia', motionDescriptor);
    else Reflect.deleteProperty(globalThis, 'matchMedia');
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const camera = new PerspectiveCamera(58);
  const base = camera.quaternion.clone();
  const defaults = createTavernDrinkEffects();
  assert.ok(defaults.sip('#efb86f', () => {}));
  clock.pass(480);
  defaults.apply(camera, clock.now() + 600, true);
  assert.ok(camera.quaternion.equals(base));

  setting = 'on';
  const explicit = createTavernDrinkEffects();
  assert.ok(explicit.sip('#efb86f', () => {}));
  clock.pass(480);
  explicit.apply(camera, clock.now() + 600, true);
  assert.ok(!camera.quaternion.equals(base));
  explicit.restore(camera);
  assert.ok(camera.quaternion.equals(base));
});

test('vignette levels apply with or without camera motion and reduced motion disables CSS animation', () => {
  const css = readFileSync(new URL('../tools/voxel-tavern/town-blockout/tavern-drink-effects.css', import.meta.url), 'utf8');
  assert.match(css, /\.tavern-drink-vignette\[data-level="1"\]\s*\{\s*opacity:\s*\.30\b/);
  assert.match(css, /\.tavern-drink-vignette\[data-level="2"\]\s*\{\s*opacity:\s*\.60\b/);
  assert.match(css, /\.tavern-drink-vignette\[data-level="3"\]\s*\{\s*opacity:\s*\.85\b/);
  assert.doesNotMatch(css, /\.tavern-drink-vignette[^\n{]+\[data-still=/);
  const reduced = css.split('@media (prefers-reduced-motion: reduce)')[1];
  assert.match(reduced, /\.tavern-drink-vignette\s*\{\s*transition:\s*none\b/);
  assert.match(reduced, /\.tavern-drink-cup\s*\{\s*animation:\s*none\b/);
});
