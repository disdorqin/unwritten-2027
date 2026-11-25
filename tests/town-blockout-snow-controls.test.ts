import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnowballStock, snowResourceLimit } from '../src/shared/snow-stock.js';
import { mountTownMobileControls } from '../tools/voxel-tavern/town-blockout/town-mobile-controls.js';
import { createTownSnowControls, type SnowWallCell } from '../tools/voxel-tavern/town-blockout/town-snow-controls.js';

function setup(gatheringScale = 1) {
  let now = 0;
  const stock = createSnowballStock();
  for (let i = 0; i < 48; i++) stock.gather();
  const actions: string[] = [];
  const flags = { playing: true, snowTarget: true, interact: false, wallAllowed: true,
    wallTarget: undefined as SnowWallCell | undefined };
  const controls = createTownSnowControls({
    now: () => now,
    canUseSnow: () => flags.playing,
    canGather: () => flags.snowTarget && stock.amount() < snowResourceLimit,
    gather() { if (stock.gather()) actions.push('gather'); },
    gatheringScale: () => gatheringScale,
    canInteract: () => flags.interact,
    interact() { actions.push('interact'); },
    throwSnowball() { if (stock.spendThrow()) actions.push('throw'); },
    wallTarget: () => flags.wallTarget,
    placeWall(cell) {
      actions.push(`place:${cell.gx},${cell.gy}`);
      stock.reserveWall()?.(flags.wallAllowed);
    },
  });
  function advance(ms: number) {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) {
      const step = Math.min(10, ms - elapsed);
      now += step;
      controls.update(step / 1000);
    }
  }
  return { controls, advance, actions, flags, amount: stock.amount };
}

class TestButton extends EventTarget {
  hidden = true;
  textContent = '';
  captured?: number;
  private attributes = new Map<string, string>();
  constructor(readonly ownerDocument: EventTarget) { super(); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setPointerCapture(pointer: number) { this.captured = pointer; }
  hasPointerCapture(pointer: number) { return this.captured === pointer; }
  releasePointerCapture(pointer: number) { if (this.captured === pointer) this.captured = undefined; }
  pointer(type: string, pointerId: number, button = 0) {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId, button, pointerType: 'touch' });
    this.dispatchEvent(event);
    return event;
  }
  click(detail: number, pointerType = 'touch') {
    this.dispatchEvent(Object.assign(new Event('click'), { detail, pointerType }));
  }
}

function setupMobile() {
  const context = setup();
  const document = Object.assign(new EventTarget(), { hidden: false, defaultView: new EventTarget() });
  const action = new TestButton(document);
  const throwButton = new TestButton(document);
  const brakeButton = new TestButton(document);
  const direction = new TestButton(document);
  const jump = new TestButton(document);
  const sprint = new TestButton(document);
  const elements = { action, throwButton, brakeButton, direction, jump, sprint };
  const brakes: boolean[] = [];
  const mobile = mountTownMobileControls(context.controls,
    elements as unknown as Parameters<typeof mountTownMobileControls>[1], brake => brakes.push(brake));
  const pedestrian = { mobile: true, canMove: true, driving: false, canUseSnow: true };
  mobile.update(pedestrian);
  return { ...context, ...elements, brakes, mobile, document, pedestrian };
}

test('desktop E, aimed throws and ground placement share no persistent mode', () => {
  const { controls, advance, actions, flags, amount } = setup();
  flags.interact = true;
  assert.equal(controls.keyDown('KeyE', false), true);
  advance(120);
  controls.keyUp('KeyE');
  controls.primary();
  assert.equal(amount(), 47);
  assert.equal(controls.keyDown('KeyB', false), false);
  assert.equal(controls.keyDown('KeyB', true), false);
  flags.wallTarget = { gx: 2, gy: 3 };
  controls.primary();
  assert.equal(amount(), 44);
  flags.wallAllowed = false;
  assert.equal(controls.primary(), true);
  assert.equal(amount(), 44, 'a rejected wall must not spend stock or fire a snowball');
  assert.deepEqual(actions, ['interact', 'throw', 'place:2,3', 'place:2,3']);
  flags.playing = false;
  assert.equal(controls.primary(), false);
});

test('E held on snow only gathers up to 50 when aiming at a wall cell', () => {
  const { controls, advance, actions, amount, flags } = setup();
  flags.wallTarget = { gx: 2, gy: 3 };
  controls.keyDown('KeyE', false);
  advance(2400);
  controls.keyDown('KeyE', true);
  controls.keyUp('KeyE');
  assert.equal(amount(), 50);
  assert.equal(controls.gatherProgress(), undefined);
  assert.deepEqual(actions, ['gather', 'gather']);
});

test('whiteout speeds the shovel stroke while preserving the interaction hold threshold', () => {
  const { controls, advance, actions, amount } = setup(1.5);
  controls.keyDown('KeyE', false);
  advance(149);
  assert.equal(controls.gatherProgress(), undefined);
  advance(531);
  assert.equal(amount(), 48);
  advance(10);
  assert.equal(amount(), 49);
  controls.keyUp('KeyE');
  assert.deepEqual(actions, ['gather']);
});

