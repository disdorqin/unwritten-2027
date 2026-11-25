import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createZa22NightWindowEndpoint } from '../../src/presence/za22-night-window-endpoint.js';
import {
  isMountainPresenceFoot, mountainPresenceNorthOrigin, townNightWindowPath,
} from '../../src/shared/za22-mountain-domain.js';

test('the town HTTP authority opens after the received bell and closes at morning', async t => {
  const dawnEpoch = 2_000_000;
  let now = dawnEpoch + 419_999;
  const { listener, tick } = createZa22NightWindowEndpoint({
    dawnEpoch,
    offsetsAfterDusk: Array(12).fill(60_000),
    now: () => now,
  });
  const server = createServer(listener);
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = `http://127.0.0.1:${(server.address() as AddressInfo).port}${townNightWindowPath}`;
  assert.equal((await fetch(addr, { method: 'POST' })).status, 405);
  const before = await fetch(addr);
  assert.equal(before.headers.get('cache-control'), 'no-store');
  assert.equal((await before.json()).canEnterRestricted, false);
  now++;
  tick();
  const opened = await (await fetch(addr)).json();
  assert.equal(opened.canEnterRestricted, true);
  assert.equal(opened.beaconAt, now);
  assert.equal(opened.chapterGatesLocked, true);
  now += 60_000;
  const noOverlap = await (await fetch(addr)).json();
  assert.equal(noOverlap.layersOverlap, false);
  assert.equal(noOverlap.canEnterRestricted, true);
  now = dawnEpoch + 600_000;
  assert.equal((await (await fetch(addr)).json()).canEnterRestricted, false);
});

test('mountain wire admission accepts both surveyed stops and rejects unencodable poses', () => {
  assert.equal(isMountainPresenceFoot(336, 640, 347), true);
  assert.equal(isMountainPresenceFoot(300, 666, 347), true);
  assert.equal(isMountainPresenceFoot(526, mountainPresenceNorthOrigin - .01, 26), false);
  assert.equal(isMountainPresenceFoot(300, 676, 800), false);
});
