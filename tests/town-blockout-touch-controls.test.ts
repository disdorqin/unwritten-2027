import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTouchLook } from '../tools/voxel-tavern/town-blockout/touch-look.ts';
import {
  touchLookBoost, touchLookDelta,
} from '../tools/voxel-tavern/town-blockout/touch-look-curve.ts';
import { createTouchWalk } from '../tools/voxel-tavern/town-blockout/touch-walk.ts';

type Handler = (event: never) => void;

class FakeEmitter {
  private handlers = new Map<string, Set<Handler>>();
  addEventListener(type: string, handler: Handler) {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, set = new Set());
    set.add(handler);
  }
  emit(type: string, event: unknown = {}) {
    for (const handler of this.handlers.get(type) ?? []) {
      (handler as (event: unknown) => void)(event);
    }
  }
}

class FakeCanvas extends FakeEmitter {
  rect = { left: 0, top: 0, width: 1000, height: 400 };
  getBoundingClientRect() { return this.rect; }
  hasPointerCapture() { return false; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

function touchEvent(pointerId: number, clientX: number, clientY: number, timeStamp: number) {
  return { pointerType: 'touch', pointerId, clientX, clientY, timeStamp, preventDefault() {} };
}

function lookFixture(sensitivity: () => number, hold?: {
  delay: number; start(): void; finish(milliseconds: number): boolean; cancel(): void;
}) {
  const canvas = new FakeCanvas();
  const turns: { yaw: number; pitch: number }[] = [];
  createTouchLook(canvas as unknown as HTMLCanvasElement, () => true,
    (yaw, pitch) => turns.push({ yaw, pitch }), () => 0, hold, sensitivity);
  return { canvas, turns, totalYaw: () => turns.reduce((sum, turn) => sum + turn.yaw, 0) };
}

test('touch look boost grows with drag speed and sensitivity scales linearly', () => {
  assert.equal(touchLookBoost(0), 1);
  assert.ok(touchLookBoost(2000) > touchLookBoost(200));
  assert.ok(touchLookBoost(2000) < 1.9);
  const slow = touchLookDelta(60, 0, 360, 16, 1.4);
  const doubled = touchLookDelta(60, 0, 360, 16, 2.8);
  assert.ok(Math.abs(doubled.yaw - slow.yaw * 2) < 1e-9);
  const fast = touchLookDelta(60, 0, 360, 16, 1.4);
  const creeping = touchLookDelta(60, 0, 360, 600, 1.4);
  assert.ok(fast.yaw > creeping.yaw);
});

test('a fast right-half swipe turns far more than the raw drag angle', () => {
  const { canvas, totalYaw } = lookFixture(() => 1.4);
  canvas.emit('pointerdown', touchEvent(1, 800, 200, 0));
  canvas.emit('pointermove', touchEvent(1, 860, 200, 16));
  canvas.emit('pointermove', touchEvent(1, 920, 200, 32));
  // Raw angular sum for 120 px at focal ~361 is ~0.33 rad; boosted it must exceed 0.6.
  assert.ok(totalYaw() > .6, `expected a boosted turn, got ${totalYaw()}`);
});

test('a slow right-half drag stays close to the base sensitivity', () => {
  const { canvas, totalYaw } = lookFixture(() => 1.4);
  canvas.emit('pointerdown', touchEvent(1, 800, 200, 0));
  for (let i = 1; i <= 12; i++) {
    canvas.emit('pointermove', touchEvent(1, 800 + i * 10, 200, i * 100));
  }
  const fast = lookFixture(() => 1.4);
  fast.canvas.emit('pointerdown', touchEvent(1, 800, 200, 0));
  fast.canvas.emit('pointermove', touchEvent(1, 860, 200, 16));
  fast.canvas.emit('pointermove', touchEvent(1, 920, 200, 32));
  assert.ok(totalYaw() > .33 && totalYaw() < fast.totalYaw());
});

test('drags starting outside the right-half look zone never turn the view', () => {
  const { canvas, turns } = lookFixture(() => 1.4);
  canvas.emit('pointerdown', touchEvent(1, 200, 200, 0));
  canvas.emit('pointermove', touchEvent(1, 260, 200, 16));
  canvas.emit('pointermove', touchEvent(1, 320, 200, 32));
  canvas.emit('pointerup', touchEvent(1, 320, 200, 48));
  assert.equal(turns.length, 0);
});

test('tap turns toward the tap only inside the look zone', () => {
  const inside = lookFixture(() => 1.4);
  inside.canvas.emit('pointerdown', touchEvent(1, 800, 200, 0));
  inside.canvas.emit('pointerup', touchEvent(1, 800, 200, 100));
  assert.equal(inside.turns.length, 1);
  assert.ok(inside.turns[0].yaw > 0);
  const outside = lookFixture(() => 1.4);
  outside.canvas.emit('pointerdown', touchEvent(1, 200, 200, 0));
  outside.canvas.emit('pointerup', touchEvent(1, 200, 200, 100));
  assert.equal(outside.turns.length, 0);
});

test('the snowball hold survives the look zone: quick swipe cancels, held drag aims', () => {
  let starts = 0;
  let cancels = 0;
  const finishes: number[] = [];
  const hold = {
    delay: 150,
    start() { starts++; },
    finish(milliseconds: number) { finishes.push(milliseconds); return milliseconds >= 150; },
    cancel() { cancels++; },
  };
  const swipe = lookFixture(() => 1.4, hold);
  swipe.canvas.emit('pointerdown', touchEvent(1, 800, 200, 0));
  assert.equal(starts, 1);
  swipe.canvas.emit('pointermove', touchEvent(1, 860, 200, 50));
  assert.equal(cancels, 1);
  assert.ok(swipe.turns.length > 0);

  const aim = lookFixture(() => 1.4, hold);
  aim.canvas.emit('pointerdown', touchEvent(2, 800, 200, 0));
  aim.canvas.emit('pointermove', touchEvent(2, 830, 200, 200));
  assert.equal(cancels, 1, 'a drag after the hold delay must aim, not cancel');
  assert.ok(aim.turns.length > 0, 'held drag still steers the aim');
  aim.canvas.emit('pointerup', touchEvent(2, 830, 200, 400));
  assert.deepEqual(finishes, [400]);
});

test('a left-half hold still finishes the snowball action without steering', () => {
  let cancels = 0;
  const finishes: number[] = [];
  const hold = {
    delay: 150,
    start() {},
    finish(milliseconds: number) { finishes.push(milliseconds); return true; },
    cancel() { cancels++; },
  };
  const fixture = lookFixture(() => 1.4, hold);
  fixture.canvas.emit('pointerdown', touchEvent(1, 200, 200, 0));
  fixture.canvas.emit('pointermove', touchEvent(1, 260, 200, 50));
  assert.equal(cancels, 1, 'a quick left-half drag still cancels the hold');
  assert.equal(fixture.turns.length, 0);
  fixture.canvas.emit('pointerup', touchEvent(1, 260, 200, 60));

  const still = lookFixture(() => 1.4, hold);
  still.canvas.emit('pointerdown', touchEvent(1, 200, 200, 0));
  still.canvas.emit('pointerup', touchEvent(1, 200, 200, 400));
  assert.deepEqual(finishes, [400], 'holding still on the left half scoops and throws');
  assert.equal(still.turns.length, 0);
});

class FakePad extends FakeEmitter {
  hidden = false;
  firstElementChild = { style: { transform: '' } };
  hasPointerCapture() { return false; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

class FakeButton extends FakeEmitter {
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = {
    toggle: (name: string, force?: boolean) => {
      if (force) this.classes.add(name); else this.classes.delete(name);
    },
  };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  setPointerCapture() {}
}

function walkFixture() {
  Object.assign(globalThis, {
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    document: {
      body: { classList: { toggle() {} } },
      addEventListener() {},
    },
    window: { addEventListener() {} },
  });
  const pad = new FakePad();
  const button = new FakeButton();
  const walk = createTouchWalk(pad as unknown as HTMLElement, button as unknown as HTMLButtonElement);
  walk.setAllowed(true);
  const stick = (dy: number, timeStamp: number, start = false) => {
    if (start) pad.emit('pointerdown', { pointerId: 7, button: 0, clientX: 100, clientY: 300, timeStamp, preventDefault() {} });
    pad.emit('pointermove', { pointerId: 7, clientX: 100, clientY: 300 + dy, timeStamp, preventDefault() {} });
  };
  return { pad, button, walk, stick };
}

test('the joystick double-push sprint gesture still works', () => {
  const { pad, walk, stick } = walkFixture();
  stick(-40, 1010, true);
  pad.emit('pointerup', { pointerId: 7, timeStamp: 1100 });
  stick(-40, 1210, true);
  assert.equal(walk.sprinting, true);
  pad.emit('pointerup', { pointerId: 7, timeStamp: 1300 });
  assert.equal(walk.sprinting, false);
});

test('a tapped sprint button locks sprint while the stick is pushed', () => {
  const { button, walk, stick } = walkFixture();
  button.emit('pointerdown', { pointerId: 9, timeStamp: 0, preventDefault() {} });
  button.emit('pointerup', { pointerId: 9, timeStamp: 100, preventDefault() {} });
  assert.equal(walk.sprintLocked, true);
  assert.equal(button.attributes.get('aria-pressed'), 'true');
  assert.ok(button.classes.has('sprint-locked'));
  stick(-20, 200, true);
  assert.ok(walk.axes.forward > .3);
  assert.equal(walk.sprinting, true, 'locked sprint survives without the double-push gesture');
  button.emit('pointerdown', { pointerId: 9, timeStamp: 1000, preventDefault() {} });
  button.emit('pointerup', { pointerId: 9, timeStamp: 1100, preventDefault() {} });
  assert.equal(walk.sprintLocked, false);
  assert.equal(walk.sprinting, false);
});

test('a held sprint button is momentary and never toggles the lock', async () => {
  const { button, walk, stick } = walkFixture();
  button.emit('pointerdown', { pointerId: 9, timeStamp: 0, preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 360));
  stick(-20, 500, true);
  assert.equal(walk.sprinting, true, 'holding the sprint button sprints');
  button.emit('pointerup', { pointerId: 9, timeStamp: 600, preventDefault() {} });
  assert.equal(walk.sprinting, false);
  assert.equal(walk.sprintLocked, false);
});

test('reset clears the sprint lock', () => {
  const { button, walk } = walkFixture();
  button.emit('pointerdown', { pointerId: 9, timeStamp: 0, preventDefault() {} });
  button.emit('pointerup', { pointerId: 9, timeStamp: 100, preventDefault() {} });
  assert.equal(walk.sprintLocked, true);
  walk.reset();
  assert.equal(walk.sprintLocked, false);
  assert.equal(button.attributes.get('aria-pressed'), 'false');
});
