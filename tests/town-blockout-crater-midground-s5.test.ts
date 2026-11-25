import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCraterMidgroundS5, moundReservation } from '../tools/voxel-tavern/town-blockout/town-crater-midground-s5';
import { buildZa36CraterStoryDressing } from '../tools/voxel-tavern/town-blockout/town-za36-crater-story-dressing';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { createMeteorCrater, meteorCraterFixturePlan } from '../tools/voxel-tavern/town-blockout/meteor-crater';

const road = mountWestCraterRoad(540, () => 0);
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const { east: oE, north: oN, yaw } = road.anchor;
const c = Math.cos(yaw), s = Math.sin(yaw);
const trail = Array.from({ length: 801 }, (_, i) => {
  const at = fixture.mainTrailPoint(i / 800);
  return { east: oE + at.east * c + at.north * s, north: oN + at.north * c - at.east * s };
});

test('R30 middle band keeps sparse recognizable mining relics and crystal outcrops deterministically', () => {
  const a = buildCraterMidgroundS5(road);
  const b = buildCraterMidgroundS5(road);
  assert.equal(a.placements.length, b.placements.length, 'seeded placement is stable');
  assert.deepEqual(a.placements.map(p => [p.east, p.north]), b.placements.map(p => [p.east, p.north]));
  assert.ok(a.placements.length >= 12 && a.placements.length <= 55, `sparse thematic band, got ${a.placements.length} pieces`);
  for (const kind of ['ice', 'rust', 'timber']) assert.ok(a.placements.some(p => p.kind === kind), `missing ${kind} relic`);
  assert.ok(a.placements.every(p => p.kind !== 'scorch'), 'no decorative scorch scatter');
  assert.ok(a.batches.length <= 5, `draw batches stay inside the dressing budget: ${a.batches.length}`);
});

test('every piece honours the guards: off the lane, off the lip, out of the mound disc', () => {
  const { placements } = buildCraterMidgroundS5(road);
  for (const p of placements) {
    assert.ok(Math.hypot(p.east - moundReservation.east, p.north - moundReservation.north) >= moundReservation.radius,
      `piece in the mound disc at ${p.east},${p.north} — the charred forest waits for C2's measured surface`);
    assert.ok(trail.every(t => Math.hypot(p.east - t.east, p.north - t.north) >= 3.1), 'piece on the lane');
    assert.ok(Math.hypot(p.east - road.lip.east, p.north - road.lip.north) >= 9.8, 'piece crowds the lip');
    const r = Math.hypot(p.east - oE, p.north - oN);
    assert.ok(r >= 20 && r <= 55, `piece outside the middle band: r=${r.toFixed(1)}`);
  }
});

test('deconflicts against the za36 dressing when its placements are supplied', () => {
  const za36 = buildZa36CraterStoryDressing(road);
  const { placements } = buildCraterMidgroundS5(road, { avoid: za36.placements });
  for (const p of placements) {
    assert.ok(za36.placements.every(q => Math.hypot(p.east - q.east, p.north - q.north) >= .72),
      'piece crowds a za36 piece');
  }
  assert.ok(placements.length >= 12 && placements.length <= 55, 'retain sparse themed groups after deconfliction');
  for (const kind of ['ice', 'rust', 'timber']) assert.ok(placements.some(p => p.kind === kind), `missing ${kind} after deconfliction`);
});
