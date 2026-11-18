import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferGeometry, Points, Scene } from 'three';
import { createCeremonyFrost, createFrostTracker, sampleFrostStyle, wetColdMultiplier } from '../tools/voxel-tavern/town-blockout/town-frost';
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
  assert.equal(dry.walkingScale(), .80);
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
  const coldAt = (x: number, n: number) => snow.exposedSnowAt(x, n, grid.heightAt(x, n));
  assert.equal(coldAt(223, 180), false);
  assert.equal(coldAt(240, 217), true);
  assert.equal(snow.exposedSnowAt(240, 217, grid.heightAt(240, 217) + 2), false);
  assert.equal(snow.exposedSnowAt(240, 217, grid.heightAt(240, 217), () => true), false);
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
  assert.match(scene.style.filter, /^blur\(1\.2px\)$/);
  const middleMask = styles.get('--frost-clear');
  frost.update(90);
  assert.equal(root.dataset.level, '3');
  assert.equal(scene.style.filter, 'blur(3.2px)');
  assert.ok(parseFloat(styles.get('--frost-clear')!) < parseFloat(middleMask!));
  assert.equal(frost.walkingScale(), .80);
  assert.equal(sampleFrostStyle(2.1).clearPercent, 71.9);

  frost.setWarmth('fire-source', true);
  frost.update(5);
  assert.equal(frost.walkingScale(), .90);
  assert.ok(parseFloat(parts.get('.frost-melt')!.style.opacity) > 0);
  assert.notEqual(styles.get('--frost-clear'), '62%');
  assert.notEqual(scene.style.filter, 'blur(3.2px)');
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
