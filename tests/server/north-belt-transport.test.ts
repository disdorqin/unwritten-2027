import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket, type RawData } from 'ws';
import { createPresenceServer } from '../../src/presence/server.js';
import { TOWN_BOUNDS } from '../../src/presence/protocol.js';
import { createNorthBeltPresenceFrame, createNorthBeltTransferRegistry } from '../../src/shared/north-belt-transport.js';
import { presenceRecordBytes, visitPresenceSnapshot, writePresencePose } from
  '../../tools/voxel-tavern/town-blockout/town-presence-motion.js';

const townFrame = createNorthBeltPresenceFrame({ east: 0, north: 0, height: 0 }, TOWN_BOUNDS);
const frontFixtureFrame = createNorthBeltPresenceFrame(
  { east: 0, north: 270, height: 0 }, { width: 640, depth: 530, height: 350 },
);
const pose = (east: number, north: number, height: number, yaw = Math.PI / 2) => ({ east, north, height, yaw });

function fixtureSurvey(id: 'railway-north-ridge' | 'cable-foothill', east: number) {
  return { id, endpoints: {
    town: { anchorId: 'fixture-town-' + id, landing: pose(east, 73.25, 16) },
    'front-ridge': { anchorId: 'fixture-front-' + id, landing: pose(east, 343.25, 16) },
  } };
}
const rail = fixtureSurvey('railway-north-ridge', 240);
const cable = fixtureSurvey('cable-foothill', 260);
const fixtures = {
  town: { frame: townFrame, canStandAt: (id: string) => id.startsWith('fixture-town-') },
  'front-ridge': { frame: frontFixtureFrame, canStandAt: (id: string) => id.startsWith('fixture-front-') },
};

test('the surveyed frame encodes north-ridge world positions without saturating either room', () => {
  const sample = pose(321.24, 790.12, 347.64);
  assert.equal(townFrame.toLocal(sample), undefined);
  assert.deepEqual(frontFixtureFrame.toLocal(sample), pose(321.24, 520.12, 347.64));
  assert.deepEqual(frontFixtureFrame.toWorld(pose(321.24, 520.12, 347.64)), sample);
  assert.equal(frontFixtureFrame.toLocal(pose(320, 800.001, 350)), undefined);
  assert.equal(frontFixtureFrame.toLocal(pose(320, 270, 350.001)), undefined);
  assert.equal(frontFixtureFrame.toLocal(pose(320, 269.999, 25)), undefined);
  assert.equal(frontFixtureFrame.toLocal(pose(320, 270, 25, NaN)), undefined);
  assert.equal(frontFixtureFrame.toWorld(pose(0, 530.001, 0)), undefined);
  assert.throws(() => createNorthBeltPresenceFrame({ east: 0, north: 0, height: 0 },
    { width: 640, depth: 800, height: 350 }), /presence frame/);
});

test('the frame accepts a supplied origin and preserves yaw and inclusive edge poses', () => {
  const origin = { east: -14.37, north: 318.41, height: -12 };
  const translated = createNorthBeltPresenceFrame(origin, { width: .01, depth: 450, height: 500 });
  const min = { ...origin, yaw: -Math.PI };
  const max = pose(origin.east + .01, origin.north + 450, origin.height + 500, 1.4);
  assert.deepEqual(translated.toLocal(min), pose(0, 0, 0, -Math.PI));
  assert.deepEqual(translated.toLocal(max), pose(.01, 450, 500, 1.4));
  assert.deepEqual(translated.toWorld(pose(.01, 450, 500, 1.4)), max);
});

test('the two explicit transfers are independent and require a standable landing at each surveyed end', () => {
  const transfer = createNorthBeltTransferRegistry(fixtures, [rail, cable]);
  assert.deepEqual(transfer.destination('railway-north-ridge', 'town'), {
    side: 'front-ridge', anchorId: 'fixture-front-railway-north-ridge',
    worldPose: pose(240, 343.25, 16), localPose: pose(240, 73.25, 16),
  });
  assert.deepEqual(transfer.destination('cable-foothill', 'front-ridge'), {
    side: 'town', anchorId: 'fixture-town-cable-foothill',
    worldPose: pose(260, 73.25, 16), localPose: pose(260, 73.25, 16),
  });
  assert.equal(createNorthBeltTransferRegistry(fixtures, [rail]).destination('cable-foothill', 'town'), undefined);
  assert.throws(() => createNorthBeltTransferRegistry(fixtures, [rail, rail]), /duplicate/);
  assert.throws(() => createNorthBeltTransferRegistry({
    ...fixtures, 'front-ridge': { ...fixtures['front-ridge'], canStandAt: () => false },
  }, [rail]), /landing for front-ridge/);
  assert.throws(() => createNorthBeltTransferRegistry(fixtures, [{
    ...rail, endpoints: {
      ...rail.endpoints, 'front-ridge': { ...rail.endpoints['front-ridge'], landing: pose(300, 269, 16) },
    },
  }]), /landing for front-ridge/);
});

