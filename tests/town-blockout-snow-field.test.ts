import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import {
  createTownSnowField, snowFieldTrackCapacity,
} from '../tools/voxel-tavern/town-blockout/town-snow-field.ts';

const grid = createTerrainGrid();
const wild = [8, 31, grid.heightAt(8, 31)] as const;
const courtyard = [159, 230, grid.heightAt(159, 230)] as const;
const roadEdge = [458, 70, grid.heightAt(458, 70)] as const;
const plazaEdge = [191, 169, grid.heightAt(191, 169)] as const;
const heavy = { targetCover: 1, pilingRate: 1.25 };
const light = { targetCover: .18, pilingRate: .25 };

function settledField(weather = heavy) {
  const field = createTownSnowField(grid);
  field.setWeather(weather);
  field.setIntensity(4);
  field.update(600, true);
  return field;
}

test('baseline equivalence: settled storm reproduces the verified .85/.62 movement scales', () => {
  const field = settledField();
  assert.equal(field.amount(), 1);
  assert.equal(field.movementScale(...wild), .62);
  assert.ok(Math.abs(11.3 * field.movementScale(...wild, undefined, true) - 8.25) < 1e-10);
  assert.equal(field.movementScale(...courtyard), .85);
  assert.equal(field.depthAt(...courtyard), .5);
  assert.equal(field.depth().servings, 5);
  // Plaza paving and the lake stay clear, exactly like the fixed-map baseline.
  const [px, pn] = layout.plaza.spawn;
  assert.equal(field.movementScale(px, pn, grid.heightAt(px, pn)), 1);
  const [iceX, iceNorth] = layout.lake.center;
  assert.equal(field.movementScale(iceX, iceNorth, grid.heightAt(iceX, iceNorth)), 1);
});

test('baseline equivalence: mid coverage .4 gives wild .85 and courtyard full speed', () => {
  const field = settledField({ targetCover: .4, pilingRate: .65 });
  assert.equal(field.amount(), .4);
  assert.equal(field.movementScale(...wild), .85);
  assert.equal(field.movementScale(...wild, undefined, true), .8);
  assert.equal(field.movementScale(...courtyard), 1);
  assert.equal(field.depth().servings, 4);
});

test('heavy snow spills onto snow-adjacent cleared cells but never reaches deep grade', () => {
  const moderate = settledField({ targetCover: .64, pilingRate: .65 });
  assert.equal(moderate.depthAt(...plazaEdge), 0);
  const field = settledField();
  assert.ok(Math.abs(field.cellAmountAt(plazaEdge[0], plazaEdge[1]) - .45) < 1e-6);
  assert.ok(Math.abs(field.depthAt(...plazaEdge) - .45) < 1e-6);
  assert.equal(field.movementScale(...plazaEdge), .85);
  // Spill still respects the baseline clearances: the extension road holds
  // slush in the field but its cleared depth stays zero, as in the fixed map.
  assert.ok(Math.abs(field.cellAmountAt(roadEdge[0], roadEdge[1]) - .45) < 1e-6);
  assert.equal(field.depthAt(...roadEdge), 0);
});

test('coverage recedes over minutes toward the light target instead of snapping to zero', () => {
  const field = settledField();
  field.setWeather(light);
  field.update(30, true);
  assert.ok(field.amount() > .5, `cover after 30 s of light weather: ${field.amount()}`);
  field.update(600, true);
  assert.equal(field.amount(), .18);
  assert.equal(field.movementScale(...wild), 1);
});

test('digging removes local depth and the pit refills over minutes', () => {
  const field = settledField();
  assert.equal(field.movementScale(...wild), .62);
  const taken = field.digAt(wild[0], wild[1], .5);
  assert.equal(taken, .5);
  assert.equal(field.depthAt(...wild), .5);
  assert.equal(field.movementScale(...wild), .85);
  field.update(120, true);
  assert.equal(field.dugDepthAt(wild[0], wild[1]), 0);
  assert.equal(field.movementScale(...wild), .62);
});

test('sled tracks persist for minutes, are covered by snowfall and respect the town cap', () => {
  const field = createTownSnowField(grid);
  field.setWeather(light);
  field.setIntensity(4);
  field.addTrack(10, 10, 12, 10, .5);
  assert.equal(field.trackCount(), 1);
  assert.equal(field.trackSegments()[0].alpha, .5);
  field.update(120, true);
  const faded = field.trackSegments()[0];
  assert.ok(faded && faded.alpha < .5 && faded.alpha > 0, `alpha after 2 min: ${faded?.alpha}`);
  field.update(240, true);
  assert.equal(field.trackCount(), 0);

  const storm = createTownSnowField(grid);
  storm.setWeather(heavy);
  storm.addTrack(10, 10, 12, 10, .5);
  storm.update(90, true);
  assert.equal(storm.trackCount(), 0, 'heavy snowfall buries a track well before the time cap');

  const capped = createTownSnowField(grid);
  for (let i = 0; i < snowFieldTrackCapacity + 5; i++) capped.addTrack(i, 0, i + 1, 0, .4);
  assert.equal(capped.trackCount(), snowFieldTrackCapacity);
});
