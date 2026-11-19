import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferGeometry, Points, Scene } from 'three';
import { createCeremonyFrost, createFrostTracker, isExposedSnowAt, sampleFrostStyle, wetColdMultiplier } from '../tools/voxel-tavern/town-blockout/town-frost';
import { campfirePieces, createTownCampfires, findRegionalCampfires, fireWarmthRadius, nearCampfire } from '../tools/voxel-tavern/town-blockout/town-campfires';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { roadCorridorKeepClear } from '../tools/voxel-tavern/town-blockout/road-clearance';
import { createTownSnowCover } from '../tools/voxel-tavern/town-blockout/town-snow-cover';

const atFrostLevel = [0.5, 1, 2, 3] as const;
const frostFrame = 1 / 60;

function assertNear(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

for (const [label, intensity, depth, expected] of [
  ['weak shallow (1)', 1, 0, [100, 200, 400, 600]],
  ['ordinary shallow (2)', 2, .599, [75, 150, 300, 450]],
  ['ordinary deep (2)', 2, .6, [50, 100, 200, 300]],
  ['acceptance deep (3)', 3, .6, [40, 80, 160, 240]],
  ['strong deep (4)', 4, .6, [100 / 3, 200 / 3, 400 / 3, 200]],
] as const) {
  test(`standing in ${label} snow reaches all frost thresholds at the specified rate`, () => {
    const frost = createFrostTracker();
    frost.setExposure(intensity, depth, 'dark-snow', false);
    let frames = 0;
    for (const [index, target] of atFrostLevel.entries()) {
      while (frost.personal() < target && frames * frostFrame < expected[index] + 1) {
        frost.update(frostFrame);
        frames++;
      }
      assert.ok(frost.personal() >= target);
      assertNear(frames * frostFrame, expected[index], frostFrame + 1e-9);
      if (target === .5) {
        assert.equal(frost.displayLevel(), 1);
        assert.equal(frost.walkingScale(), .95);
      }
    }
  });
}

test('weak snow begins exposure at strength 1, while lamps and cleared roads thaw at all snow strengths', () => {
  const frost = createFrostTracker();
  frost.setExposure(.999, .6, 'dark-snow', false);
  assert.equal(frost.update(200), 0);
  frost.setExposure(1, 0, true, false);
  assertNear(frost.update(99.99), .49995);
  assert.equal(frost.displayLevel(), 0);
  assert.equal(frost.walkingScale(), 1);
  assertNear(frost.update(.02), .50005);
  assert.equal(frost.displayLevel(), 1);
  assert.equal(frost.walkingScale(), .95);

  frost.setExposure(1, .6, 'dark-snow', false);
  assertNear(frost.update(100), 1.25005);
  frost.setExposure(0, .6, 'dark-snow', false);
  assertNear(frost.update(120), 1.25005);
  frost.setExposure(4, .6, false, false);
  assertNear(frost.update(120), .25005);
  frost.setExposure(4, .6, 'lamp', false);
  assert.equal(frost.update(60), 0);
});

test('wet pressure and the four warmth sources retain their rates and precedence', () => {
  assert.equal(wetColdMultiplier, 2);
  const wet = createFrostTracker();
  wet.setExposure(1, 0, 'water', false);
  assertNear(wet.update(135), 1);
  wet.setExposure(3, 0, 'water', false);
  assertNear(wet.update(67.5), 2);
  wet.setExposure(4, .6, 'water', false);
  assertNear(wet.update(45), 3);

  wet.setWarmth('interior', true);
  wet.setWarmth('onsen', true);
  assertNear(wet.update(8), 2);
  wet.setWarmth('onsen', false);
  assertNear(wet.update(10), 1);
  wet.setWarmth('interior', false);

  for (const [source, seconds] of [['fire-source', 5], ['onsen', 8], ['interior', 10], ['hot-drink', 10]] as const) {
    const frost = createFrostTracker();
    frost.setExposure(4, .6, 'dark-snow', false);
    assert.equal(frost.update(240), 3);
    frost.setWarmth(source, true);
    assertNear(frost.update(seconds), 2);
    assertNear(frost.update(seconds * 2), 0);
  }
});

test('hot drink lowers exposure immediately, while ceremony baseline follows its own warm offset', () => {
  const frost = createFrostTracker();
  frost.setExposure(4, .6, 'dark-snow', false);
  frost.update(240);
  frost.drinkHot();
  assert.equal(frost.personal(), 2);
  assert.equal(frost.warming(), true);
  assertNear(frost.update(5), 1.5);
  frost.setWarmth('hot-drink', false);
  assert.equal(frost.warming(), false);
  assertNear(frost.update(100), 3);

  frost.setBaseline(3);
  frost.update(60);
  frost.drinkHot();
  assert.equal(frost.exposure(), 2);
  assert.equal(frost.personal(), 3);
  assertNear(frost.update(20), 2);
  assertNear(frost.update(20), 1);
  frost.drinkHot();
  assert.equal(frost.exposure(), 0);
});

test('ceremony relief halves growth and limits L2 and L3 slowdown, including deep snow', () => {
  const frost = createFrostTracker();
  const relieved = createFrostTracker();
  frost.setExposure(3, .6, 'dark-snow', false);
  relieved.setExposure(3, .6, 'dark-snow', true);
  assertNear(frost.update(160), 2);
  assertNear(relieved.update(160), 1);
  assert.equal(frost.walkingScale(), .88);
  assert.equal(relieved.walkingScale(), .95);
  assertNear(relieved.update(160), 2);
  assert.equal(relieved.walkingScale(), .90);
  assertNear(frost.update(80), 3);
  assertNear(relieved.update(160), 3);
  assert.equal(frost.walkingScale(), .65);
  assert.equal(relieved.walkingScale(), .90);
  assert.equal(frost.walkingScale(false), 1);
  assert.equal(relieved.walkingScale(false), 1);
  assertNear(.62 * frost.walkingScale(), .403);
});

test('sledding preserves the natural thaw exemption on snow and water and resumes exposure on dismount', () => {
  const rider = createFrostTracker();
  rider.setExposure(3, .6, 'dark-snow', false);
  assertNear(rider.update(160), 2);
  rider.setExposure(4, .6, 'dark-snow', false, 1, true);
  assertNear(rider.update(60), 1.5);
  rider.setExposure(4, 0, 'water', false, 1, true);
  assertNear(rider.update(60), 1);
  rider.setExposure(3, .6, 'dark-snow', false);
  assertNear(rider.update(80), 2);
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

test('frost overlay strengthens its three tiers, skips steady paints, and honors the motion and frost toggles', () => {
  const styles = new Map<string, string>();
  let paintCount = 0;
  const parts = new Map(['.frost-edges', '.frost-tint', '.frost-breath', '.frost-melt'].map(key =>
    [key, { style: { opacity: '' }, hidden: false }]));
  const root = {
    hidden: false, dataset: { level: '' }, querySelector: (selector: string) => parts.get(selector) ?? null,
    style: { setProperty(key: string, value: string) { paintCount++; styles.set(key, value); } },
  };
  const scene = { style: { filter: '' } };
  const notes: string[] = [];
  const reducedMotion = { matches: false };
  const frost = createCeremonyFrost(root as unknown as HTMLElement, {
    scene: scene as unknown as HTMLElement,
    reducedMotion,
    announce: text => notes.push(text),
  });
  const levels = [1, 2, 3].map(sampleFrostStyle);
  assert.deepEqual(levels.map(style => style.opacity), [.45, .65, .90]);
  assert.deepEqual(levels.map(style => style.band), [.12, .20, .34]);
  assert.deepEqual(levels.map(style => style.tint), [.06, .13, .22]);
  assert.deepEqual(levels.map(style => style.blur), [1.2, 2.6, 4.8]);
  assert.deepEqual(levels.map(style => style.clearPercent), [70, 58, 40]);
  assertNear(sampleFrostStyle(.5).opacity, .225);
  assertNear(sampleFrostStyle(.5).blur, .6);
  assertNear(sampleFrostStyle(.5).clearPercent, 85);
  assertNear(sampleFrostStyle(2.1).clearPercent, 56.2);

  frost.setExposure(4, 0, 'dark-snow', false);
  frost.update(100);
  assert.equal(root.dataset.level, '1');
  assert.equal(scene.style.filter, 'blur(1.2px)');
  assert.equal(styles.get('--frost-clear'), '70%');
  frost.update(100);
  assert.equal(root.dataset.level, '2');
  assert.equal(scene.style.filter, 'blur(2.6px)');
  assert.equal(styles.get('--frost-clear'), '58%');
  frost.update(100);
  assert.equal(root.dataset.level, '3');
  assert.equal(scene.style.filter, 'blur(4.8px)');
  assert.equal(styles.get('--frost-clear'), '40%');
  assert.equal(parts.get('.frost-breath')!.hidden, false);
  assert.equal(frost.walkingScale(), .65);
  const before = paintCount;
  frost.update(1);
  assert.equal(paintCount, before);

  reducedMotion.matches = true;
  frost.update(0);
  assert.equal(parts.get('.frost-breath')!.hidden, true);
  frost.setEnabled(false);
  assert.equal(root.hidden, true);
  assert.equal(scene.style.filter, '');
  assert.equal(frost.walkingScale(), 1);
  frost.setEnabled(true);
  assert.equal(root.hidden, false);

  frost.setWarmth('fire-source', true);
  frost.update(5);
  assert.equal(frost.walkingScale(), .88);
  assert.ok(parseFloat(parts.get('.frost-melt')!.style.opacity) > 0);
  assert.equal(scene.style.filter, 'blur(2.6px)');
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
