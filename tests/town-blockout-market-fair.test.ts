import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Mesh, Ray, Vector3 } from 'three';
import { buildMarketLandmark, marketOxSite } from '../tools/voxel-tavern/town-blockout/landmark-market.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import {
  HawkingBoard, MARKET_BUBBLE_LIMIT, MARKET_HAWK_RADIUS, TASTING_DAILY_LIMIT,
  loadTastingLedger, localDateKey, marketStalls, tasteOnce,
  type TastingStorage,
} from '../tools/voxel-tavern/town-blockout/market-fair.ts';
import { nearestTownActivity, type TownActivitySpot } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { canEnter, createTerrainGrid, isWater, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

// 台词溯源集：以下 18 条逐字抄自《集市重点建设方案-v1》§4.3、9 条逐字抄自《集市试吃打烊句-v1》。
// 本测试断言切片用到的每一句都落在这两个来源集内（不得自创）。
const hawkingSource = new Set([
  '热乎的烤肠哎——刚出炉，趁热吃！', '炸串炸串，十串管饱，路过别错过！',
  '冰糖葫芦——酸酸甜甜，山楂裹糖稀！', '糖葫芦嘞，小孩吃了乐，大人吃了甜！',
  '热姜茶，喝一碗，雪夜里不冷手！', '羊汤滚烫，加个饼，暖到心里头！',
  '灯笼灯笼，红的亮的，挂门口喜庆一整年！', '手工扎的灯笼，经风经雪，瞧一瞧看一看！',
  '针头线脑小百货，家里缺啥我这有！', '清仓啦清仓啦，年底大甩卖，手快有手慢无！',
  '新到的围巾手套，软和！给媳妇孩子捎一条！', '花布头子便宜卖，做件新衣裳过年啦！',
  '现炒的瓜子花生，嗑着看烟花，美！', '糖炒栗子，热乎着呢，剥一个尝尝不要钱！',
  '套圈套圈，一块钱的乐呵，套中啥拿啥！', '拨浪鼓、泥哨子，孩子见了走不动道！',
  '春联年画，福字到家——现写现卖，墨还没干！', '写对联嘞，您出句，我落笔！',
]);
const closingSource = new Set([
  '锅都见底啦——明儿赶早，头一串留给你！',
  '今儿这锅糖稀熬完啦，想吃明儿请早，最亮的那串给你留着！',
  '汤锅都刷干净咯——明儿头一碗，先紧着你盛！',
  '试点的灯笼都让人挑走啦，明儿新扎的到了，再来掌眼！',
  '样品都试完啦——明儿补了货，您头一个上手！',
  '样巾都摸热乎咯，明儿新货到，您先挑花色！',
  '尝鲜的小碟空啦——明儿新炒一锅，头把瓜子给你抓！',
  '试玩的圈儿都套走咯，明儿补齐了，您头一个上手！',
  '试写的红纸用完啦——明儿墨研足了，头一副给您写！',
]);

function fakeStorage(): TastingStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    read: () => map.get('k') ?? null,
    write: value => { map.set('k', value); },
  };
}

test('market stalls keep published coordinates, stable tasting IDs, and sourced lines', () => {
  // 第五轮联审裁决登记的四个摊位。
  const expected = [
    { localX: -12.5, localZ: -4.8, canopy: '#a1342d', kind: '糖葫芦' },
    { localX: -4.38, localZ: -4.4, canopy: '#92562e', kind: '干果炒货' },
    { localX: 4.25, localZ: -4.95, canopy: '#8a312d', kind: '吃食' },
    { localX: 12.4, localZ: -4.6, canopy: '#2e6a67', kind: '热饮' },
  ];
  const plot = layout.plots.find(({ id }) => id === 'market-stalls')!;
  assert.equal(marketStalls.length, 4);
  marketStalls.forEach((stall, index) => {
    const want = expected[index];
    assert.equal(stall.id, `market-stall-${index}`);
    assert.equal(stall.canopy, want.canopy);
    assert.equal(stall.kind, want.kind);
    assert.ok(Math.abs(stall.east - (plot.origin[0] + want.localX)) < 1e-9);
    assert.ok(Math.abs(stall.north - (plot.origin[1] - want.localZ)) < 1e-9);
    assert.equal(stall.hawking.length, 2);
    for (const line of stall.hawking) assert.ok(hawkingSource.has(line), `unsourced hawking: ${line}`);
    assert.ok(closingSource.has(stall.closing), `unsourced closing: ${stall.closing}`);
  });
});

