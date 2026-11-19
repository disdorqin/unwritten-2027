import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  base64ToArrayBuffer, base64ToBytes, buildPollBody, bytesToBase64, encodePollEvent,
  parsePollMessages, pollSampleIntervalSeconds, pushPollEvent, requeuePollEvents,
} from '../tools/voxel-tavern/town-blockout/town-presence-poll.ts';

test('poll fallback reports state at 2 Hz (0.5 s sample interval)', () => {
  assert.equal(pollSampleIntervalSeconds, 0.5);
});

test('base64 round-trips arbitrary bytes including large frames', () => {
  const small = new Uint8Array([0, 1, 0xff, 0x80, 0x7f, 42]);
  assert.deepEqual(base64ToBytes(bytesToBase64(small)), small);
  const large = new Uint8Array(100_000);
  for (let i = 0; i < large.length; i++) large[i] = (i * 31) & 0xff;
  assert.deepEqual(base64ToBytes(bytesToBase64(large)), large);
  const buffer = base64ToArrayBuffer(bytesToBase64(small));
  assert.deepEqual(new Uint8Array(buffer), small);
});

test('buildPollBody carries the latest state frame and queued events', () => {
  const state = new Uint8Array(12);
  state[2] = 123;
  const body = JSON.parse(buildPollBody(state.buffer as ArrayBuffer, [
    JSON.stringify({ type: 'chat', scope: 'town', text: '你好' }),
    new Uint8Array([0xff, 1, 2]),
  ])) as { state: string; events: { t: string; d: string }[] };
  assert.deepEqual(base64ToBytes(body.state), state);
  assert.equal(body.events[0]!.t, 'text');
  assert.deepEqual(JSON.parse(body.events[0]!.d), { type: 'chat', scope: 'town', text: '你好' });
  assert.equal(body.events[1]!.t, 'bin');
  assert.deepEqual(base64ToBytes(body.events[1]!.d), new Uint8Array([0xff, 1, 2]));
  assert.deepEqual(JSON.parse(buildPollBody(undefined, [])), {});
});

test('encodePollEvent keeps text frames as text and binary frames as base64', () => {
  assert.deepEqual(encodePollEvent('{"type":"pose","pose":3}'), { t: 'text', d: '{"type":"pose","pose":3}' });
  const bin = encodePollEvent(new Uint8Array([0xff, 2, 9]));
  assert.equal(bin.t, 'bin');
  assert.deepEqual(base64ToBytes(bin.d), new Uint8Array([0xff, 2, 9]));
});

test('parsePollMessages accepts well-formed payloads and rejects malformed ones', () => {
  assert.deepEqual(parsePollMessages({ messages: [{ t: 'text', d: '{}' }, { t: 'bin', d: 'AA==' }] }), [
    { t: 'text', d: '{}' }, { t: 'bin', d: 'AA==' },
  ]);
  assert.deepEqual(parsePollMessages({ messages: [] }), []);
  assert.equal(parsePollMessages(undefined), undefined);
  assert.equal(parsePollMessages({}), undefined);
  assert.equal(parsePollMessages({ messages: 'nope' }), undefined);
  assert.equal(parsePollMessages({ messages: [{ t: 'text' }] }), undefined);
  assert.equal(parsePollMessages({ messages: [{ t: 'carrier-pigeon', d: 'x' }] }), undefined);
});

test('pushPollEvent bounds the queue by dropping the oldest events', () => {
  const queue: (string | Uint8Array)[] = [];
  for (let i = 0; i < 200; i++) pushPollEvent(queue, `event-${i}`);
  assert.equal(queue.length, 128);
  assert.equal(queue[0], 'event-72');
  assert.equal(queue[127], 'event-199');
});

test('requeuePollEvents restores failed events at the head in order', () => {
  const queue: (string | Uint8Array)[] = ['fresh-1', 'fresh-2'];
  requeuePollEvents(queue, ['failed-1', 'failed-2']);
  assert.deepEqual(queue, ['failed-1', 'failed-2', 'fresh-1', 'fresh-2']);
  const big: (string | Uint8Array)[] = [];
  for (let i = 0; i < 127; i++) big.push(`queued-${i}`);
  requeuePollEvents(big, ['failed-1', 'failed-2', 'failed-3']);
  assert.equal(big.length, 128);
  assert.deepEqual(big.slice(0, 3), ['failed-1', 'failed-2', 'failed-3']);
});
