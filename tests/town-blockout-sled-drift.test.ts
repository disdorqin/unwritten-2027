import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSledDrift } from '../tools/voxel-tavern/town-blockout/sled-drift.ts';
import { createSledMotion, sledMaximumSpeed } from '../tools/voxel-tavern/town-blockout/sled-motion.ts';

const driftCue = { grounded: true, speed: 8, turn: .8, lateral: 2 };
const straightCue = { grounded: true, speed: 8, turn: 0, lateral: 0 };
const dt = 1 / 60;

function run(drift: ReturnType<typeof createSledDrift>, seconds: number, cue: typeof driftCue) {
  let out = { drifting: false, charge: 0, boost: 0 };
  for (let t = 0; t < seconds; t += dt) out = drift.update(dt, cue);
  return out;
}

test('drift entry needs speed, turn and lateral slide together', () => {
  const drift = createSledDrift();
  assert.equal(run(drift, .5, { ...driftCue, speed: 4 }).drifting, false);
  assert.equal(run(drift, .5, { ...driftCue, turn: .3 }).drifting, false);
  assert.equal(run(drift, .5, { ...driftCue, lateral: .5 }).drifting, false);
  assert.equal(run(drift, .5, { ...driftCue, grounded: false }).drifting, false);
  assert.equal(run(drift, .5, driftCue).drifting, true);
});

test('charge accumulates at .45/s and caps at full', () => {
  const drift = createSledDrift();
  assert.ok(Math.abs(run(drift, 1, driftCue).charge - .45) < 1e-9);
  assert.equal(run(drift, 2, driftCue).charge, 1);
});

test('release fires stages strongest-first according to charge thresholds', () => {
  const low = createSledDrift();
  run(low, 1, driftCue); // charge .45 -> stage 1 only
  let out = low.update(dt, straightCue);
  assert.equal(out.boost, 2.6);
  assert.equal(low.stageCount(), 1);
  out = run(low, .8, straightCue);
  assert.equal(out.boost, 0);
  assert.equal(low.stageCount(), 0);

  const mid = createSledDrift();
  run(mid, 1.5, driftCue); // charge .675 -> stages 3.2 then 2.6
  assert.equal(mid.update(dt, straightCue).boost, 3.2);
  assert.equal(mid.stageCount(), 2);
  run(mid, .8, straightCue);
  assert.equal(mid.update(dt, straightCue).boost, 2.6);

  const full = createSledDrift();
  run(full, 2.3, driftCue); // charge 1 -> 3.9, 3.2, 2.6
  assert.equal(full.update(dt, straightCue).boost, 3.9);
  assert.equal(full.stageCount(), 3);
  run(full, 1.2, straightCue);
  assert.equal(full.update(dt, straightCue).boost, 3.2);
  run(full, .8, straightCue);
  assert.equal(full.update(dt, straightCue).boost, 2.6);
  run(full, .8, straightCue);
  assert.equal(full.update(dt, straightCue).boost, 0);
});

test('unreleased sub-threshold charge decays after the grace window; reset clears all', () => {
  const drift = createSledDrift();
  run(drift, .4, driftCue); // charge .18 < .30 -> no stage on release
  const out = drift.update(dt, straightCue);
  assert.equal(out.boost, 0);
  assert.ok(Math.abs(out.charge - .18) < .01, `charge ${out.charge}`);
  run(drift, .4, straightCue); // still inside .5 s grace
  assert.ok(drift.charge() > .17);
  run(drift, 1, straightCue); // decayed at .35/s
  assert.equal(drift.charge(), 0);

  run(drift, 2.3, driftCue);
  drift.update(dt, straightCue);
  assert.ok(drift.boosting());
  drift.reset();
  assert.equal(drift.charge(), 0);
  assert.equal(drift.boosting(), false);
});

test('boost through sled motion never exceeds the 17 m/s hard cap and beats no-boost', () => {
  const ground = { grade: 0, surface: 0, deepSnow: false };
  const boosted = createSledMotion();
  const plain = createSledMotion();
  boosted.reset(0, 16.4);
  plain.reset(0, 16.4);
  for (let t = 0; t < 3; t += dt) {
    const b = boosted.step(dt, { forward: 0, turn: 0 }, ground, 3.9);
    const p = plain.step(dt, { forward: 0, turn: 0 }, ground);
    assert.ok(b.speed <= sledMaximumSpeed, `boosted speed ${b.speed}`);
    assert.ok(p.speed <= sledMaximumSpeed);
    if (t > .2) assert.ok(b.speed > p.speed, `boost should help: ${b.speed} vs ${p.speed}`);
  }
});
