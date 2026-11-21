import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRecord, RECORD_BYTES, writeSnapshot } from '../src/presence/protocol.ts';
import {
  fromMinePresencePose, isMinePresenceFoot, minePresenceBounds, minePresenceEndpoint,
  minePresenceOrigin, minePresencePath, mineWorldHeightLimit, toMinePresencePose,
} from '../src/shared/underground-mine-presence-domain.ts';
import { visitPresenceSnapshot, writePresencePose } from '../tools/voxel-tavern/town-blockout/town-presence-motion.ts';

test('mine domain preserves the same websocket and poll paths without touching town', () => {
  assert.equal(minePresenceEndpoint('/presence'), '/presence-mine');
  assert.equal(minePresenceEndpoint('/presence/poll'), '/presence-mine/poll');
  assert.equal(minePresenceEndpoint('/presence/poll/join'), '/presence-mine/poll/join');
  assert.equal(minePresenceEndpoint('/presence/poll/leave'), '/presence-mine/poll/leave');
  assert.throws(() => minePresenceEndpoint('/presence-west'));
});

test('mine domain fits the unchanged 12-byte unsigned-centimetre frame', () => {
  assert.equal(minePresencePath, '/presence-mine');
  assert.equal(RECORD_BYTES, 12);
  assert.equal(minePresenceOrigin.height, -128);
  assert.equal(mineWorldHeightLimit, -64);
  assert.ok(Math.max(...Object.values(minePresenceBounds)) <= 655.35);

  for (const world of [
    { east: -119, north: 189, height: -90, yaw: 1.25 },
    { east: -180, north: 120, height: -128, yaw: 0 },
    { east: -50, north: 260, height: -64, yaw: 3 },
    { east: -119, north: 189, height: -125.5, yaw: 0 },
  ]) {
    const wire = toMinePresencePose(world)!;
    assert.ok(wire, 'valid mine-world pose should map into its room');
    assert.ok(wire.height <= 64 && wire.height >= 0);
    const buffer = new DataView(new ArrayBuffer(RECORD_BYTES));
    writePresencePose(wire, 42, buffer);
    const record = readRecord(new Uint8Array(buffer.buffer))!;
    assert.ok(record);
    const decoded = fromMinePresencePose({
      east: record.east / 100, north: record.north / 100, height: record.height / 100, yaw: record.yaw,
    })!;
    for (const axis of ['east', 'north', 'height'] as const) {
      assert.ok(Math.abs(decoded[axis] - world[axis]) <= .0051, `round trip ${axis}`);
    }
    assert.equal(decoded.yaw, record.yaw);
    assert.equal(record.seq, 42);

    const snapshot = writeSnapshot([{ ...record, id: 7 }]);
    let counted = 0;
    assert.equal(visitPresenceSnapshot(new Uint8Array(snapshot).buffer,
      (id, east, north, height) => {
        counted++;
        assert.equal(id, 7);
        assert.equal(fromMinePresencePose({ east, north, height }).height, decoded.height);
      }), true);
    assert.equal(counted, 1);
  }
});

test('the certified first-fall landing is inside the mine room and the surface is not', () => {
  assert.equal(isMinePresenceFoot(-119, 189, -90), true);
  assert.equal(toMinePresencePose({ east: -119, north: 189, height: -90 })?.height, 38);
  assert.equal(isMinePresenceFoot(-121.08, 181.73, -24.2227), false, 'crater-floor winch foot stays in the west room');
  assert.equal(isMinePresenceFoot(-119, 189, -140), false, 'the -140 layer is a deeper room, not this one');
  assert.equal(toMinePresencePose({ east: 10, north: 189, height: -90 }), undefined);
});
