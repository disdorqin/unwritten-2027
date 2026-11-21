import { createPresenceServer } from './server.js';
import type { RequestListener } from 'node:http';
import { mountainPresenceBounds } from '../shared/za22-mountain-domain.js';
import { westPresenceBounds } from '../shared/za22-west-domain.js';
import { skyCityPresenceBounds } from '../shared/sky-city-presence-domain.js';
import { readTownNightOptions } from './town-night-config.js';
import { readTownWeatherOptions } from './town-weather-config.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The town night clock is core game canon (one game day = 10 minutes:
// 6 daylight, 4 night; the thirteenth bell sounds 60 s after dusk), so it
// defaults ON. TOWN_NIGHT_SCHEDULE / TOWN_NIGHT_BEACON_RECEIPT override it.
// dawnEpoch matches townWeatherEpoch (Date.UTC(2026, 0, 1)) so the day cycle
// and the weather schedule share one epoch.
// The beacon drift table: the thirteenth bell sounds 50 s after dusk on the
// first night and drifts +11 s per night across a 12-night cycle, then wraps
// (canon: 入夜约 1 分钟后响, 漂移按 12 个游戏日绕一圈). Every offset keeps
// offset + 60 s cue/overlap inside the 4-minute night.
const defaultTownNightSchedule = JSON.stringify({
  dawnEpoch: Date.UTC(2026, 0, 1),
  beaconOffsetsAfterDusk: Array.from({ length: 12 }, (_, day) => 50_000 + day * 11_000),
  cueFreshnessMs: 60_000,
});
const defaultTownNightBeaconReceipt = '/tmp/town-night-beacon-receipt.json';

export async function startPresence(requestListener?: RequestListener, ceremonyStartAt?: number) {
  const host = process.env.PRESENCE_HOST ?? '0.0.0.0';
  const townNight = readTownNightOptions(
    process.env.TOWN_NIGHT_SCHEDULE || defaultTownNightSchedule,
    process.env.TOWN_NIGHT_BEACON_RECEIPT || defaultTownNightBeaconReceipt,
  );
  const townWeather = readTownWeatherOptions(townNight!.dawnEpoch!,
    process.env.TOWN_WEATHER_WARNING_RECEIPT || join(tmpdir(), 'unwritten-town-weather-warning-receipt.json'));
  const server = await createPresenceServer({
    host,
    port: Number(process.env.PRESENCE_PORT ?? 8090),
    tiers: process.env.PRESENCE_TIERS ? JSON.parse(process.env.PRESENCE_TIERS) : undefined,
    testFireworks: process.env.TEST_FIREWORKS === 'on',
    ownerKey: process.env.OWNER_KEY,
    onMascotClaimRejected: total => console.info('Mascot actor rejected claims:', total),
    requestListener,
    townNight,
    // G-09 reuses the exact ZB-17 dawn origin; no second weather calendar.
    townOutdoorWeather: townWeather,
    ceremonyStartAt,
  });
  const separateRooms: Awaited<ReturnType<typeof createPresenceServer>>[] = [];
  try {
    for (const [port, bounds] of [[process.env.PRESENCE_MOUNTAIN_PORT, mountainPresenceBounds],
      [process.env.PRESENCE_WEST_PORT, westPresenceBounds],
      [process.env.PRESENCE_SKY_PORT, skyCityPresenceBounds]] as const) {
      if (port) separateRooms.push(await createPresenceServer({
        host, port: Number(port), ...bounds, ceremonyStartAt: 0, townNightFeed: server.townNightFeed,
        townOutdoorWeatherFeed: server.townOutdoorWeatherFeed,
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
