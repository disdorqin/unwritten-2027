import assert from 'node:assert/strict';
import test from 'node:test';
import {
  busStationCatalogueStamp, busStationTicket, createBusStationHiddenActivity,
} from '../tools/voxel-tavern/town-blockout/bus-station-hidden-activity.ts';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildRailwayStation, railwayStationStops } from '../tools/voxel-tavern/town-blockout/landmark-station.ts';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { extensionPlots } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import { createTownPassport } from '../tools/voxel-tavern/town-blockout/town-passport.ts';

function stationFixture() {
  const station = buildRailwayStation();
  const { origin: [east, north, base] } = extensionPlots.find(plot => plot.id === 'railway-station')!;
  station.position.set(east, base, -north);
  const { colliders, floors } = station.userData as { colliders: Box[]; floors: Box[] };
  const bodyRadius = .27;
  const canStand = (worldEast: number, worldNorth: number, ground: number) => {
    const x = worldEast - east;
    const z = north - worldNorth;
    const y = ground - base;
    return floors.some(({ min, max }) => x >= min[0] && x <= max[0] && z >= min[2] && z <= max[2] &&
      Math.abs(max[1] - y) < .001) &&
      !colliders.some(({ min, max }) => x + bodyRadius > min[0] && x - bodyRadius < max[0] &&
        z + bodyRadius > min[2] && z - bodyRadius < max[2] && y + 1.65 > min[1] && y < max[1]);
  };
  return { station, canStand, east, north, ground: base + .14 };
}

test('the station ticket and catalogue use a reachable side window and persist without changing core stamp progress', t => {
  const saved = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const { station, canStand, east, north, ground } = stationFixture();
  let living = false;
  let collected = 0;
  const opened: string[] = [];
  const ui = {
    open(title: string) { opened.push(title); return {} as HTMLElement; },
    announce() {},
  };
  const coreStamp = { id: 'core-stamp', label: '核心印章', hint: '' };
  const passport = () => createTownPassport(ui, [coreStamp], undefined, [busStationCatalogueStamp]);
  const host = {
    canStand,
    canBuyTicket: () => living,
    canHearStationBroadcast: () => false,
    listener: () => undefined,
    onTicketCollected: () => { collected++; },
  };
  const original = passport();
  const { spots, platform } = createBusStationHiddenActivity(station, ui, original, host);
  const [collect, catalogue] = spots;
  assert.equal(spots.length, 2);
  assert.deepEqual([collect.x, collect.n, collect.ground], [east - 9.9, north + .14, ground]);
  const oldTicket = railwayStationStops.ticketCounter[0] * station.scale.x + east;
  assert.ok(Math.abs(collect.x - oldTicket) > collect.range + 1.35);

  for (let n = north - 16; n <= platform.n; n += .20) assert.ok(canStand(east, n, ground), String(n));
  for (let x = east; x >= collect.x; x -= .20) assert.ok(canStand(x, collect.n, ground), String(x));
  for (let x = east; x <= platform.x; x += .20) assert.ok(canStand(x, platform.n, ground), String(x));

  collect.run();
  assert.equal(collected, 0);
  assert.equal(nearestTownActivity(spots, collect.x, collect.n, collect.ground), undefined);
  living = true;
  assert.equal(nearestTownActivity(spots, collect.x, collect.n, collect.ground), collect);
  collect.run();
  collect.run();
  assert.equal(collected, 1);
  assert.deepEqual(original.getProgress(), { collected: 0, total: 1, complete: false });
  assert.equal(nearestTownActivity(spots, collect.x, collect.n, collect.ground), catalogue);

  const reloaded = passport();
  const { spots: afterReload } = createBusStationHiddenActivity(station, ui, reloaded, host);
  living = false;
  assert.equal(reloaded.hasExtension(busStationCatalogueStamp.id), true);
  const reopened = nearestTownActivity(afterReload, collect.x, collect.n, collect.ground);
  assert.equal(reopened?.label, `查看图鉴 · ${busStationCatalogueStamp.label}`);
  reopened?.run();
  assert.deepEqual(opened, [busStationTicket, busStationCatalogueStamp.label]);
});

test('only a new delivered station effect reaches an eligible listener on the same platform floor', () => {
  const { station, canStand } = stationFixture();
  const ears: { listener?: { x: number; n: number; ground: number }; allowed: boolean } = { allowed: false };
  const clips: { at: number; origin: number[] }[] = [];
  const ui = { open() { assert.fail('ambient broadcast must not open a dialog'); } };
  const passport = { hasExtension: () => false, collectExtension: () => false };
  const host = {
    canStand,
    canBuyTicket: () => false,
    canHearStationBroadcast: () => ears.allowed,
    listener: () => ears.listener,
  };
  const activity = createBusStationHiddenActivity(station, ui, passport, {
    ...host, playStationBroadcast: (cue, origin) => clips.push({ at: cue.at, origin: origin.toArray() }),
  });
  const frame = (at: number) => ({ type: 'event', kind: 'town-night-beacon', at, expiresAt: at + 1 } as const);
  ears.listener = activity.platform;
  assert.equal(activity.stationBroadcast(frame(1)), false);
  ears.allowed = true;
  assert.equal(activity.stationBroadcast(frame(1)), false);
  ears.listener = { ...activity.platform, ground: activity.platform.ground + 1 };
  assert.equal(activity.stationBroadcast(frame(2)), false);
  ears.listener = { ...activity.platform, n: activity.platform.n + 5 };
  assert.equal(activity.stationBroadcast(frame(3)), false);
  ears.listener = activity.platform;
  assert.equal(activity.stationBroadcast(frame(4)), true);
  assert.equal(activity.stationBroadcast(frame(4)), false);
  assert.equal(activity.stationBroadcast(frame(3)), false);
  assert.equal(clips.length, 1);
  assert.equal(clips[0].at, 4);
  assert.deepEqual(clips[0].origin, [543, 30.19, -342.4]);

  const silent = createBusStationHiddenActivity(station, ui, passport, host);
  assert.equal(silent.stationBroadcast(frame(4)), false);
});
