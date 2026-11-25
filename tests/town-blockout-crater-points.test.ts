import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDebrisRing, createEmberRound, createMound, createRegistrationDesk, createTowerRound, createWinch,
} from '../tools/voxel-tavern/town-blockout/town-crater-points-play';

test('winch: progress only rises, first opening a turn and a half, a known well half a turn, duo 1.8x', () => {
  const w = createWinch(false);
  assert.equal(w.push(0.5, 1), 1 / 3);
  assert.equal(w.push(-1, 1), 1 / 3, 'pushing backwards never loses progress');
  assert.ok(Math.abs(w.push(0.5, 2) - (1.4 / 1.5)) < 1e-9, 'the second pair of hands counts 1.8x');
  assert.equal(w.open, false);
  w.push(0.2, 1);
  assert.equal(w.open, true);
  const again = createWinch(true);
  again.push(0.5, 1);
  assert.equal(again.open, true, 'a well that knows you opens in half a turn');
});

test('towers: lookout registers once, three distinct rubbings complete the page at one snow each', () => {
  const t = createTowerRound();
  assert.equal(t.reachTop('tower-1').lookoutFirstTime, true);
  assert.equal(t.reachTop('tower-2').lookoutFirstTime, false);
  assert.deepEqual(t.rub('tower-1'), { ok: true, snowCost: 1, atlasPageComplete: false });
  assert.deepEqual(t.rub('tower-1'), { ok: false, snowCost: 0, atlasPageComplete: false }, 'no double charge for the same mark');
  t.rub('tower-2');
  assert.equal(t.rub('tower-3').atlasPageComplete, true);
});

test('debris ring: two seconds of looking identifies; ship pieces never break; ordinary pieces break at two hits', () => {
  const ring = createDebrisRing(['s1', 's2', 's3', 's4', 's5'], () => 0.1);
  assert.equal(ring.dwell('s1', 1_200), false);
  assert.equal(ring.dwell('s1', 900), true, 'dwell accumulates across glances');
  assert.equal(ring.dwell('s1', 5_000), false, 'already identified');
  assert.deepEqual(ring.knock('s2'), { broke: false, stardustFragment: false }, 'ship pieces are look-only');
  assert.equal(ring.knock('rock-1').broke, false);
  assert.deepEqual(ring.knock('rock-1'), { broke: true, stardustFragment: true });
  for (const id of ['s2', 's3', 's4', 's5']) ring.dwell(id, 2_000);
  assert.equal(ring.atlasGroupComplete, true);
});

test('registration desk: a judgment face over the one lamp book — no sign-in no lamp, death marks lost, camp re-issues', async () => {
  const { createLampLedger } = await import('../src/presence/lamp-ledger');
  const desk = createRegistrationDesk(createLampLedger(), 'p1');
  assert.equal(desk.drawLamp(), false, 'unregistered hands get no lamp');
  desk.register();
  assert.equal(desk.drawLamp(), true);
  desk.onDeath();
  assert.equal(desk.state, 'lost', 'death marks the lamp lost on the same record');
  assert.equal(desk.drawLamp(), false, 'a lost lamp is not re-drawn at the window');
  assert.equal(desk.reissue(), true, 'the camp re-issues a replacement');
  assert.equal(desk.state, 'lamp-out');
  assert.deepEqual(desk.returnToken(), { settled: true });
  assert.equal(desk.state, 'unregistered', 'return cancels the record outright');
  assert.equal(desk.register(), true, 'the next descent signs again');
});

test('mound: straightening the old flag is one-time and persistent; embers reset with the night', () => {
  const mound = createMound(false);
  assert.deepEqual(mound.straightenFlag(), { changed: true, persist: true });
  assert.deepEqual(mound.straightenFlag(), { changed: false, persist: false });
  assert.equal(createMound(true).straightenFlag().changed, false, 'a restored flag stays straight across sessions');
  const round = createEmberRound();
  round.stoke('smelter-hearth', 'night-1');
  round.stoke('calibration-bench', 'night-1');
  assert.equal(round.stoke('station-lamp', 'night-1').allStoked, true);
  assert.equal(round.stoke('smelter-hearth', 'night-2').ok, true, 'a new night starts the round over');
  assert.equal(round.stokedCount, 1);
});
