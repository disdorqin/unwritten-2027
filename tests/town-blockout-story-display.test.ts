import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTownStoryDisplay,
  mountTownStoryControl,
  townStoryDisplayKey,
  townStoryModes,
  type TownStoryMode,
} from '../tools/voxel-tavern/town-blockout/town-story-display';

function localStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(townStoryDisplayKey, initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

test('fresh and invalid local preferences use 探索, while a valid preference survives reopening', () => {
  const storage = localStorage('unknown');
  const display = createTownStoryDisplay(storage);
  assert.equal(createTownStoryDisplay(localStorage()).mode(), 'explore');
  assert.equal(display.mode(), 'explore');
  assert.equal(display.setMode('story'), 'story');
  assert.equal(display.setMode('invalid'), 'story');
  assert.equal(createTownStoryDisplay(storage).mode(), 'story');
});

test('choice updates synchronously even if storage access and writes throw', () => {
  const display = createTownStoryDisplay({
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage read only'); },
  });
  const seen: TownStoryMode[] = [];
  const unsubscribe = display.subscribe(mode => seen.push(mode));
  display.setMode('guest');
  display.setMode('guest');
  display.setMode('story');
  assert.deepEqual(seen, ['explore', 'guest', 'story']);
  unsubscribe();
  display.setMode('explore');
  assert.doesNotThrow(() => unsubscribe());
  assert.deepEqual(seen, ['explore', 'guest', 'story']);
});

test('allowed soul and clue intensity increases through all three choices without revealing a denied effect', () => {
  const display = createTownStoryDisplay(localStorage());
  const allowed = townStoryModes.map(mode => {
    display.setMode(mode.value);
    assert.equal(display.strength(false), 0);
    return display.strength(true);
  });
  assert.deepEqual(allowed, [.3, .65, 1]);
});

test('authorized atlas lines are silently forwarded in every mode and private lines never reach the sink', () => {
  const display = createTownStoryDisplay(localStorage());
  const lines: string[] = [];
  for (const { value } of townStoryModes) {
    display.setMode(value);
    assert.equal(display.appendAtlasLine(false, () => lines.push('private')), false);
    assert.equal(display.appendAtlasLine(true, () => lines.push(value)), true);
  }
  assert.deepEqual(lines, ['guest', 'explore', 'story']);
});

type Option = { value: string; textContent: string };
class Select extends EventTarget {
  options: Option[] = [];
  readonly attributes = new Map<string, string>();
  readonly ownerDocument = {
    createElement: (tag: string): Option => {
      assert.equal(tag, 'option');
      return { value: '', textContent: '' };
    },
  };
  value = '';
  replaceChildren(...options: Option[]) { this.options = options; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}

test('the mounted select lists three native choices, follows programmatic changes and removes its binding cleanly', () => {
  const storage = localStorage('guest');
  const display = createTownStoryDisplay(storage);
  const select = new Select();
  const unmount = mountTownStoryControl(select as unknown as HTMLSelectElement, display);
  assert.deepEqual(select.options.map(option => option.textContent), ['游客', '探索', '故事']);
  assert.equal(select.attributes.get('aria-label'), '故事显示模式');
  assert.equal(select.value, 'guest');
  select.value = 'story';
  select.dispatchEvent(new Event('change'));
  assert.equal(display.mode(), 'story');
  assert.equal(storage.getItem(townStoryDisplayKey), 'story');
  display.setMode('explore');
  assert.equal(select.value, 'explore');
  unmount();
  select.value = 'guest';
  select.dispatchEvent(new Event('change'));
  assert.equal(display.mode(), 'explore');
  display.setMode('story');
  assert.equal(select.value, 'guest');
});
