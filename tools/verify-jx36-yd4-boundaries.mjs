import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const candidate = resolve(process.argv[2] ?? '.');
const district = resolve(candidate, 'tools/voxel-tavern/town-blockout');
const file = name => resolve(district, name);
const read = name => readFileSync(file(name), 'utf8');
const load = name => import(pathToFileURL(file(name)).href);
const hash = name => createHash('sha256').update(readFileSync(file(name))).digest('hex');

const entry = read('town-entry.ts');
const viewer = read('viewer.ts');
const desktop = read('desktop-look.ts');
assert.match(entry, /await import\('\.\/viewer'\)/);
assert.doesNotMatch(entry, /\b(?:requestPointerLock|pointerlockerror)\b/);
assert.match(viewer, /onLockFailed\(reason\)\s*\{\s*lockFailure = reason;\s*refreshLockHint\(\);/);
assert.match(desktop, /addEventListener\('pointerlockerror', \(\) => fail\('error'\)\)/);

const { createZodiacProgress } = await load('town-zodiac.ts');
function storage() {
  const data = new Map();
  return { getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { data.set(key, value); } };
}
const originalStore = storage();
const originalProgress = createZodiacProgress(['mouse'], originalStore);
assert.equal(originalProgress.collect('mouse', new Date(2026, 10, 20, 12)), true);

function element() {
  let focus = 0;
  let select = 0;
  const listeners = new Map();
  return {
    hidden: true,
    textContent: '',
    value: '',
    get focused() { return focus > 0; },
    get selected() { return select > 0; },
    focus() { focus++; },
    select() { select++; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    press() { return listeners.get('click')?.(); },
  };
}

const ids = [
  'town-entry', 'town-entry-loading', 'town-entry-guide', 'town-entry-error', 'town-entry-copy',
  'town-entry-continue', 'town-entry-retry', 'town-entry-copy-status', 'town-entry-link',
  'env-banner', 'env-banner-message', 'env-banner-dismiss',
];
const elements = Object.fromEntries(ids.map(id => [id, element()]));
const currentUrl = 'https://example.test/town-blockout.html?entry=yd4%2Fprobe#browser';
let clipboard;
let rejectClipboard = false;
const globals = {
  location: { href: currentUrl },
  document: {
    getElementById(id) { return elements[id]; },
    querySelector(selector) { return elements[selector.slice(1)]; },
  },
  navigator: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile MicroMessenger/8.0.50',
    maxTouchPoints: 5,
    clipboard: {
      async writeText(value) {
        if (rejectClipboard) throw new Error('Clipboard write rejected by fixture');
        clipboard = value;
      },
    },
  },
};

const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  await load('town-entry.ts');
  assert.equal(elements['town-entry-guide'].hidden, false);
  assert.equal(elements['town-entry-continue'].hidden, false);
  const copy = elements['town-entry-copy'];
  const link = elements['town-entry-link'];
  await copy.press();
  assert.equal(clipboard, currentUrl);
  assert.equal(link.hidden, true);
  rejectClipboard = true;
  await copy.press();
  assert.equal(link.hidden, false);
  assert.equal(link.value, currentUrl);
  assert.equal(link.focused, true);
  assert.equal(link.selected, true);
  assert.equal(elements['town-entry-guide'].hidden, false);

  const reopenedInSameStore = createZodiacProgress(['mouse'], originalStore).count();
  const reopenedInFreshStore = createZodiacProgress(['mouse'], storage()).count();
  assert.equal(reopenedInSameStore, 1);
  assert.equal(reopenedInFreshStore, 0);
  console.log(JSON.stringify({
    sha256: Object.fromEntries(['town-entry.ts', 'viewer.ts', 'desktop-look.ts', 'town-zodiac.ts'].map(name => [name, hash(name)])),
    nodeDocumentFixture: { guideVisibleBeforeContinue: true, clipboard, manualSelection: link.value },
    storageFixture: { reopenedInSameStore, reopenedInFreshStore },
    sourceWiring: { pointerLockFailureInViewer: true, pointerLockFailureHandlerInEntry: false },
  }, null, 2));
} finally {
  for (const [key, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
