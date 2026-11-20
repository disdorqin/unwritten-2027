import { createPresenceServer } from './server.js';
import type { RequestListener } from 'node:http';
import { mountainPresenceBounds } from '../shared/za22-mountain-domain.js';
import { createZa22NightWindowEndpoint } from './za22-night-window-endpoint.js';
import { westPresenceBounds } from '../shared/za22-west-domain.js';

export async function startPresence(requestListener?: RequestListener, ceremonyStartAt?: number) {
  const host = process.env.PRESENCE_HOST ?? '0.0.0.0';
  const dawn = process.env.TOWN_NIGHT_DAWN_EPOCH;
  const offsets = process.env.TOWN_NIGHT_OFFSETS_AFTER_DUSK;
  const night = createZa22NightWindowEndpoint(dawn && offsets ? {
    dawnEpoch: Number(dawn),
    offsetsAfterDusk: JSON.parse(offsets),
  } : undefined, requestListener);
  const server = await createPresenceServer({
    host,
    port: Number(process.env.PRESENCE_PORT ?? 8090),
    tiers: process.env.PRESENCE_TIERS ? JSON.parse(process.env.PRESENCE_TIERS) : undefined,
    testFireworks: process.env.TEST_FIREWORKS === 'on',
    ownerKey: process.env.OWNER_KEY,
    onMascotClaimRejected: total => console.info('Mascot actor rejected claims:', total),
    requestListener: night.listener,
    ceremonyStartAt,
  });
  const separateRooms: Awaited<ReturnType<typeof createPresenceServer>>[] = [];
  try {
    for (const [port, bounds] of [[process.env.PRESENCE_MOUNTAIN_PORT, mountainPresenceBounds],
      [process.env.PRESENCE_WEST_PORT, westPresenceBounds]] as const) {
      if (port) separateRooms.push(await createPresenceServer({ host, port: Number(port), ...bounds, ceremonyStartAt: 0 }));
    }
  } catch (error) {
    await Promise.allSettled([server, ...separateRooms].map(room => room.close()));
    throw error;
  }
  const timer = dawn && offsets ? setInterval(night.tick, 250) : undefined;
  timer?.unref();
  console.log(`Town presence listening on ${server.address().port}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    clearInterval(timer);
    void Promise.all([server, ...separateRooms].map(room => room.close())).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
