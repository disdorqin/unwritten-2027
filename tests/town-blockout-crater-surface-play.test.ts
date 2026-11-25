import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBellows, createCalibration, createScale, createSorting, createTrackSwitch, dialTargets, lumpWeightKg,
} from '../tools/voxel-tavern/town-blockout/town-crater-surface-play';

test('bellows: pumping into the band and holding 10 s casts; drifting out resets the hold', () => {
  const bellows = createBellows();
  for (let i = 0; i < 3; i++) bellows.pump();
  assert.ok(bellows.state().inBand, `pressure ${bellows.state().pressure} in band`);
  // Real play: short ticks, re-pump whenever pressure sags toward the band floor.
  for (let t = 0; t < 10_000 && !bellows.state().cast; t += 250) {
    bellows.tick(250);
    if (bellows.state().pressure < 0.62) bellows.pump();
  }
  assert.equal(bellows.state().cast, true, 'held in band for a continuous 10 s');
  const lazy = createBellows();
  lazy.pump(); lazy.pump(); lazy.pump();
  for (let t = 0; t < 5_000; t += 250) lazy.tick(250); // never re-pumped: decays out of the band
  assert.equal(lazy.state().cast, false);
  assert.equal(lazy.state().heldMs, 0);
});

test('calibration: day-derived targets, lock tolerance, full alignment', () => {
  const day = 7;
  const targets = dialTargets(day);
  assert.deepEqual(dialTargets(day), targets, 'same day, same targets on every client');
  assert.notDeepEqual(dialTargets(day + 1), targets);
  const cal = createCalibration(day);
  assert.equal(cal.aligned(), false);
  for (const dial of [0, 1, 2] as const) cal.turn(dial, targets[dial]!);
  assert.equal(cal.aligned(), true);
});

test('sorting refuses wrong bins, seals at capacity, scale keeps an honest best', () => {
  const sorting = createSorting();
  assert.equal(sorting.place('stardust', 'scrap'), 'refused');
  for (let i = 0; i < 6; i++) assert.equal(sorting.place('stardust', 'stardust'), 'sorted');
  assert.equal(sorting.place('stardust', 'stardust'), 'bin-full');
  assert.equal(sorting.state().mistakes, 1);
  const scale = createScale();
  const a = scale.weigh(11); const b = scale.weigh(23);
  assert.equal(a.kg, lumpWeightKg(11), 'weight is a fact of the lump, reweighing agrees');
  assert.equal(scale.weigh(11).isBest, false, 'same lump never beats itself twice');
  assert.equal(scale.bestKg(), Math.max(a.kg, b.kg));
});

test('track switch flips the next train route and resets at dawn', () => {
  const sw = createTrackSwitch();
  assert.equal(sw.nextTrainRoute(), 'main');
  sw.pull();
  assert.equal(sw.nextTrainRoute(), 'siding');
  sw.dawnReset();
  assert.equal(sw.nextTrainRoute(), 'main');
});
