import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferGeometry, Points, Scene } from 'three';
import { createCeremonyFrost, createFrostTracker, frostLevelStyles, isExposedSnowAt, sampleFrostStyle, wetColdMultiplier } from '../tools/voxel-tavern/town-blockout/town-frost';
import { campfirePieces, createTownCampfires, findRegionalCampfires, fireWarmthRadius, nearCampfire } from '../tools/voxel-tavern/town-blockout/town-campfires';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { roadCorridorKeepClear } from '../tools/voxel-tavern/town-blockout/road-clearance';
import { createTownSnowCover } from '../tools/voxel-tavern/town-blockout/town-snow-cover';

test('river contact is twice exposed dry-snow pressure; ordinary light stops and melts exposure slowly', () => {
  const dry = createFrostTracker(), wet = createFrostTracker();
  dry.setExposure(3, 0, 'dark-snow', false);
  wet.setExposure(3, 0, 'water', false);
  assert.equal(wetColdMultiplier, 2);
  const secondsPerWetLevel = 135 / wetColdMultiplier;
  for (const level of [1, 2, 3]) {
    assert.equal(dry.update(135), level);
    assert.equal(wet.update(secondsPerWetLevel), level);
  }
  assert.equal(dry.walkingScale(), .65);
  dry.setExposure(3, 0, 'lamp', false);
  assert.equal(dry.update(120), 2);
  assert.equal(dry.walkingScale(), .90);
  dry.setWarmth('fire-source', true);
  assert.equal(dry.update(10), 0);
  assert.equal(dry.walkingScale(), 1);

  const lightSnow = createFrostTracker();
  lightSnow.setExposure(1, 0, 'dark-snow', false);
  assert.equal(lightSnow.update(600), 0);
  lightSnow.setExposure(1, 0, 'water', false);
  assert.equal(lightSnow.update(135), 1);
});

test('snow contact excludes paving and upper floors without changing depth scaling', () => {
  const grid = createTerrainGrid();
  const snow = createTownSnowCover(grid);
  const coldAt = (x: number, n: number) => isExposedSnowAt(grid, x, n, grid.heightAt(x, n));
  assert.equal(coldAt(223, 180), false);
  assert.equal(coldAt(240, 217), true);
  assert.equal(isExposedSnowAt(grid, 240, 217, grid.heightAt(240, 217) + 2), false);
  assert.equal(isExposedSnowAt(grid, 240, 217, grid.heightAt(240, 217), () => true), false);
  assert.equal(snow.movementScale(223, 180, grid.heightAt(223, 180)), 1);
});

test('frost feather, scene-only blur and melt-film interpolate while the shared movement effect clears', () => {
  const styles = new Map<string, string>();
  const parts = new Map(['.frost-edges', '.frost-tint', '.frost-breath', '.frost-melt'].map(key =>
    [key, { style: { opacity: '' }, hidden: false }]));
  const root = {
    hidden: false, dataset: { level: '' }, querySelector: (selector: string) => parts.get(selector) ?? null,
    style: { setProperty: (key: string, value: string) => styles.set(key, value) },
  };
  const scene = { style: { filter: '' } };
  const notes: string[] = [];
  const frost = createCeremonyFrost(root as unknown as HTMLElement, {
    scene: scene as unknown as HTMLElement,
    announce: text => notes.push(text),
  });
  frost.setExposure(4, 0, 'dark-snow', false);
  frost.update(90);
  assert.equal(root.dataset.level, '1');
  assert.equal(scene.style.filter, '');
  frost.update(90);
  assert.equal(root.dataset.level, '2');
  assert.match(scene.style.filter, /^blur\(2px\)$/);
  const middleMask = styles.get('--frost-clear');
  frost.update(90);
  assert.equal(root.dataset.level, '3');
  assert.equal(scene.style.filter, 'blur(4.8px)');
  assert.ok(parseFloat(styles.get('--frost-clear')!) < parseFloat(middleMask!));
  assert.equal(frost.walkingScale(), .65);
  assert.ok(Math.abs(sampleFrostStyle(2.1).clearPercent - 56.2) < 1e-9);

  frost.setWarmth('fire-source', true);
  frost.update(5);
  assert.equal(frost.walkingScale(), .90);
  assert.ok(parseFloat(parts.get('.frost-melt')!.style.opacity) > 0);
  assert.notEqual(styles.get('--frost-clear'), '40%');
  assert.notEqual(scene.style.filter, 'blur(4.8px)');
  frost.update(10);
  assert.equal(scene.style.filter, '');
  assert.equal(frost.walkingScale(), 1);
  frost.update(1);
  assert.equal(root.hidden, true);
  assert.deepEqual(notes, ['冷得迈不开步了——找个火堆烤烤火。', '身上暖和过来了。']);
});

