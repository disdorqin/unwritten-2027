import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIceCastle } from '../tools/voxel-tavern/town-blockout/landmark-ice-castle.ts';
import {
  createIcePalaceRace, icePalaceBalconyRace, icePalaceProgressKey,
} from '../tools/voxel-tavern/town-blockout/ice-palace-race.ts';
import {
  createCourtyardSeatSpots, createIceThroneSpots, createRailwayStationSpots, stationTicketStamp,
} from '../tools/voxel-tavern/town-blockout/landmark-refinement-activity.ts';
import { buildRailwayStation } from '../tools/voxel-tavern/town-blockout/landmark-station.ts';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { canEnter, createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownPassport } from '../tools/voxel-tavern/town-blockout/town-passport.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { RAILWAY_STATION_NAMES } from '../tools/voxel-tavern/town-blockout/town-rail-stops.ts';
import { railHallGuide } from '../tools/voxel-tavern/town-blockout/town-rail-copy.ts';

function canStandAt(group: ReturnType<typeof buildIceCastle>) {
  const { position, userData } = group;
  const boxes: Box[] = [...userData.colliders, ...userData.floors];
  return (east: number, north: number, feet: number) => {
    const x = east - position.x, z = -north - position.z, y = feet - position.y;
    return !boxes.some(({ min, max }) =>
      y + .025 < max[1] && y + 1.775 > min[1] &&
      Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] - z, z - max[2], 0)) < .27);
  };
}
const open = () => ({} as HTMLElement);

test('the ice throne has two clear spots and the photo faces the hall entrance', () => {
  const castle = buildIceCastle();
  castle.position.set(484, 12, -72);
  let seat: { x: number; n: number } | undefined;
  let focus: number[] | undefined;
  let filename = '';
  const spots = createIceThroneSpots(castle, {
    sit(value) { seat = value; },
    face(x, n, height) { focus = [x, n, height!]; },
  }, canStandAt(castle), name => { filename = name; });
  assert.equal(spots.length, 2);
  spots[0].run();
  assert.equal(seat?.x, 502.96);
  assert.equal(seat?.n, 76.92);
  spots[1].run();
  assert.deepEqual(focus, [491.2, 72, 14.15]);
  assert.equal(filename, 'UNWRITTEN-2027-ice-throne.png');
});

test('the balcony timer requires standing on the start and upper finish and keeps the fastest local record', () => {
  const progress = { iceKey: true, race: { towerBestMs: 11000, balconyBestMs: 7500 } };
  let raw = JSON.stringify(progress);
  let writes = 0;
  const storage = {
    getItem(key: string) { assert.equal(key, icePalaceProgressKey); return raw; },
    setItem(key: string, value: string) { assert.equal(key, icePalaceProgressKey); raw = value; writes++; },
  };
  let now = 1400;
  const race = createIcePalaceRace(storage, () => now);
  const { start, finish } = icePalaceBalconyRace;
  assert.doesNotMatch(race.update(...finish, true), /用时/);
  assert.match(race.update(start[0], start[1], 0, true), /踏上箭头板开始/);
  assert.equal(race.running, false);
  race.update(...start, false);
  assert.equal(race.running, false);
  assert.match(race.update(...start, true), /0\.0 秒/);
  now += 1300;
  assert.match(race.update(...start, true), /1\.3 秒/);
  now += 3900;
  race.update(finish[0], .15, finish[2], true);
  race.update(...finish, false);
  assert.equal(race.running, true);
  assert.match(race.update(...finish, true), /5\.2 秒 · 个人最佳 5\.2 秒/);
  assert.deepEqual(JSON.parse(raw), { iceKey: true, race: { towerBestMs: 11000, balconyBestMs: 5200 } });
  assert.equal(writes, 1);

  const restored = createIcePalaceRace(storage, () => now);
  assert.match(restored.update(-24.1, .12, 0, true), /个人最佳 5\.2 秒/);
  restored.update(...start, true);
  now += 8000;
  restored.update(...finish, true);
  assert.equal(writes, 1);
  restored.update(...start, true);
  assert.equal(restored.update(-27, 0, 0, true), '');
  assert.equal(restored.running, false);
  assert.doesNotMatch(restored.update(...finish, true), /用时/);
});

test('a solo player can walk the unchanged west-door and south-stair collision route to the race finish', () => {
  const castle = buildIceCastle();
  castle.position.set(484, 12, -72);
  const supports: Box[] = castle.userData.floors;
  const blockers: Box[] = castle.userData.colliders;
  const stand = canStandAt(castle);
  const terrain = createTerrainGrid();
  const race = castle.userData.palaceRace as ReturnType<typeof createIcePalaceRace>;
  let [x, z] = [-26, 0];
  let feet = terrain.heightAt(484 + x, 72 - z) - 12;
  let message = '';
  const route = [icePalaceBalconyRace.start, [9.74, .15, 0], [9.74, .15, 6.2],
    [17.83, 3.09, 6.2], [17.83, 3.09, .48], icePalaceBalconyRace.finish];
  function restsOn(localX: number, localZ: number, { min, max }: Box) {
    return Math.hypot(Math.max(min[0] - localX, localX - max[0], 0),
      Math.max(min[2] - localZ, localZ - max[2], 0)) < .27;
  }
  for (const [nextX, nextY, nextZ] of route) {
    const fromX = x, fromZ = z;
    const steps = Math.ceil(Math.hypot(nextX - fromX, nextZ - fromZ) / .11);
    for (let i = 1; i <= steps; i++) {
      x = fromX + (nextX - fromX) * i / steps;
      z = fromZ + (nextZ - fromZ) * i / steps;
      const e = 484 + x, n = 72 - z;
      let floor = terrain.heightAt(e, n) - 12;
      for (const support of supports) {
        if (support.max[1] <= feet + .43 && restsOn(x, z, support)) floor = Math.max(floor, support.max[1]);
      }
      for (const blocker of blockers) {
        if (blocker.max[1] <= feet + .03 && restsOn(x, z, blocker)) floor = Math.max(floor, blocker.max[1]);
      }
      assert.ok(canEnter(e, n) && stand(e, n, 12 + floor), `blocked at ${x}, ${floor}, ${z}`);
      assert.ok(Math.abs(floor - feet) <= .43, `unwalkable step at ${x}, ${z}`);
      feet = floor;
      message = race.update(x, feet, z, true);
    }
    assert.ok(Math.abs(feet - nextY) < .00001);
  }
  assert.match(message, /抵达观景台/);
});

