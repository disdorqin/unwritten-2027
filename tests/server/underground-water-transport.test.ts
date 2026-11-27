import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../../src/presence/server.js';
import { minePresenceBounds } from '../../src/shared/underground-mine-presence-domain.js';

// Batch 103 water loop: the primary room authors the single river
// state on the town dawn anchor; the mine room follows the feed and
// its join message carries tonight()'s snapshot, so the domain host
// can feed C2-06's adapter from a live presence value.
test('mine room join carries the authored underground water snapshot', async () => {
  const dawnEpoch = Date.UTC(2026, 0, 1);
  const main = await createPresenceServer({
    host: '127.0.0.1', port: 0,
    undergroundWater: { dawnEpoch },
  });
  const mine = await createPresenceServer({
    host: '127.0.0.1', port: 0, ...minePresenceBounds,
    undergroundWaterFeed: main.undergroundWaterFeed,
  });
  try {
    const socket = new WebSocket(`ws://127.0.0.1:${mine.address().port}/presence`);
    await once(socket, 'open');
    const joined = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('join timed out')), 5000);
      socket.on('message', raw => {
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === 'join' && message.self) {
            clearTimeout(timer);
            resolve(message);
          }
        } catch { /* binary frames are not join messages */ }
      });
    });
    socket.send(JSON.stringify({ type: 'join', name: 'water-check' }));
    const message = await joined;
    const water = message.undergroundWater;
    assert.ok(water, 'join carries the water snapshot');
    assert.ok(Number.isSafeInteger(water.nightOrdinal), 'night ordinal present');
    assert.ok(['rise', 'level', 'fall'].includes(water.phase), 'phase valid');
    assert.ok(['low', 'mid', 'high'].includes(water.level), 'level valid');
    assert.equal(water.pumpOffset, 0, 'no pump offset banked');
    socket.close();
  } finally {
    await mine.close();
    await main.close();
  }
});
