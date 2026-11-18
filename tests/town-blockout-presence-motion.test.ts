import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRecord, TOWN_BOUNDS, writeSnapshot } from '../src/presence/protocol.js';
import { worldBounds } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import {
  presenceRecordBytes, pushPresenceSample, samplePresencePose, visitPresenceSnapshot, writePresencePose,
  type PresencePose, type PresenceSample,
} from '../tools/voxel-tavern/town-blockout/town-presence-motion.ts';

test('presence client and relay share a 12-byte record and the expanded town fits the wire', () => {
  assert.equal(TOWN_BOUNDS.width, worldBounds.width);
  assert.equal(TOWN_BOUNDS.depth, worldBounds.depth);
  const view = new DataView(new ArrayBuffer(presenceRecordBytes));
  writePresencePose({ east: 640, north: 512, height: 64.32, yaw: -Math.PI / 2 }, 65535, view);
  const decoded = readRecord(new Uint8Array(view.buffer));
  assert.deepEqual(decoded, { id: 0, east: 64000, north: 51200, height: 6432, yaw: 49152, seq: 65535 });
  const frame = new Uint8Array(writeSnapshot([{ ...decoded!, id: 1 }]));
  const events: number[][] = [];
  assert.equal(visitPresenceSnapshot(frame.buffer, (...values) => events.push(values)), true);
  assert.deepEqual(events, [[1, 640, 512, 64.32, 3 * Math.PI / 2, 65535]]);
  assert.equal(visitPresenceSnapshot(frame.slice(0, -1).buffer, () => assert.fail('invalid frame')), false);
  assert.equal(visitPresenceSnapshot(new Uint8Array([49]).buffer, () => assert.fail('invalid cap')), false);
});

const pose = (east: number, time: number, seq: number, yaw = 0): PresenceSample =>
  ({ east, north: 20, height: 5, yaw, time, seq });
const output = (): PresencePose => ({ east: 0, north: 0, height: 0, yaw: 0 });

test('presence samples interpolate by 120 ms, wrap headings and follow a terminal stop', () => {
  const history: PresenceSample[] = [];
  assert.equal(pushPresenceSample(history, pose(10, 100, 65535, 350 * Math.PI / 180)), true);
  assert.equal(pushPresenceSample(history, pose(11, 200, 0, 10 * Math.PI / 180)), true);
  assert.equal(pushPresenceSample(history, pose(9, 210, 65535)), false);
  const position = output();
  samplePresencePose(history, 270, position);
  assert.equal(position.east, 10.5);
  assert.ok(Math.min(position.yaw, 2 * Math.PI - position.yaw) < 1e-6);
  samplePresencePose(history, 420, position);
  assert.equal(position.east, 12);
  samplePresencePose(history, 575, position);
  assert.equal(position.east, 13.5, 'hold at the 250 ms horizon without continuing or snapping back');
  assert.equal(pushPresenceSample(history, pose(11, 300, 1, 10 * Math.PI / 180)), true);
  samplePresencePose(history, 500, position);
  assert.equal(position.east, 11, 'terminal packet cancels extrapolated velocity');
});

test('presence refuses to blend teleports or an old trail after a long receive gap', () => {
  const history: PresenceSample[] = [pose(60, 100, 8), pose(61, 200, 9)];
  pushPresenceSample(history, pose(500, 300, 10));
  assert.equal(history.length, 1);
  const position = output();
  samplePresencePose(history, 302, position);
  assert.equal(position.east, 500);
  pushPresenceSample(history, pose(501, 1000, 11));
  assert.equal(history.length, 1);
  samplePresencePose(history, 1000, position);
  assert.equal(position.east, 501);
});
