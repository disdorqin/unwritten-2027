import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPresenceLinkStatus, faultCodeForStep, presenceLinkText,
} from '../tools/voxel-tavern/town-blockout/town-presence-status.ts';

test('link status starts offline as single-player and shows connecting on entering town', () => {
  const link = createPresenceLinkStatus();
  assert.equal(link.text(), '单人模式');
  link.enterTown();
  assert.equal(link.snapshot().phase, 'connecting');
  assert.equal(link.text(), '连接中…');
});

test('fault codes map to the step that failed', () => {
  assert.equal(faultCodeForStep(0), 'PG-1');
  assert.equal(faultCodeForStep(1), 'WS-2');
  assert.equal(faultCodeForStep(2), 'FR-3');
  assert.equal(faultCodeForStep(3), 'HB-4');
  assert.equal(faultCodeForStep(4), 'HB-4');
});

test('websocket handshake failure shows not-connected with the WS-2 code', () => {
  const link = createPresenceLinkStatus();
  link.enterTown();
  link.attemptStarted();
  link.failed();
  const snapshot = link.snapshot();
  assert.equal(snapshot.phase, 'retrying');
  assert.equal(snapshot.fault, 'WS-2');
  assert.equal(link.text(), '未连接 · 自动重试中（WS-2）');
});

test('failure before the socket is constructed reports PG-1', () => {
  const link = createPresenceLinkStatus();
  link.enterTown();
  link.failed();
  assert.equal(link.snapshot().fault, 'PG-1');
});

test('failure after open but before the join frame reports FR-3', () => {
  const link = createPresenceLinkStatus();
  link.enterTown();
  link.attemptStarted();
  link.socketOpened();
  link.failed();
  assert.equal(link.snapshot().fault, 'FR-3');
});

test('dropping after join but before the first snapshot reports HB-4', () => {
  const link = createPresenceLinkStatus();
  link.enterTown();
  link.attemptStarted();
  link.socketOpened();
  link.joined(2);
  link.failed();
  assert.equal(link.snapshot().fault, 'HB-4');
  assert.equal(link.snapshot().phase, 'retrying');
});

test('successful reconnect restores the online state and people count', () => {
  const link = createPresenceLinkStatus();
  link.enterTown();
  link.attemptStarted();
  link.failed();
  assert.equal(link.snapshot().phase, 'retrying');
  link.attemptStarted();
  assert.equal(link.text(), '连接中…');
  link.socketOpened();
  link.joined(5);
  assert.equal(link.snapshot().phase, 'online');
  assert.equal(link.snapshot().fault, null);
  assert.equal(link.text(), '已连接 · 5 人');
  link.firstFrame();
  assert.equal(link.snapshot().step, 4);
  link.setPeople(6);
  assert.equal(link.text(), '已连接 · 6 人');
  link.setPeople(4);
  assert.equal(link.text(), '已连接 · 4 人');
});

test('leaving town returns to single-player without a fault', () => {
  const link = createPresenceLinkStatus();
  link.enterTown();
  link.attemptStarted();
  link.socketOpened();
  link.joined(3);
  link.leaveTown();
  assert.equal(link.snapshot().phase, 'off');
  assert.equal(link.snapshot().fault, null);
  assert.equal(link.text(), '单人模式');
  link.failed();
  assert.equal(link.snapshot().phase, 'off');
  assert.equal(link.text(), '单人模式');
});

test('fallback phase is reserved with its own display text', () => {
  const link = createPresenceLinkStatus();
  link.enterTown();
  link.useFallback(2);
  assert.equal(link.snapshot().phase, 'fallback');
  assert.equal(presenceLinkText(link.snapshot()), '备用通道 · 2 人');
});

test('status changes are pushed to the subscriber in order', () => {
  const seen: string[] = [];
  const link = createPresenceLinkStatus(snapshot => { seen.push(presenceLinkText(snapshot)); });
  link.enterTown();
  link.attemptStarted();
  link.failed();
  link.attemptStarted();
  link.socketOpened();
  link.joined(1);
  assert.deepEqual(seen, ['连接中…', '连接中…', '未连接 · 自动重试中（WS-2）', '连接中…', '连接中…', '已连接 · 1 人']);
});
