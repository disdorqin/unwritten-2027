import assert from 'node:assert/strict';
import test from 'node:test';
import { createWinch, winchDuoRate, winchSoloSeconds } from '../tools/voxel-tavern/town-blockout/town-winch';

test('solo cranking opens the cover in about forty seconds and never regresses', () => {
  const winch = createWinch();
  let elapsed = 0;
  while (!winch.open && elapsed < 60) {
    winch.tick(0.5, { cranking: true, ropeHeld: false });
    elapsed += 0.5;
  }
  assert.ok(winch.open);
  assert.ok(Math.abs(elapsed - winchSoloSeconds) <= 0.5, `solo took ${elapsed}s`);
  const done = winch.progress;
  assert.equal(winch.tick(1, { cranking: false, ropeHeld: false }), 0);
  assert.equal(winch.progress, done);
});

test('a second pair of hands on the steady rope speeds the crank and stills the sway', () => {
  const solo = createWinch();
  const duo = createWinch();
  for (let t = 0; t < 10; t += 0.25) {
    solo.tick(0.25, { cranking: true, ropeHeld: false });
    duo.tick(0.25, { cranking: true, ropeHeld: true });
  }
  assert.ok(Math.abs(duo.progress - solo.progress * winchDuoRate) < 1e-9);
  assert.equal(duo.swayAt(3.3, true), 0);
  let elapsed = 10;
  while (!duo.open && elapsed < 40) {
    duo.tick(0.5, { cranking: true, ropeHeld: true });
    elapsed += 0.5;
  }
  assert.ok(duo.open);
  assert.ok(elapsed <= winchSoloSeconds / winchDuoRate + 0.5, `duo took ${elapsed}s`);
});

test('unheld sway follows the eased sine and release pauses without regress', () => {
  const winch = createWinch();
  winch.tick(10, { cranking: true, ropeHeld: false });
  const progress = winch.progress;
  assert.ok(Math.abs(winch.swayAt(0, false)) < 1e-12);
  const expected = Math.sin(1.4 * 2) * 0.3 * (1 - 0.6 * progress);
  assert.ok(Math.abs(winch.swayAt(2, false) - expected) < 1e-12);
  winch.tick(5, { cranking: false, ropeHeld: false });
  assert.equal(winch.progress, progress);
});
