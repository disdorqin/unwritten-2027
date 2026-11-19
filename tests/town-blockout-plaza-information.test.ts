import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import {
  createPlazaInformationActivity, plazaInformationSites, readPlazaCountdown, readPlazaInformation,
  type PlazaInformationSources,
} from '../tools/voxel-tavern/town-blockout/plaza-information-activity.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { ceremonyMidnight } from '../tools/voxel-tavern/town-blockout/town-ceremony.ts';

const offset = 480;
const midnight = ceremonyMidnight(2026, offset);

function informationFixture() {
  let now = midnight - 601_000;
  let names: readonly string[] | undefined = ['北风', '雪团'];
  let train = { seconds: 42.01, atPlatform: false };
  let stage = '演出进行中 · 第二幕 · 双影踏雪';
  let snowFight = false;
  let wish: string | undefined = '愿你一路\n都有灯';
  const sources: PlazaInformationSources = {
    clock: { now: () => now, utcOffsetMinutes: offset },
    train: () => train,
    roster: () => names,
    stage: time => { assert.equal(time, now); return stage; },
    formalSnowFight: () => snowFight,
    latestWish: () => wish,
  };
  return {
    sources,
    setNow(value: number) { now = value; },
    setRoster(value: readonly string[] | undefined) { names = value; },
    setTrain(value: typeof train) { train = value; },
    setPlaying(value: string) { stage = value; },
    setSnowFight(value: boolean) { snowFight = value; },
    setWish(value: string | undefined) { wish = value; },
  };
}

test('the four original plaza board cells read their injected sources on every refresh', () => {
  const fixture = informationFixture();
  const read = () => readPlazaInformation(fixture.sources);
  const initial = read();
  assert.deepEqual(initial.split('\n\n').map(cell => cell.split('\n')[0]), ['镇况', '列车', '今晚', '许愿']);
  assert.match(initial, /同镇 2 人\n北风、雪团/);
  assert.match(initial, /下一班环镇列车约 0 分 43 秒 后到站\n未写镇站/);
  assert.match(initial, /今晚\n演出进行中 · 第二幕 · 双影踏雪/);
  assert.match(initial, /许愿\n愿你一路 都有灯/);

  fixture.setRoster(Array.from({ length: 8 }, (_, index) => `镇民${index}`));
  assert.match(read(), /同镇 8 人\n镇民0、镇民1/);
  fixture.setRoster(Array.from({ length: 9 }, (_, index) => `镇民${index}`));
  fixture.setTrain({ seconds: 0, atPlatform: true });
  fixture.setPlaying('演出进行中 · 第三幕 · 梅雪独舞');
  fixture.setSnowFight(true);
  fixture.setWish('☃️'.repeat(20) + '🏮'.repeat(40));
  const refreshed = read();
  assert.match(refreshed, /同镇 9 人\n\n列车\n环镇列车停靠中/);
  assert.doesNotMatch(refreshed, /镇民0/);
  assert.match(refreshed, /第三幕 · 梅雪独舞 · 广场正式雪仗进行中/);
  assert.match(refreshed, /许愿\n[^\n]+…\n/u);
  fixture.setWish(undefined);
  fixture.setRoster(undefined);
  assert.match(read(), /在线名册尚未连接/);
  assert.match(read(), /许愿树还没有祝福/);
});

test('ceremony time from the same offset clock drives both countdowns', () => {
  const fixture = informationFixture();
  const read = () => readPlazaCountdown(fixture.sources.clock);
  fixture.setNow(midnight - 90_000_000);
  assert.equal(read(), '距跨年 2 天');
  fixture.setNow(midnight - 3_660_000);
  assert.equal(read(), '距跨年 1 小时 1 分');
  fixture.setNow(midnight - 601_000);
  assert.equal(read(), '距跨年 10 分 01 秒');
  assert.match(readPlazaInformation(fixture.sources), /今晚\n演出进行中/);
  fixture.setNow(midnight - 600_000);
  assert.equal(read(), '距跨年 600 秒');
  assert.match(readPlazaInformation(fixture.sources), /今晚\n距跨年 600 秒/);
  fixture.setNow(midnight - 500);
  const last = readPlazaInformation(fixture.sources);
  assert.equal(read(), '距跨年 1 秒');
  assert.match(last, /今晚\n距跨年 1 秒/);
  assert.match(last, /镇况\n同镇 2 人/);
  assert.match(last, /许愿\n愿你一路 都有灯/);
  fixture.setNow(midnight);
  assert.equal(read(), '新年快乐！');
  assert.match(readPlazaInformation(fixture.sources), /今晚\n新年快乐！/);
});

test('both board approaches and the countdown approach are on actual clear plaza ground', t => {
  const grid = createTerrainGrid();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
    }) }) },
  });
  let scenery: ReturnType<typeof addScenery>;
  try {
    scenery = addScenery(new Group(), grid);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const { sources, setNow } = informationFixture();
  const canStand = (x: number, n: number, ground: number) =>
    !isWater(x, n) && !scenery.blocked(x, n) && grid.heightAt(x, n) === ground;
  const opened: Array<{ title: string; read(): string }> = [];
  const { spots } = createPlazaInformationActivity((title, read) => opened.push({ title, read }),
    sources, grid.heightAt, canStand);
  assert.equal(spots.length, 3);
  const { board, countdown } = plazaInformationSites;
  assert.ok(scenery.blocked(board.x, board.n));
  assert.ok(scenery.blocked(countdown.x, countdown.n));
  let checks = 0;
  for (const spot of spots) {
    assert.equal(spot.ground, 12);
    assert.equal(nearestTownActivity(spots, spot.x, spot.n, spot.ground), spot);
    for (let index = 0; index < 16; index++) {
      const angle = index / 16 * Math.PI * 2;
      assert.ok(canStand(spot.x + Math.sin(angle) * spot.range, spot.n + Math.cos(angle) * spot.range, spot.ground));
      checks++;
    }
    const towards = spot.n > board.n ? 1 : -1;
    for (let index = 1; index <= 13; index++) {
      assert.ok(canStand(spot.x, spot.n + towards * index * .1, spot.ground));
      checks++;
    }
    spot.run();
  }
  assert.equal(spots[0].x, countdown.x);
  assert.equal(spots[0].n, countdown.stand);
  assert.deepEqual(opened.map(({ title }) => title), ['跨年倒计时', '广场公告板', '广场公告板']);
  setNow(midnight - 9000);
  assert.equal(opened[0].read(), '距跨年 9 秒');
  assert.equal(opened[1].read(), opened[2].read());
  assert.match(opened[2].read(), /今晚\n距跨年 9 秒/);
  assert.equal(createPlazaInformationActivity(() => {}, sources, grid.heightAt,
    (x, n) => x !== board.x || n < board.n).spots.length, 2);
  t.diagnostic(`checked ${checks} ground and collision points across three approaches`);
});
