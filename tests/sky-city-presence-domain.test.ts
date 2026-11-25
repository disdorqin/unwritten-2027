import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRecord, RECORD_BYTES, TOWN_BOUNDS, writeSnapshot } from '../src/presence/protocol.ts';
import {
  fromSkyCityPresencePose, isSkyCityPresenceFoot, skyCityPresenceBounds,
  skyCityPresenceOrigin, skyCityPresencePath, skyCityWorldHeightLimit, toSkyCityPresencePose,
  skyCityPresenceEndpoint,
} from '../src/shared/sky-city-presence-domain.ts';
import { visitPresenceSnapshot, writePresencePose } from '../tools/voxel-tavern/town-blockout/town-presence-motion.ts';

test('sky domain preserves the same websocket and poll paths without touching town', () => {
  assert.equal(skyCityPresenceEndpoint('/presence'), '/presence-sky');
  assert.equal(skyCityPresenceEndpoint('/presence/poll'), '/presence-sky/poll');
  assert.equal(skyCityPresenceEndpoint('/presence/poll/join'), '/presence-sky/poll/join');
  assert.equal(skyCityPresenceEndpoint('/presence/poll/leave'), '/presence-sky/poll/leave');
  assert.throws(() => skyCityPresenceEndpoint('/presence-west'));
});

test('Y750 sky domain fits the unchanged 12-byte unsigned-centimetre frame', () => {
  assert.equal(skyCityPresencePath, '/presence-sky');
  assert.equal(RECORD_BYTES, 12);
  assert.equal(TOWN_BOUNDS.height, 900);
  assert.equal(skyCityPresenceOrigin.height, 750);
  assert.equal(skyCityWorldHeightLimit, 900);
  assert.ok(Math.max(...Object.values(skyCityPresenceBounds)) <= 655.35);

  for (const world of [
    { east: -14, north: -250, height: 796, yaw: 1.25 },
    { east: -14, north: -37, height: 750, yaw: 0 },
    { east: 0, north: 0, height: 763.8, yaw: 3 },
    { east: 320, north: 270, height: 900, yaw: 0 },
    { east: -320, north: -270, height: 750, yaw: 0 },
  ]) {
    const wire = toSkyCityPresencePose(world)!;
    assert.ok(wire, 'valid sky-world pose should map into its room');
    assert.ok(wire.height <= 150 && wire.height >= 0);
    const buffer = new DataView(new ArrayBuffer(RECORD_BYTES));
    writePresencePose(wire, 42, buffer);
    const record = readRecord(new Uint8Array(buffer.buffer))!;
    assert.ok(record);
    const decoded = fromSkyCityPresencePose({
      east: record.east / 100,
      north: record.north / 100,
      height: record.height / 100,
      yaw: record.yaw,
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
        assert.equal(fromSkyCityPresencePose({ east, north, height })?.height, decoded.height);
      }), true);
    assert.equal(counted, 1);
  }
});

test('sky room rejects nonfinite, out-of-room and out-of-height world positions without clamping', () => {
  const origin = { east: 0, north: 0, height: 750 };
  for (const pose of [
    { ...origin, east: -320.01 },
    { ...origin, east: 320.01 },
    { ...origin, north: -270.01 },
    { ...origin, north: 270.01 },
    { ...origin, height: 749.99 },
    { ...origin, height: 900.01 },
    { ...origin, height: Number.NaN },
    { ...origin, east: Infinity },
  ]) {
    assert.equal(isSkyCityPresenceFoot(pose.east, pose.north, pose.height), false);
    assert.equal(toSkyCityPresencePose(pose), undefined);
  }
  for (const pose of [
    { east: -1, north: 1, height: 0 },
    { east: 640.01, north: 1, height: 0 },
    { east: 1, north: 540.01, height: 0 },
    { east: 1, north: 1, height: 150.01 },
    { east: 1, north: 1, height: Number.POSITIVE_INFINITY },
  ]) assert.equal(fromSkyCityPresencePose(pose), undefined);
});

test('sky wire frame is distinct from town and mountain coordinate frames', () => {
  const world = { east: -14, north: -250, height: 796, yaw: 0 };
  const sky = toSkyCityPresencePose(world)!;
  assert.deepEqual(sky, { east: 306, north: 20, height: 46, yaw: 0 });
  assert.deepEqual(fromSkyCityPresencePose(sky), world);
  // Sending world Y796 directly would silently clamp to Y655.35.
  const old = new DataView(new ArrayBuffer(RECORD_BYTES));
  writePresencePose(world, 0, old);
  assert.equal(readRecord(new Uint8Array(old.buffer))?.height, 65535);
  const safe = new DataView(new ArrayBuffer(RECORD_BYTES));
  writePresencePose(sky, 0, safe);
  assert.equal(readRecord(new Uint8Array(safe.buffer))?.height, 4600);
});
