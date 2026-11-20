import type { RequestListener } from 'node:http';
import { townNightWindowPath } from '../shared/za22-mountain-domain.js';
import { createOrdinaryTownNightSchedule, createTownNightWindow } from '../shared/town-night-window.js';

export function createZa22NightWindowEndpoint(options?: {
  dawnEpoch: number;
  offsetsAfterDusk: readonly number[];
  now?: () => number;
}, fallback?: RequestListener) {
  const now = options?.now ?? Date.now;
  const scheduleAt = options ? createOrdinaryTownNightSchedule({
    dawnEpoch: options.dawnEpoch,
    beaconOffsetsAfterDusk: options.offsetsAfterDusk,
    cueFreshnessMs: 3_000,
  }) : () => undefined;
  const state = createTownNightWindow({ now, scheduleAt });
  const tick = () => {
    const snapshot = state.snapshot();
    if (snapshot.phase === 'awaiting-beacon' && snapshot.beaconAt !== null) state.recordBeacon(snapshot.beaconAt);
  };
  const listener: RequestListener = (request, response) => {
    if (request.url !== townNightWindowPath) {
      if (fallback) fallback(request, response);
      else response.writeHead(404).end();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' }).end();
      return;
    }
    tick();
    const timestamp = now();
    const snapshot = state.snapshot();
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    }).end(JSON.stringify({ ...snapshot, now: timestamp }));
  };
  return { listener, tick };
}