test('the market entrance signs and four live banners share one atlas without changing tasting spots', t => {
  const bannerTitles: string[] = [];
  const entranceSigns: string[] = [];
  let bannerTitle = '';
  // 记录幌子 atlas 入图前写入的竖排文字。
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        fillRect() {}, strokeRect() {}, drawImage() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        fillText(value: string) {
          if (value === '河畔年集' || value === '爆竹声中一岁除') entranceSigns.push(value);
          if (value.length === 1) {
            bannerTitle += value;
            if (bannerTitle.length === 4) {
              bannerTitles.push(bannerTitle);
              bannerTitle = '';
            }
          }
        },
      }),
    }),
  } as unknown as Document;
  t.after(() => {
    if (previousDocument) globalThis.document = previousDocument;
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const plot = layout.plots.find(({ id }) => id === 'market-stalls')!;
  const terrain = createTerrainGrid();
  const group = buildMarketLandmark(plot);
  const batches = group.children.filter((child): child is Mesh =>
    (child as Mesh).isMesh && child.name === 'Museum sign atlas');
  assert.equal(batches.length, 1);
  assert.equal(batches[0].geometry.index?.count, 36);
  assert.deepEqual(entranceSigns, ['河畔年集', '爆竹声中一岁除']);
  assert.deepEqual(bannerTitles, ['冰糖葫芦', '炒货干果', '热乎吃食', '热汤姜茶']);
  group.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const { colliders } = readWalkGeometry(group);
  assert.equal(colliders.length, 39);
  const bodyRadius = .27;
  const spots: TownActivitySpot[] = marketStalls.map(stall => ({
    x: stall.spot.x, n: stall.spot.n, ground: stall.spot.ground, range: stall.spot.range,
    label: `试吃${stall.kind}`, run: () => {},
  }));
  marketStalls.forEach((stall, index) => {
    const spot = spots[index];
    // 地面高度与 spot.ground 一致（实测地块内为 10）。
    assert.ok(Math.abs(terrain.heightAt(spot.x, spot.n) - spot.ground) < 1e-9);
    // 身体（半径 .27）不与任何与身高相交的碰撞盒重叠（场景坐标 z = -北）。
    for (const box of colliders) {
      if (box.min[1] >= spot.ground + 1.8 || box.max[1] <= spot.ground) continue;
      const insideX = spot.x > box.min[0] - bodyRadius && spot.x < box.max[0] + bodyRadius;
      const insideZ = -spot.n > box.min[2] - bodyRadius && -spot.n < box.max[2] + bodyRadius;
      assert.ok(!(insideX && insideZ), `spot ${index} collides with box ${JSON.stringify(box)}`);
    }
    // 站在站位上时，活动框架选中的正是本摊。
    assert.equal(nearestTownActivity(spots, spot.x, spot.n, spot.ground), spot);
  });

  assert.equal(group.userData.zodiacOx, marketOxSite);
  const stand = group.localToWorld(new Vector3(...marketOxSite.stand));
  const object = group.localToWorld(new Vector3(...marketOxSite.object));
  function clearGround(x: number, n: number) {
    assert.ok(canEnter(x, n) && !isWater(x, n));
    assert.equal(terrain.heightAt(x, n), stand.y);
    assert.ok(!colliders.some(({ min, max }) =>
      max[1] > stand.y + .025 && min[1] < stand.y + 1.775 &&
      Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < bodyRadius,
    ), `hay annex approach blocked at E${x}/N${n}`);
  }
  const route = [[153.86, 98.5], [153.86, -stand.z], [stand.x, -stand.z]];
  for (let step = 1; step < route.length; step++) {
    const [x, n] = route[step - 1], [endX, endN] = route[step];
    const count = Math.ceil(Math.hypot(endX - x, endN - n) / .05);
    for (let i = 0; i <= count; i++) clearGround(x + (endX - x) * i / count, n + (endN - n) * i / count);
  }
  for (const radius of [0, .10, .20, .30, marketOxSite.range]) {
    for (let arc = 0; arc < 32; arc++) {
      const angle = Math.PI * arc / 16;
      const x = stand.x + Math.cos(angle) * radius, n = -stand.z + Math.sin(angle) * radius;
      clearGround(x, n);
      assert.ok(spots.every(spot => Math.hypot(spot.x - x, spot.n - n) - spot.range >= 1.5));
    }
  }
  const sightIsClear = (eye: Vector3) => {
    const ray = new Ray(eye, object.clone().sub(eye).normalize());
    const reach = eye.distanceTo(object);
    return !colliders.some(({ min, max }) => {
      const hit = ray.intersectBox(new Box3(new Vector3(...min), new Vector3(...max)), new Vector3());
      return hit && eye.distanceTo(hit) < reach;
    });
  };
  assert.ok(sightIsClear(stand.clone().add(new Vector3(0, 1.62, 0))));
  assert.ok(!sightIsClear(new Vector3(stand.x, stand.y + 1.62, -107)));
});