test('outdoor fire geometry is never created at a rejected site and shares a bounded flame pool', () => {
  const accept = findRegionalCampfires((_, __, fixed) => fixed ?? 12);
  assert.equal(accept.length, 5);
  assert.equal(findRegionalCampfires(() => undefined).length, 0);
  const site = accept[0];
  assert.equal(nearCampfire(accept, site.x + fireWarmthRadius, site.n, site.ground), true);
  assert.equal(nearCampfire(accept, site.x + fireWarmthRadius + .01, site.n, site.ground), false);
  assert.equal(nearCampfire(accept, site.x, site.n, site.ground + 1.5), false);
  assert.ok(site.seats.length >= 2 && site.seats.length <= 4);
  for (const fire of accept) {
    assert.equal(roadCorridorKeepClear(fire.x, fire.n, fire.style === 'stone' ? 1 : .81), false);
    for (const seat of fire.seats) assert.equal(roadCorridorKeepClear(seat.x, seat.n, .61), false);
  }
  assert.ok(campfirePieces(accept).length * 12 < 2200);

  const scene = new Scene();
  const campfires = createTownCampfires(scene, { sit: () => {} }, accept);
  assert.equal(scene.children.length, 1);
  const flames = scene.children[0] as Points<BufferGeometry>;
  campfires.updateFlames(.1, site.x, site.n, false);
  assert.equal(flames.geometry.drawRange.count, accept.length + 48);
  campfires.updateFlames(.1, 0, 0, false);
  assert.equal(flames.geometry.drawRange.count, accept.length);
  campfires.updateFlames(.1, 0, 0, true);
  assert.equal(flames.visible, false);
  assert.equal(campfires.blocked?.(site.x, site.n, site.ground), true);
  for (const seat of accept.flatMap(fire => fire.seats)) {
    assert.equal(campfires.blocked?.(seat.x, seat.n, seat.ground), true);
    assert.equal(campfires.blocked?.(seat.approach.x, seat.approach.n, seat.approach.ground), false);
  }
});

test('H1 frost tiers deepen monotonically past the B5 presentation values', () => {
  const levels = [1, 2, 3] as const;
  const sampled = levels.map(level => sampleFrostStyle(level));
  // 覆盖更深：屏心透亮比例逐档收窄（B5 旧值 83 / 73 / 62）。
  assert.deepEqual(sampled.map(style => style.clearPercent), [74, 58, 40]);
  // 模糊更强：逐档严格增加（B5 旧值 0 / 1.15 / 3.2）。
  assert.deepEqual(sampled.map(style => style.blur), [0, 2, 4.8]);
  // 霜纹不透明度、霜带、冷色片逐档加重（B5 旧值 .25/.5/.75、.06/.12/.22、0/.08/.14）。
  assert.deepEqual(levels.map(level => frostLevelStyles[level].opacity), [.35, .65, .90]);
  assert.deepEqual(levels.map(level => frostLevelStyles[level].band), [.10, .20, .34]);
  assert.deepEqual(levels.map(level => frostLevelStyles[level].tint), [.04, .13, .22]);
  for (let index = 1; index < sampled.length; index++) {
    assert.ok(sampled[index].opacity > sampled[index - 1].opacity);
    assert.ok(sampled[index].band > sampled[index - 1].band);
  }
});

test('H1 level-3 walking floor is ×0.65 and the deep-snow stack bottoms at ×0.403', () => {
  const tracker = createFrostTracker();
  tracker.setExposure(3, .6, 'dark-snow', false);
  assert.equal(tracker.update(270), 3);
  assert.equal(tracker.walkingScale(), .65);
  // 与深雪共用 moveScale 槽位：最坏叠加 = 深雪 ×0.62 × 寒意 ×0.65。
  assert.ok(Math.abs(.62 * tracker.walkingScale() - .403) < 1e-10);
  // 仪式豁免仍把 L3 拖速封顶在 ×0.90，L2 不变。
  tracker.setExposure(4, 0, 'dark-snow', true);
  assert.equal(tracker.walkingScale(), .90);
});

test('H1 sledding exemption: exposure never rises on snow or water and recedes while sledding', () => {
  const sled = createFrostTracker();
  sled.setExposure(4, .6, 'dark-snow', false, 1, true);
  assert.equal(sled.update(270), 0);
  sled.setExposure(3, 0, 'water', false, 1, true);
  assert.equal(sled.update(135), 0);

  const rider = createFrostTracker();
  rider.setExposure(3, 0, 'dark-snow', false);
  assert.equal(rider.update(270), 2);
  rider.setExposure(3, 0, 'dark-snow', false, 1, true);
  // 乘橇反退：按自然消退速率 1/120 回落，120 秒退 1 级。
  assert.ok(Math.abs(rider.update(120) - 1) < 1e-9);
  assert.equal(rider.walkingScale(), 1);
  // 下橇后同一入口恢复正常累积。
  rider.setExposure(3, 0, 'dark-snow', false);
  assert.ok(Math.abs(rider.update(135) - 2) < 1e-9);
  assert.equal(rider.walkingScale(), .90);
});
