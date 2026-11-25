import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix4, Raycaster, Vector3, type InstancedMesh } from 'three';
import { buildTowerLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tower.ts';
import { createClocktowerStorySpots, readClocktowerNightLedger } from '../tools/voxel-tavern/town-blockout/clocktower-story.ts';
import { nearestTownActivity, type TownActivitySpot } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { towerDragonSite } from '../tools/voxel-tavern/town-blockout/town-zodiac-sites.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

const epoch = Date.UTC(2026, 10, 20, 6);
const beaconAt = epoch + 75_000, morningBellAt = epoch + 250_000;
const plot = layout.plots.find(({ id }) => id === 'clocktower')!;

test('all 28 casting cells have an unobstructed view from the reached belfry side', () => {
  const tower = buildTowerLandmark(plot);
  const [east, north, height] = plot.origin;
  const { bell } = tower.userData.stops as { bell: [number, number, number] };
  tower.position.set(east, height, -north);
  tower.updateMatrixWorld(true);
  const moving = tower.getObjectByName('Clocktower moving bell') as InstancedMesh;
  const observer = new Vector3(east - 1, height + bell[1] + 1.65, -north + .9);
  const instance = new Matrix4();
  const cells: number[] = [];
  for (let i = 0; i < moving.count; i++) {
    moving.getMatrixAt(i, instance);
    const { x, z } = new Vector3().setFromMatrixScale(instance);
    if (Math.abs(x - 1 / 32) > 1e-6 || Math.abs(z - .026) > 1e-6) continue;
    cells.push(i);
    const center = moving.localToWorld(new Vector3().setFromMatrixPosition(instance));
    const nearest = new Raycaster(observer, center.sub(observer).normalize()).intersectObject(tower)[0];
    assert.ok(nearest?.object === moving && nearest.instanceId === i, `hidden casting cell ${i}`);
  }
  assert.equal(cells.length, 28);
});

test('the night ledger reads the shared trusted snapshot, including fractional client clock reads', () => {
  let time = epoch + .25;
  let phase: 'day' | 'awaiting-beacon' | 'night-window' = 'day';
  const host = { now: () => time, nightWindow: () => ({ phase, beaconAt, morningBellAt }) };
  assert.deepEqual(readClocktowerNightLedger(host), {
    bellTime: '14:01:15', morningTime: '14:04:10', openingObserved: false,
  });
  time = beaconAt + 400;
  phase = 'awaiting-beacon';
  assert.equal(readClocktowerNightLedger(host)?.openingObserved, false);
  phase = 'night-window';
  assert.equal(readClocktowerNightLedger(host)?.openingObserved, true);
  time = morningBellAt;
  assert.equal(readClocktowerNightLedger(host), undefined);
  assert.equal(readClocktowerNightLedger({ now: () => epoch, nightWindow: () => undefined }), undefined);
});

test('reading both books and facing the watch point never write the clock or fabricate a beacon', () => {
  const tower = buildTowerLandmark(plot);
  const [east, north, height] = plot.origin;
  tower.position.set(east, height, -north);
  let panel: string[] | undefined;
  let facing: number[] | undefined;
  let watch = 0, nightRead = 0;
  let ready = false;
  const spots = createClocktowerStorySpots(tower, {
    open: (...copy) => { panel = copy; return {} as HTMLElement; },
    face: (...target) => { facing = target.filter(value => typeof value === 'number'); },
  }, {
    now: () => epoch + 20_000.25,
    nightWindow: () => ready ? { phase: 'day', beaconAt, morningBellAt } : undefined,
    atNightLedger: () => { nightRead++; },
    atWatchPoint: () => { watch++; },
  });
  const [ordinary, night, lookout] = spots;
  ordinary.run();
  assert.deepEqual(panel, ['活人账', '日常报时 · 14:00:00　下一整点 · 15:00:00']);
  night.run();
  assert.deepEqual(panel, ['魂账', '第十三声时刻未同步。']);
  assert.equal(nightRead, 0);
  ready = true;
  night.run();
  assert.deepEqual(panel, ['魂账', '第十三声预计 · 14:01:15　晨钟 · 14:04:10']);
  assert.equal(nightRead, 1);
  lookout.run();
  assert.equal(watch, 1);
  assert.equal(facing?.[0], lookout.x);
  assert.ok(facing![1] < lookout.n && facing![2] > lookout.ground);
  assert.deepEqual(tower.position.toArray(), [east, height, -north]);
});

test('the repair room books are reachable by the main entrance without modifying the spiral stairs', () => {
  const tower = buildTowerLandmark(plot);
  const [east, north, height] = plot.origin;
  tower.position.set(east, height, -north);
  const [ordinary, night] = createClocktowerStorySpots(tower,
    { open: () => ({} as HTMLElement), face() {} }, { now: () => epoch, nightWindow: () => undefined });
  const { colliders, floors } = readWalkGeometry(tower);
  const grid = createTerrainGrid();
  let [x, n] = layout.plaza.spawn;
  let currentGround = grid.heightAt(x, n);
  const intersects = (xx: number, nn: number, { min, max }: typeof floors[number]) =>
    Math.hypot(Math.max(min[0] - xx, xx - max[0], 0), Math.max(min[2] + nn, -nn - max[2], 0)) < .27;
  for (const [toX, toN] of [
    [226, 212], [226, 216], [226, 223], [218.2, 223], [218.2, ordinary.n], [ordinary.x, ordinary.n], [night.x, night.n],
  ]) {
    const count = Math.ceil(Math.hypot(toX - x, toN - n) / .12);
    for (let i = 1; i <= count; i++) {
      const xx = x + (toX - x) * i / count, nn = n + (toN - n) * i / count;
      assert.ok(canEnter(xx, nn));
      const base = grid.heightAt(xx, nn);
      const nextFloor = Math.max(base, ...floors.filter(box => box.max[1] <= currentGround + .43 && intersects(xx, nn, box))
        .map(box => box.max[1]));
      assert.ok(Math.abs(nextFloor - currentGround) <= .43, `step at E${xx} N${nn}: ${currentGround} → ${nextFloor}`);
      assert.ok(!colliders.some(box => nextFloor + .025 < box.max[1] && nextFloor + 1.775 > box.min[1]
        && intersects(xx, nn, box)), `blocked at E${xx} N${nn}`);
      currentGround = nextFloor;
    }
    x = toX;
    n = toN;
    if (x === ordinary.x) assert.equal(nearestTownActivity([ordinary, night], x, n, currentGround), ordinary);
    if (x === night.x) assert.equal(nearestTownActivity([ordinary, night], x, n, currentGround), night);
  }
});

test('the watch plate leaves the full dragon and photo interaction zones available', () => {
  const tower = buildTowerLandmark(plot);
  const [east, north, height] = plot.origin;
  tower.position.set(east, height, -north);
  const [, , watch] = createClocktowerStorySpots(tower,
    { open: () => ({} as HTMLElement), face() {} }, { now: () => epoch, nightWindow: () => undefined });
  const { lookout } = tower.userData.stops as { lookout: [number, number, number] };
  const dragonSite = towerDragonSite(lookout);
  const spot = ([x, y, z]: readonly [number, number, number], range: number, label: string): TownActivitySpot =>
    ({ x: east + x, n: north - z, ground: height + y, range, label, run() {} });
  const dragon = spot(dragonSite.stand, dragonSite.range, '拾取生肖挂件 · 龙');
  const photo = spot(lookout, 1.3, '保存钟楼取景');
  const activities = [watch, dragon, photo];
  for (const action of [dragon, photo]) {
    assert.ok(Math.hypot(watch.x - action.x, watch.n - action.n) > watch.range + action.range);
    assert.equal(nearestTownActivity(activities, action.x, action.n, action.ground), action);
  }
  assert.equal(nearestTownActivity(activities, east, photo.n, photo.ground), photo);
  assert.equal(nearestTownActivity(activities, watch.x, watch.n, watch.ground), watch);
});