test('a dismounted destination cannot be used even after a valid transfer was registered', () => {
  let mounted = true;
  const transfer = createNorthBeltTransferRegistry({
    ...fixtures, 'front-ridge': { ...fixtures['front-ridge'], canStandAt: () => mounted },
  }, [rail, cable]);
  assert.ok(transfer.destination('railway-north-ridge', 'town'));
  mounted = false;
  assert.equal(transfer.destination('railway-north-ridge', 'town'), undefined);
  assert.ok(transfer.destination('cable-foothill', 'front-ridge'));
});

function waitFor<T>(socket: WebSocket, accept: (data: RawData, binary: boolean) => T | undefined) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for the presence frame'));
    }, 4000);
    function onMessage(data: RawData, binary: boolean) {
      const value = accept(data, binary);
      if (value === undefined) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(value);
    }
    socket.on('message', onMessage);
  });
}

function sendPose(socket: WebSocket, position: ReturnType<typeof pose>, seq: number) {
  const data = new ArrayBuffer(presenceRecordBytes);
  writePresencePose(position, seq, new DataView(data));
  socket.send(data);
}

test('real independent presence listeners preserve the same local coordinates in their own rooms', async () => {
  const sockets = new Set<WebSocket>();
  const servers: Awaited<ReturnType<typeof createPresenceServer>>[] = [];
  try {
    async function listener(frame: typeof townFrame) {
      const server = await createPresenceServer({
        ...frame.roomLimits, host: '127.0.0.1', port: 0,
      });
      servers.push(server);
      return server.address().port;
    }
    async function join(port: number, name: string) {
      const socket = new WebSocket('ws://127.0.0.1:' + port + '/presence');
      const known = new Set<string>();
      sockets.add(socket);
      socket.on('message', (data, binary) => {
        if (binary) return;
        const event = JSON.parse(data.toString());
        if (event.type === 'join' && typeof event.name === 'string') known.add(event.name);
      });
      await once(socket, 'open');
      const joined = waitFor(socket, (data, binary) => {
        if (binary) return;
        const event = JSON.parse(data.toString());
        if (event.type === 'join' && event.self === true) return event.id as number;
      });
      socket.send(JSON.stringify({ type: 'join', name }));
      return { socket, id: await joined, known };
    }
    type Peer = Awaited<ReturnType<typeof join>>;
    async function observe(mover: Peer, watcher: Peer, expected: ReturnType<typeof pose>, seq: number) {
      sendPose(watcher.socket, expected, seq);
      const next = waitFor(watcher.socket, (data, binary) => {
        if (!binary || !Buffer.isBuffer(data)) return;
        const bytes = new Uint8Array(data).buffer;
        let observed: ReturnType<typeof pose> | undefined;
        visitPresenceSnapshot(bytes, (id, east, north, height, yaw, sequence) => {
          if (id === mover.id && sequence === seq) observed = pose(east, north, height, yaw);
        });
        return observed;
      });
      sendPose(mover.socket, expected, seq);
      assert.deepEqual(await next, expected);
    }

    const [townPort, frontPort] = await Promise.all([listener(townFrame), listener(frontFixtureFrame)]);
    const [townWatcher, frontWatcher] = await Promise.all([join(townPort, 'town-observer'), join(frontPort, 'front-observer')]);
    const [townMover, frontMover] = await Promise.all([join(townPort, 'town-traveler'), join(frontPort, 'front-traveler')]);
    const transfer = createNorthBeltTransferRegistry(fixtures, [rail, cable]);
    await Promise.all([
      observe(townMover, townWatcher, transfer.destination('railway-north-ridge', 'front-ridge')!.localPose, 1),
      observe(frontMover, frontWatcher, transfer.destination('railway-north-ridge', 'town')!.localPose, 1),
    ]);
    assert.deepEqual([...townWatcher.known].sort(), ['town-observer', 'town-traveler']);
    assert.deepEqual([...frontWatcher.known].sort(), ['front-observer', 'front-traveler']);
    const highNorth = pose(321.24, 790.12, 347.64);
    const localHighNorth = frontFixtureFrame.toLocal(highNorth)!;
    await observe(frontMover, frontWatcher, localHighNorth, 2);
    assert.deepEqual(frontFixtureFrame.toWorld(localHighNorth), highNorth);
  } finally {
    for (const socket of sockets) socket.terminate();
    await Promise.all(servers.map(server => server.close()));
  }
});
