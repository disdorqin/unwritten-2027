import { createPresenceServer } from './server.js';
import type { RequestListener } from 'node:http';
import { mountainPresenceBounds } from '../shared/za22-mountain-domain.js';
import { westPresenceBounds } from '../shared/za22-west-domain.js';
import { readTownNightOptions } from './town-night-config.js';

export async function startPresence(requestListener?: RequestListener, ceremonyStartAt?: number) {
  const host = process.env.PRESENCE_HOST ?? '0.0.0.0';
  const townNight = readTownNightOptions(
    process.env.TOWN_NIGHT_SCHEDULE || undefined,
    process.env.TOWN_NIGHT_BEACON_RECEIPT || undefined,
  );
  const server = await createPresenceServer({
    host,
    port: Number(process.env.PRESENCE_PORT ?? 8090),
    tiers: process.env.PRESENCE_TIERS ? JSON.parse(process.env.PRESENCE_TIERS) : undefined,
    testFireworks: process.env.TEST_FIREWORKS === 'on',
    ownerKey: process.env.OWNER_KEY,
    onMascotClaimRejected: total => console.info('Mascot actor rejected claims:', total),
    requestListener,
    townNight,
    ceremonyStartAt,
  });
  const separateRooms: Awaited<ReturnType<typeof createPresenceServer>>[] = [];
  try {
    for (const [port, bounds] of [[process.env.PRESENCE_MOUNTAIN_PORT, mountainPresenceBounds],
      [process.env.PRESENCE_WEST_PORT, westPresenceBounds]] as const) {
      if (port) separateRooms.push(await createPresenceServer({
        host, port: Number(port), ...bounds, ceremonyStartAt: 0, townNightFeed: server.townNightFeed,
      }));
    }
  } catch (error) {
    await Promise.allSettled([server, ...separateRooms].map(room => room.close()));
    throw error;
  }
  console.log(`Town presence listening on ${server.address().port}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void Promise.all([server, ...separateRooms].map(room => room.close())).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