test('a blocked bench front keeps the seat available from a clear side', () => {
  const seat = { x: 10, n: 20, eyeY: 14.2, yaw: 1.57 };
  const front = { x: 11, n: 20, ground: 12.6 };
  const side = { x: 11, n: 20.5, ground: 12.7 };
  let seated: unknown;
  const spots = createCourtyardSeatSpots({ seating: [{ seat, approaches: [front, side] }] },
    { sit(value) { seated = value; } }, (_x, n) => n !== front.n);
  assert.equal(spots.length, 1);
  assert.equal(spots[0].n, side.n);
  spots[0].run();
  assert.deepEqual(seated, seat);
});

test('station interaction spots stay aligned with the scaled model and the timetable reads train motion', () => {
  const station = buildRailwayStation();
  station.position.set(526, 26, -329);
  let now = Date.UTC(2026, 0, 1);
  const railway = createTownRailway(createTerrainGrid(), () => now);
  let stamp = '';
  let title = '';
  let description = '';
  const spots = createRailwayStationSpots(station, {
    open(heading, value) { title = heading; description = value; return open(); },
  }, railway, {
    hasExtension(id) { return stamp === id; },
    collectExtension(id) { stamp = id; return true; },
  }, canStandAt(station), () => now);
  assert.equal(spots.length, 3);
  assert.equal(spots[0].x, 513.3);
  assert.equal(spots[1].x, 538.8);
  assert.equal(spots[2].x, 507.4);
  assert.equal(spots[2].n, 326.9);
  assert.equal(spots[2].ground, 26.14);
  const { n, ground } = spots[2];
  const canStand = canStandAt(station);
  const floors = station.userData.floors as Box[];
  for (let step = 0; step <= 61; step++) {
    const east = spots[2].x + step / 10;
    assert.ok(canStand(east, n, ground), `guide approach obstructed at east ${east}`);
    const localX = east - station.position.x;
    const localZ = -n - station.position.z;
    assert.ok(floors.some(({ min, max }) =>
      Math.abs(max[1] - (ground - station.position.y)) < .001 &&
      localX >= min[0] && localX <= max[0] && localZ >= min[2] && localZ <= max[2]),
    `guide approach lacks floor at east ${east}`);
  }
  spots[0].run();
  assert.equal(stamp, stationTicketStamp.id);
  assert.equal(spots[0].available?.(), false);
  spots[1].run();
  assert.match(description, /列车现在：停靠未写镇站，即将开往火车站前站/);
  assert.ok(railway.board('coaster-station'));
  const initial = railway.timetable();
  now += 25_000;
  railway.update(.06);
  const later = railway.timetable();
  assert.ok(later.metres < initial.metres && later.seconds < initial.seconds);
  spots[1].run();
  assert.match(description, /列车现在：正开往火车站前站/);
  now += Math.ceil(later.seconds * 1_000) + 1;
  railway.update(.06);
  spots[1].run();
  assert.match(description, /火车站前站：列车停靠中 · 请抓紧上下车/);
  spots[2].run();
  assert.equal(title, '全图玩法总台');
  assert.deepEqual(description.split('\n\n').map(section => section.split(' · ')[0]), RAILWAY_STATION_NAMES);
  for (const copy of ['站台东侧有雪橇架', '沿灯路进站厅南门', '沿有灯的林间小道',
    '自由滑行或沿金灯门计时', '到西侧钓位可抛竿', '城堡西门', '浴场西门']) {
    assert.ok(description.includes(copy), `missing wayfinding: ${copy}`);
  }
  assert.deepEqual(railHallGuide.board.split('\n').filter(line => line.includes(' · '))
    .map(line => line.split(' · ')[0]), RAILWAY_STATION_NAMES);
  const hotSpringGuide = '温泉站 · 室外四池泡汤\n西浅汤、东深汤、岩池、雪见池';
  assert.ok(description.includes(hotSpringGuide));
  assert.ok(railHallGuide.board.includes(hotSpringGuide));
});

test('the railway ticket survives reload separately from the core passport reward', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
  try {
    const context = { open, announce() {} };
    const core = [{ id: 'plaza', label: '广场', hint: '' }] as const;
    const originalPassport = createTownPassport(context, core, undefined, [stationTicketStamp]);
    assert.equal(originalPassport.collectExtension(stationTicketStamp.id), true);
    assert.equal(originalPassport.collectExtension(stationTicketStamp.id), false);
    assert.deepEqual(originalPassport.getProgress(), { collected: 0, total: 1, complete: false });
    const restored = createTownPassport(context, core, undefined, [stationTicketStamp]);
    assert.equal(restored.hasExtension(stationTicketStamp.id), true);
    assert.equal(restored.collect('plaza'), true);
    assert.deepEqual(restored.getProgress(), { collected: 1, total: 1, complete: true });
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