test('emerging interaction targets block collection and clear an unfinished shovel stroke', () => {
  const { controls, advance, actions, flags } = setup();
  controls.keyDown('KeyE', false);
  advance(650);
  assert.ok(controls.gatherProgress());
  flags.interact = true;
  advance(600);
  assert.equal(controls.gatherProgress(), undefined);
  flags.interact = false;
  advance(500);
  controls.keyUp('KeyE');
  assert.deepEqual(actions, []);
});

test('a long or cancelled interaction press never also taps or throws', () => {
  const { controls, advance, actions, flags } = setup();
  flags.snowTarget = false;
  flags.interact = true;
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

test('mobile action button taps through the common world interaction and long-presses for unobstructed snow', () => {
  const { action, advance, actions, flags } = setupMobile();
  flags.interact = true;
  assert.equal(action.pointer('pointerdown', 1).defaultPrevented, true);
  assert.equal(action.captured, 1);
  advance(80);
  action.pointer('pointerup', 2);
  assert.deepEqual(actions, []);
  action.pointer('pointerup', 1);
  action.click(1);
  action.pointer('pointerdown', 1);
  advance(1000);
  action.pointer('pointerup', 1);
  action.click(1);
  assert.deepEqual(actions, ['interact']);
  flags.interact = false;
  action.pointer('pointerdown', 1);
  advance(1250);
  action.pointer('pointerup', 1);
  action.click(1);
  assert.deepEqual(actions, ['interact', 'gather']);
});

test('phone ground taps only place on a second tap of the same exact cell', () => {
  const { controls, actions, flags, amount } = setup();
  const first = { gx: 2, gy: 3 };
  controls.touchPrimary(first);
  assert.deepEqual(controls.touchWallPreview(), first);
  first.gx = 4;
  assert.deepEqual(controls.touchWallPreview(), { gx: 2, gy: 3 });
  controls.touchPrimary(first);
  assert.deepEqual(controls.touchWallPreview(), first);
  assert.equal(amount(), 48);
  assert.deepEqual(actions, []);
  controls.touchPrimary({ ...first });
  assert.equal(controls.touchWallPreview(), undefined);
  assert.equal(amount(), 45);
  assert.deepEqual(actions, ['place:4,3']);
  controls.touchPrimary(first);
  flags.playing = false;
  assert.equal(controls.touchWallPreview(), undefined);
  assert.equal(controls.touchPrimary(first), false);
  flags.playing = true;
  controls.touchPrimary(first);
  let touchThrows = 0;
  controls.touchPrimary(undefined, () => { touchThrows++; });
  assert.equal(controls.touchWallPreview(), undefined);
  assert.equal(touchThrows, 1);
  assert.deepEqual(actions, ['place:4,3']);
});

test('mobile throw button stays a throw, clears pending preview and does not start a hold', () => {
  const { controls, throwButton, advance, actions, mobile } = setupMobile();
  controls.touchPrimary({ gx: 4, gy: 3 });
  throwButton.pointer('pointerdown', 1);
  advance(1500);
  throwButton.pointer('pointerup', 1);
  assert.deepEqual(actions, []);
  throwButton.click(1);
  assert.equal(throwButton.textContent, '投雪球');
  assert.equal(controls.touchWallPreview(), undefined);
  assert.deepEqual(actions, ['throw']);
  mobile.dispose();
  throwButton.click(1);
  assert.deepEqual(actions, ['throw']);
});

test('driving exchanges the walking buttons for held brake and keeps the common dismount action', () => {
  const { controls, action, brakeButton, jump, sprint, throwButton, direction, advance,
    actions, brakes, flags, mobile, pedestrian } = setupMobile();
  controls.touchPrimary({ gx: 2, gy: 3 });
  flags.playing = false;
  flags.interact = true;
  mobile.update({ ...pedestrian, driving: true, canUseSnow: false, action: '下橇' });
  assert.equal(action.textContent, '下橇');
  assert.equal(action.hidden, false);
  assert.equal(direction.getAttribute('aria-label'), '驾驶摇杆');
  assert.ok([jump, sprint, throwButton].every(button => button.hidden));
  assert.equal(controls.touchWallPreview(), undefined);
  assert.equal(brakeButton.hidden, false);
  brakeButton.pointer('pointerdown', 7);
  brakeButton.pointer('pointerup', 8);
  assert.deepEqual(brakes, [true]);
  action.pointer('pointerdown', 1);
  advance(90);
  action.pointer('pointerup', 1);
  action.click(1);
  assert.deepEqual(actions, ['interact']);
  mobile.update(pedestrian);
  assert.deepEqual(brakes, [true, false]);
  assert.equal(brakeButton.hidden, true);
  assert.equal(direction.getAttribute('aria-label'), '移动摇杆');
});
