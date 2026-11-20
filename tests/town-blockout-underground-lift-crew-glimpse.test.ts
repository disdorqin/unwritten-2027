import assert from 'node:assert/strict';
import test from 'node:test';
import { mountUndergroundLiftCrewGlimpse } from '../tools/voxel-tavern/town-blockout/underground-lift-crew-glimpse.js';

function fixture() {
  const animations: { keyframes: Keyframe[]; timing: KeyframeAnimationOptions; cancelled: boolean }[] = [];
  const colors: string[] = [];
  const context = {
    fillStyle: '',
    fillRect() { colors.push(this.fillStyle); },
  };
  let reduce = false;
  class Element {
    readonly style: Record<string, string> = {};
    readonly children: Element[] = [];
    readonly attributes = new Map<string, string>();
    hidden = false;
    removed = false;
    get ownerDocument() { return ownerDocument; }
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    append(element: Element) { this.children.push(element); }
    remove() { this.removed = true; }
    getContext() { return context; }
    animate(keyframes: Keyframe[], timing: KeyframeAnimationOptions) {
      const record = { keyframes, timing, cancelled: false };
      animations.push(record);
      return { cancel() { record.cancelled = true; } };
    }
  }
  const ownerDocument = { createElement: () => new Element() };
  const parent = new Element();
  const mount = mountUndergroundLiftCrewGlimpse({
    parent: parent as unknown as HTMLElement,
    prefersReducedMotion: () => reduce,
  });
  return { mount, element: parent.children[0], animations, colors, reduce: () => { reduce = true; } };
}

const down = { tripId: 1, phase: 'blackout', direction: 'down', glimpseGranted: true } as const;

test('a granted, accepted descent paints one muted silent glimpse over true black', () => {
  const { mount, element, animations, colors } = fixture();
  assert.equal(element.hidden, true);
  mount.sync({ ...down, phase: 'travel' });
  assert.equal(element.hidden, true);
  assert.equal(mount.sync(down), true);
  assert.equal(element.hidden, false);
  assert.equal(element.style.backgroundColor, '#000');
  assert.equal(element.style.pointerEvents, 'none');
  assert.equal(element.attributes.get('aria-hidden'), 'true');
  assert.ok(colors.length > 20);
  assert.ok(colors.every(color => (color.match(/\w{2}/g) ?? []).every(part => parseInt(part, 16) <= 58)));

  mount.sync(down);
  assert.equal(animations.length, 1);
  assert.deepEqual(animations[0].keyframes.map(frame => frame.opacity), [0, .92, .92, 0]);
  assert.equal(animations[0].timing.duration, 740);
  assert.equal(mount.sync({ ...down, phase: 'travel' }), false);
  assert.equal(mount.sync({ ...down, phase: 'wake' }), true);
  assert.equal(element.hidden, true);
  assert.equal(animations[0].cancelled, true);
  assert.equal(mount.sync(down), false);
  assert.equal(animations.length, 1);
});

test('an ungranted descent, normal return, and old trip never reveal a face', () => {
  const { mount, element, animations } = fixture();
  assert.equal(mount.sync({ ...down, tripId: 0 }), false);
  mount.sync({ ...down, glimpseGranted: undefined });
  assert.equal(element.hidden, false);
  mount.sync(down);
  assert.equal(animations.length, 0);
  assert.equal(mount.sync({ ...down, tripId: 2, direction: 'up' }), true);
  assert.equal(element.hidden, true);
  assert.equal(mount.sync(down), false);
  assert.equal(animations.length, 0);
});

test('skip and reduced motion keep the approved blackout dark, and disposal removes it', () => {
  const { mount, element, animations, reduce } = fixture();
  mount.sync(down);
  mount.skip();
  mount.sync(down);
  assert.equal(animations.length, 1);
  assert.equal(animations[0].cancelled, true);
  assert.equal(element.hidden, false);
  reduce();
  mount.sync({ ...down, tripId: 2 });
  assert.equal(animations.length, 1);
  assert.equal(element.hidden, false);
  mount.dispose();
  mount.dispose();
  assert.equal(element.removed, true);
  assert.equal(element.hidden, true);
  assert.equal(mount.sync({ ...down, tripId: 3 }), false);
});
