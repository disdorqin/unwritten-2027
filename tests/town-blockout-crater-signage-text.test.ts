import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterMouthWorks } from '../tools/voxel-tavern/town-blockout/town-crater-mouth-works';
import { buildCraterOuterWorks } from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';

// The sign() helpers draw their text onto a canvas only when a document
// exists; in Node they silently skip the face. This test installs a minimal
// recording document so the actual painted wording is machine-checked:
// every settled K-text lands verbatim, and no soul name appears on any board
// (the 批58 追补六 blanking invariant — a grep would miss a canvas string).
type Call = { canvas: number; method: string; args: unknown[] };
const calls: Call[] = [];
let canvasSeq = 0;
function recordingCtx(canvasId: number) {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'fillText' || prop === 'strokeRect' || prop === 'fillRect') {
        return (...args: unknown[]) => { calls.push({ canvas: canvasId, method: String(prop), args }); };
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return () => ({ addColorStop: () => {} });
      }
      return () => {};
    },
    set() { return true; },
  });
}
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => {
    const id = ++canvasSeq;
    return { width: 0, height: 0, getContext: () => recordingCtx(id) };
  },
};

const terrain = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
const mouthAnchor = { east: -120, north: 185, rimHeight: 12, yaw: 1.364 };
const mouthRoad = { anchor: mouthAnchor, heightAt: (_east: number, _north: number) => 12 };
buildCraterMouthWorks(mouthRoad);
buildCraterOuterWorks(road);
buildCraterRailExtension(terrain, road);

const texts = calls.filter(c => c.method === 'fillText').map(c => String(c.args[0]));

test('crater signage text: settled K-texts land verbatim (总表为准）', () => {
  for (const expected of [
    // New package (批58 追补六）.
    '坑口补给站', '入坑先登记，领灯一盏。', '出坑销名，灯还灯房。', '值班室',
    '料棚', '封存仓', '矿料', '木料', '渣料',
    // Previous package (批58) — regression: wording must not drift.
    '一号炉 · 冷封', '料不过夜', '校准台', '精密件 · 轻放',
    '北延支线 · 坑口站', '货列过站 · 每班约隔六分半',
    '夜车空驶，亦准点。乘车请至山口站换乘。',
    // Earlier settled boards.
    '冶炼工坊', '仪器工坊', '封存重地 · 非工勿入',
    // Roster fill package (批64 §四): both duty boards take the settled
    // second-line roster names; K-11 roster board is new on the facade.
    '孙长炉', '焦二锤', '罗大年', '田守义', '孙小山',
    '值班表', '一班 陆衡', '二班 周文测', '三班 陆箬',
  ]) assert.ok(texts.includes(expected), `missing sign text: ${expected}`);
});

test('crater signage text: no soul name on any board; rosters filled (批64)', () => {
  for (const t of texts) {
    assert.ok(!t.includes('白望山'), `soul name on a sign: ${t}`);
    assert.ok(!t.includes('石沉'), `soul name on a sign: ${t}`);
  }
  // The smelter duty board keeps its date, both shifts and the trailing 到,
  // with the settled roster names where the blanked slots were (批58 追补六
  // blanking superseded by the 批64 roster): no ruled blank slot remains.
  const dutyCanvas = calls.find(c => c.method === 'fillText' && c.args[0] === '腊月廿三')!.canvas;
  const dutyTexts = calls.filter(c => c.canvas === dutyCanvas && c.method === 'fillText')
    .map(c => String(c.args[0]));
  for (const expected of ['腊月廿三', '一班', '二班', '到', '三班　炉火看住，莫等我——',
    '孙长炉', '焦二锤']) {
    assert.ok(dutyTexts.includes(expected), `duty board missing: ${expected}`);
  }
  const blanks = calls.filter(c => c.canvas === dutyCanvas && c.method === 'strokeRect'
    && Number(c.args[2]) === 180);
  assert.equal(blanks.length, 0, `expected 0 blank name slots after the fill, got ${blanks.length}`);
  // The guard-shed board (K-25) carries all three living guards.
  const guardCanvas = calls.find(c => c.method === 'fillText' && c.args[0] === '班次牌')!.canvas;
  const guardTexts = calls.filter(c => c.canvas === guardCanvas && c.method === 'fillText')
    .map(c => String(c.args[0]));
  for (const expected of ['罗大年', '田守义', '孙小山', '三班 夜里不入']) {
    assert.ok(guardTexts.includes(expected), `guard board missing: ${expected}`);
  }
});
