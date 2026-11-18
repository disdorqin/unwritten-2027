import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Vector3 } from 'three';
import {
  createIcePalaceActivity, type IcePalaceActivityAnchors, type IcePalacePoint,
} from '../tools/voxel-tavern/town-blockout/ice-palace-activity.ts';
import { nearestTownActivity, type TownSeat } from '../tools/voxel-tavern/town-blockout/town-activity.ts';

const anchors: IcePalaceActivityAnchors = {
  plate: [0, 0, 0], key: [2, 0, 1], throneDoor: [4, 0, 0], throneSeat: [6, 1.8, 0],
  levers: { pine: [8, 0, 0], sailboat: [10, 0, 0], lighthouse: [12, 0, 0] },
  mirrors: [[14, 0, 0], [16, 0, 0]],
  bells: { low: [18, 24.5, 0], high: [20, 24.5, 0], mid: [22, 24.5, 0] },
  stairExit: [2, 0, 8], vaultLever: [0, 0, 8], vaultExit: [12.5, 0, 8], vaultFinish: [15, 0, 8],
  blocks: [
    { home: [-2, 0, 0], target: [0, 0, 0] },
    { home: [-4, 0, 0], target: [-4, 0, 1.5] },
    { home: [-6, 0, 0], target: [-6, 0, 1.5] },
  ],
  doors: {
    grotto: { min: [.8, 0, .5], max: [1.2, 2.2, 1.5] },
    stair: { min: [2.8, 0, 7.5], max: [3.2, 2.2, 8.5] },
    vault: { min: [11.8, 0, 7.5], max: [12.2, 2.2, 8.5] },
  },
};

function setup() {
  const group = new Group();
  group.position.set(484, 12, -72);
  group.rotation.y = Math.PI / 2;
  let time = 0;
  const names: string[] = [];
  const bells: string[] = [];
  const crowns: boolean[] = [];
  const races: string[] = [];
  let raceCancelled = 0;
  const winterStorage = new Map<string, string>();
  const activity = createIcePalaceActivity(group, anchors, { announce: message => names.push(message) }, {
    now: () => time, playerName: () => '雪友', throneChanged: owned => crowns.push(owned), bellSound: note => bells.push(note),
    storage: { getItem: key => winterStorage.get(key) ?? null, setItem: (key, value) => winterStorage.set(key, value) },
    towerRace: {
      running: false,
      cancel: () => { raceCancelled++; },
      update(x, y, z, grounded) { races.push(`${Math.round(x)}|${y}|${Math.round(z)}|${grounded}`); return '登塔计时'; },
    },
    onRaceStatus: status => races.push(status),
  });

  function point(local: IcePalacePoint) {
    const world = group.localToWorld(new Vector3(...local));
    return { x: world.x, n: -world.z, ground: world.y };
  }
  function walk(t: number, local: IcePalacePoint, delta = 0, seated?: TownSeat, grounded = true) {
    time = t;
    activity.step(delta, { ...point(local), grounded, seated });
  }
  function use(label: string, local: IcePalacePoint, t = time) {
    walk(t, local);
    const { x, n, ground } = point(local);
    const spot = nearestTownActivity(activity.spots, x, n, ground);
    assert.equal(spot?.label, label);
    spot!.run();
  }
  function blocked(local: IcePalacePoint) {
    const { x, n, ground } = point(local);
    return activity.blocked(x, n, ground);
  }

  return { activity, names, bells, crowns, races, raceCancelled: () => raceCancelled, point, walk, use, blocked };
}

