import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindTownSnowButtons, createTownSnowControls } from '../tools/voxel-tavern/town-blockout/town-snow-controls.js';

function setup() {
  let now = 0;
  let amount = 48;
  let build = false;
  const actions: string[] = [];
  const flags = { playing: true, snowTarget: true, interact: true, buildAllowed: true };
  const controls = createTownSnowControls({
    now: () => now,
    canUseSnow: () => flags.playing,
    canGather: () => flags.snowTarget && amount < 50,
    gather() { amount++; actions.push('gather'); },
    canInteract: () => flags.interact,
    interact() { actions.push('interact'); },
    throwSnowball() { actions.push('throw'); },
    buildMode: () => build,
    setBuildMode(enabled) {
      if (!flags.buildAllowed) return false;
      build = enabled;
      actions.push(build ? 'mode-on' : 'mode-off');
      return true;
    },
    placeWall() { actions.push('place'); },
  });
  function advance(ms: number) {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) {
      const step = Math.min(10, ms - elapsed);
      now += step;
      controls.update(step / 1000);
    }
  }
  return { controls, advance, actions, flags, amount: () => amount };
}

class TestButton extends EventTarget {
  captured?: number;
  setPointerCapture(pointer: number) { this.captured = pointer; }
  pointer(type: string, pointerId: number, button = 0) {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId, button });
    this.dispatchEvent(event);
    return event;
  }
  click(detail: number) {
    this.dispatchEvent(Object.assign(new Event('click'), { detail }));
  }
}

test('desktop E tap preserves interaction, while left click and B select one independent action', () => {
  const { controls, advance, actions, flags } = setup();
  assert.equal(controls.keyDown('KeyE', false), true);
  advance(120);
  controls.keyUp('KeyE');
  controls.primary();
  controls.keyDown('KeyB', false);
  controls.keyDown('KeyB', true);
  flags.snowTarget = false;
  controls.primary();
  assert.deepEqual(actions, ['interact', 'throw', 'mode-on', 'place']);
  flags.playing = false;
  assert.equal(controls.primary(), false);
});

test('holding E only gathers, including in build mode, with no spillover at 50 or on release', () => {
  const { controls, advance, actions, amount, flags } = setup();
  controls.toggleBuild();
  controls.keyDown('KeyE', false);
  advance(2400);
  controls.keyDown('KeyE', true);
  assert.equal(controls.primary(), false);
  flags.snowTarget = false;
  advance(10);
  controls.keyUp('KeyE');
  assert.equal(amount(), 50);
  assert.equal(controls.gatherProgress(), undefined);
  assert.deepEqual(actions, ['mode-on', 'gather', 'gather']);
});

test('mobile snow button short-press fires or places once, while a long-press never does either', () => {
  const { controls, advance, actions } = setup();
  const snow = new TestButton();
  const build = new TestButton();
  const unbind = bindTownSnowButtons(controls, snow as unknown as HTMLButtonElement, build as unknown as HTMLButtonElement);
  assert.equal(snow.pointer('pointerdown', 1).defaultPrevented, true);
  assert.equal(snow.captured, 1);
  advance(80);
  snow.pointer('pointerup', 2);
  assert.deepEqual(actions, []);
  snow.pointer('pointerup', 1);
  snow.click(1);
  build.click(1);
  snow.pointer('pointerdown', 1);
  advance(100);
  snow.pointer('pointerup', 1);
  snow.click(1);
  snow.pointer('pointerdown', 1);
  advance(1250);
  snow.pointer('pointerup', 1);
  snow.click(1);
  snow.pointer('pointerdown', 1);
  snow.pointer('lostpointercapture', 1);
  snow.pointer('pointerup', 1);
  assert.deepEqual(actions, ['throw', 'mode-on', 'place', 'gather']);
  unbind();
  build.click(1);
  snow.click(0);
  assert.deepEqual(actions, ['throw', 'mode-on', 'place', 'gather']);
});

test('an unsuccessful long press still cannot fall through to a tap action', () => {
  const { controls, advance, actions, flags } = setup();
  flags.snowTarget = false;
  controls.keyDown('KeyE', false);
  advance(150);
  controls.keyUp('KeyE');
  controls.pressTouch(1);
  advance(150);
  controls.releaseTouch(1);
  controls.pressTouch(1);
  controls.cancel();
  controls.releaseTouch(1);
  assert.deepEqual(actions, []);
});