test('hawking board rotates lines, caps bubbles at two, and resets out of range', () => {
  const board = new HawkingBoard(marketStalls, () => .5);
  const [first] = marketStalls;
  // 站在 0 号摊中心：1 号摊相距约 8.1 m 也在 12 m 半径内，两摊同屏（恰为上限 2）。
  // 刚进入半径时不立即亮（首亮延迟 .6–1.4 s），随后最近的 0 号摊亮出词条 1。
  assert.deepEqual(board.frame(0, first.east, first.north), []);
  const shown = board.frame(1.1, first.east, first.north);
  assert.equal(shown.length, MARKET_BUBBLE_LIMIT);
  assert.equal(shown[0].stall, 0);
  assert.equal(shown[0].text, first.hawking[0]);
  // 显示期内保持同一条；熄灭后进入 4–7 s 间隔；再亮时轮换到词条 2。
  assert.equal(board.frame(2, first.east, first.north)[0]?.text, first.hawking[0]);
  assert.deepEqual(board.frame(4.7, first.east, first.north), []);
  const rotated = board.frame(10.2, first.east, first.north);
  assert.equal(rotated[0].stall, 0);
  assert.equal(rotated[0].text, first.hawking[1]);
  // 离开半径：无气泡；回来重新计时。
  assert.deepEqual(board.frame(11, 0, 0), []);
  // 三摊同时在半径内扫 30 s：任何一帧 ≤ 2 个气泡，且只出在半径内的摊。
  const mid = { x: 150, n: 107 };
  for (let t = 11; t < 41; t += .25) {
    const frames = board.frame(t, mid.x, mid.n);
    assert.ok(frames.length <= MARKET_BUBBLE_LIMIT, `t=${t} frames=${frames.length}`);
    for (const frame of frames) {
      const stall = marketStalls[frame.stall];
      assert.ok(Math.hypot(mid.x - stall.east, mid.n - stall.north) <= MARKET_HAWK_RADIUS);
    }
  }
  // 强制吆喝（试吃反馈/打烊句）立即占位且内容为准。
  board.shout(2, marketStalls[2].closing, 50);
  const forced = board.frame(50.1, mid.x, mid.n);
  assert.ok(forced.some(frame => frame.stall === 2 && frame.text === marketStalls[2].closing));
});

test('tasting ledger serves three per stall per day, then closes, and resets next day', () => {
  const storage = fakeStorage();
  const day1 = new Date(2026, 11, 31, 20, 0);
  const day2 = new Date(2027, 0, 1, 9, 0);
  assert.equal(localDateKey(day1), '2026-12-31');
  // 四个摊逐一自测：前 3 次 served、第 4 次 closed，计数互不干扰。
  marketStalls.forEach((_, index) => {
    for (let attempt = 1; attempt <= TASTING_DAILY_LIMIT; attempt++) {
      assert.deepEqual(tasteOnce(storage, marketStalls.length, index, day1),
        { served: true, count: attempt });
    }
    assert.deepEqual(tasteOnce(storage, marketStalls.length, index, day1),
      { served: false, count: TASTING_DAILY_LIMIT });
  });
  // 次日清零；存储损坏时按新账本处理。
  assert.deepEqual(tasteOnce(storage, marketStalls.length, 0, day2), { served: true, count: 1 });
  storage.map.set('k', '{broken json');
  assert.deepEqual(loadTastingLedger(storage, marketStalls.length, day2).counts, [0, 0, 0, 0]);
});