test('one player can operate all six world hotspots while the timed door leaves a safe exit', () => {
  const { activity, bells, blocked, use, walk } = setup();
  const grottoGate = [1, 0, 1] as const;
  const vaultGate = [12, 0, 8] as const;

  assert.equal(blocked(grottoGate), true);
  walk(100, [0, .46, 0]);
  assert.equal(activity.state().platePressed, false);
  walk(200, anchors.plate, 0, undefined, false);
  assert.equal(activity.state().platePressed, false);
  walk(300, anchors.plate);
  assert.equal(blocked(grottoGate), false);
  walk(500, [2, 0, 0]);
  walk(1999, [2, 0, 0]);
  assert.equal(activity.state().doors.grotto, true);
  walk(2000, [2, 0, 0]);
  assert.equal(activity.state().doors.grotto, false);

  const homeApproach = [-2, 0, .9] as const;
  use('推雪块', homeApproach);
  walk(2100, homeApproach, .1);
  assert.ok(Math.abs(activity.state().blockPositions[0][0] + 1.4) < 1e-6);
  walk(2400, homeApproach, .3);
  assert.deepEqual(activity.state().blockPositions[0], anchors.plate);
  assert.equal(blocked(grottoGate), false);

  use('拾取冰钥匙', anchors.key);
  use('以冰钥匙开启', anchors.throneDoor);
  use('拉下帆船拉杆', anchors.levers.sailboat);
  assert.equal(activity.state().leverIndex, 0);
  use('拉下雪松拉杆', anchors.levers.pine);
  use('拉下帆船拉杆', anchors.levers.sailboat);
  use('拉下冰灯塔拉杆', anchors.levers.lighthouse);
  assert.equal(activity.state().doors.gallery, true);
  use('转动冰镜 A', anchors.mirrors[0]);
  for (let i = 0; i < 3; i++) use('转动冰镜 B', anchors.mirrors[1]);
  assert.equal(activity.state().doors.mirror, true);
  use('敲响低声冰钟', anchors.bells.low, 3000);
  use('敲响高声冰钟', anchors.bells.high, 4100);
  use('敲响中声冰钟', anchors.bells.mid, 5200);
  assert.deepEqual(bells, ['low', 'high', 'mid']);
  assert.equal(activity.state().doors.stair, true);

  use('拉杆开启宝物间', anchors.vaultLever, 6000);
  assert.equal(blocked(vaultGate), false);
  walk(26000, anchors.vaultExit);
  assert.equal(blocked(vaultGate), true);
  use('从内侧开启出口', anchors.vaultExit);
  assert.equal(blocked(vaultGate), false);
  use('用冰钥匙完成宫殿寻宝', anchors.vaultFinish);
  assert.equal(activity.state().completed, false);
  use('拉杆开启宝物间', anchors.vaultLever, 30000);
  use('用冰钥匙完成宫殿寻宝', anchors.vaultFinish, 42000);
  assert.equal(activity.state().completed, true);
  assert.equal(activity.state().key, true);
});

test('stair interior safety release leaves the bell-locked vault activation untouched', () => {
  const { activity, blocked, use, walk } = setup();
  const exit = activity.spots.find(spot => spot.label === '从内侧开启塔梯密室')!;
  const stairGate = [3, 0, 8] as const;
  walk(1, [3.4, 0, 8]);
  assert.equal(exit.available?.(), false);
  assert.equal(blocked(stairGate), true);
  use(exit.label, anchors.stairExit!, 100);
  assert.equal(blocked(stairGate), false);
  assert.equal(activity.state().stairOpen, false);
  assert.equal(activity.state().vaultOpen, false);
  walk(1600, [3.4, 0, 8]);
  assert.equal(blocked(stairGate), true);
});

test('the actual saved throne seat gates crowning and confirmed hit counts; leaving clears race status', () => {
  const { activity, crowns, names, point, walk, races, raceCancelled } = setup();
  const worldSeat = point(anchors.throneSeat);
  const seat = { x: worldSeat.x, n: worldSeat.n, eyeY: worldSeat.ground, yaw: -Math.PI / 2 };

  walk(0, anchors.throneSeat, 0, { ...seat, x: seat.x + .5 });
  walk(3100, anchors.throneSeat, 0, { ...seat, x: seat.x + .5 });
  assert.equal(activity.state().crowned, false);
  walk(3200, anchors.throneSeat, 0, seat);
  walk(6199, anchors.throneSeat, 0, seat);
  assert.equal(activity.state().crowned, false);
  walk(6200, anchors.throneSeat, 0, seat);
  assert.equal(activity.state().crowned, true);
  activity.confirmedHit();
  activity.confirmedHit();
  assert.equal(activity.state().crowned, true);
  activity.confirmedHit();
  assert.equal(activity.state().crowned, false);
  assert.deepEqual(crowns, [true, false]);
  assert.deepEqual(names, ['雪友 登临冰雪王座', '冰雪之主退位，王座空悬']);

  walk(7000, [3, 4, 5]);
  assert.ok(races.includes('3|4|5|true'));
  assert.equal(races.at(-1), '登塔计时');
  activity.step(0);
  assert.equal(races.at(-1), '');
  assert.ok(raceCancelled() > 0);
});
