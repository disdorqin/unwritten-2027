import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIceCastle } from '../tools/voxel-tavern/town-blockout/landmark-ice-castle.ts';
import {
  createCourtyardSeatSpots, createIceThroneSpots, createRailwayStationSpots, stationTicketStamp,
} from '../tools/voxel-tavern/town-blockout/landmark-refinement-activity.ts';
import { buildRailwayStation } from '../tools/voxel-tavern/town-blockout/landmark-station.ts';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownPassport } from '../tools/voxel-tavern/town-blockout/town-passport.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';

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
  let description = '';
  const spots = createRailwayStationSpots(station, {
    open(_title, value) { description = value; return open(); },
  }, railway, {
    hasExtension(id) { return stamp === id; },
    collectExtension(id) { stamp = id; return true; },
  }, canStandAt(station));
  assert.equal(spots.length, 2);
  assert.equal(spots[0].x, 513.3);
  assert.equal(spots[1].x, 538.8);
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
