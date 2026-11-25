import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createTownEntry, isMobileChatBrowser } from '../tools/voxel-tavern/town-blockout/town-entry';

test('the entry guide identifies mobile WeChat and message-app QQ', () => {
  assert.equal(isMobileChatBrowser('Mozilla/5.0 (Linux; Android 14) Mobile MicroMessenger/8.0.50'), true);
  assert.equal(isMobileChatBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) Mobile QQ/9.0.90'), true);
  assert.equal(isMobileChatBrowser('Mozilla/5.0 (Macintosh) AppleWebKit MicroMessenger/8.0.50', 5), true);
  assert.equal(isMobileChatBrowser('Mozilla/5.0 (Windows NT 10.0) MicroMessenger/3.9.10'), false);
  assert.equal(isMobileChatBrowser('Mozilla/5.0 (Linux; Android 14) MQQBrowser/14.7 Mobile'), false);
  assert.equal(isMobileChatBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/135.0.0.0 Mobile'), false);
});

test('a mobile guide defers loading until continue and ignores repeated starts', async () => {
  const states: string[] = [];
  let loads = 0;
  const enter = createTownEntry(true, async () => { loads++; }, state => states.push(state));
  await Promise.resolve();
  assert.deepEqual(states, ['guide']);
  assert.equal(loads, 0);
  const load = enter();
  assert.equal(enter(), load);
  await load;
  assert.deepEqual(states, ['guide', 'loading', 'ready']);
  assert.equal(loads, 1);
});

test('the normal browser opens directly and initialization failure never reveals the scene', async () => {
  const states: string[] = [];
  const open = createTownEntry(false, async () => { throw new Error('WebGL unavailable'); }, state => states.push(state));
  assert.deepEqual(states, ['loading']);
  await open();
  assert.deepEqual(states, ['loading', 'failed']);
});

test('a fresh document can enter after the previous viewer load failed', async () => {
  const states: string[] = [];
  const fail = createTownEntry(false, async () => { throw new Error('Viewer module unavailable'); }, state => states.push(state));
  await fail();
  const retry = createTownEntry(false, async () => {}, state => states.push(state));
  await retry();
  assert.deepEqual(states, ['loading', 'failed', 'loading', 'ready']);
});

test('a failed module request displays the static retry before any module can run', () => {
  const html = readFileSync(new URL('../tools/voxel-tavern/town-blockout.html', import.meta.url), 'utf8');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code);
  class ScriptElement { type = 'module'; }
  const loading = { hidden: false };
  const error = { hidden: true };
  const retry = { hidden: true };
  const elements: Record<string, { hidden: boolean }> = {
    'town-entry-loading': loading, 'town-entry-error': error, 'town-entry-retry': retry,
  };
  let onError: ((event: { target: unknown }) => void) | undefined;
  let onDocumentReady: (() => void) | undefined;
  let pending = true;
  runInNewContext(code, {
    window: {},
    HTMLScriptElement: ScriptElement,
    addEventListener(name: string, handler: typeof onError, capture: boolean) {
      assert.equal(name, 'error');
      assert.equal(capture, true);
      onError = handler;
    },
    document: {
      readyState: 'loading',
      body: { classList: { contains: () => pending } },
      addEventListener(name: string, handler: () => void) {
        assert.equal(name, 'DOMContentLoaded');
        onDocumentReady = handler;
      },
      getElementById: (id: string) => elements[id],
    },
  });
  onError!({ target: { type: 'image' } });
  assert.equal(onDocumentReady, undefined);
  onError!({ target: new ScriptElement() });
  onDocumentReady!();
  assert.deepEqual([loading.hidden, error.hidden, retry.hidden], [true, false, false]);
  pending = false;
  error.hidden = true;
  onError!({ target: new ScriptElement() });
  onDocumentReady!();
  assert.equal(error.hidden, true);

  const retryClick = html.match(/id="town-entry-retry" onclick="([^"]+)"/)?.[1];
  assert.ok(retryClick);
  let reloads = 0;
  runInNewContext(retryClick, { location: { reload: () => { reloads++; } } });
  assert.equal(reloads, 1);
});
