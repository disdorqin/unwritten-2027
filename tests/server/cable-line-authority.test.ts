import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCableLineAuthority } from '../../src/presence/cable-line-authority';

function repairFully(authority: ReturnType<typeof createCableLineAuthority>, line: 1 | 2) {
  const frames = [];
  frames.push(authority.applyEvent(line, { kind: 'wake', impact: 'sled' }));
  for (let i = 0; i < 9; i++) authority.applyEvent(line, { kind: 'strike-rust' });
  authority.applyEvent(line, { kind: 'pull-brake' });
  authority.applyEvent(line, { kind: 'pry-cable', effort: 1 });
  for (let i = 0; i < 3; i++) authority.applyEvent(line, { kind: 'tighten-cable' });
  for (let index = 0; index < 4; index++) {
    authority.applyEvent(line, { kind: 'take-weight', index });
    frames.push(authority.applyEvent(line, { kind: 'hang-weight', index }));
  }
  return frames;
}

test('flags stay closed through wake and partial repairs; one-station is not open', () => {
  const authority = createCableLineAuthority();
  assert.deepEqual(authority.flags(), { cableLine1Open: false, cableLine2Open: false });
  const wake = authority.applyEvent(1, { kind: 'wake', impact: 'sled' });
  assert.equal(wake?.stage, 'one-station');
  assert.equal(wake?.flags.cableLine1Open, false);
  assert.equal(authority.hello(1).version, wake?.version);
});

test('full repair opens exactly once, per line independently', () => {
  const authority = createCableLineAuthority();
  const frames = repairFully(authority, 1);
  const openedFrames = frames.filter(frame => frame?.openedNow);
  assert.equal(openedFrames.length, 1);
  assert.equal(openedFrames[0]?.flags.cableLine1Open, true);
  assert.equal(openedFrames[0]?.flags.cableLine2Open, false);
  assert.deepEqual(authority.flags(), { cableLine1Open: true, cableLine2Open: false });
  // Terminal: further events are rejected and produce no frame.
  assert.equal(authority.applyEvent(1, { kind: 'strike-rust' }), undefined);
  repairFully(authority, 2);
  assert.deepEqual(authority.flags(), { cableLine1Open: true, cableLine2Open: true });
});

test('rejected events broadcast nothing and do not move the version', () => {
  const authority = createCableLineAuthority();
  assert.equal(authority.applyEvent(2, { kind: 'pull-brake' }), undefined);
  assert.equal(authority.snapshot(2).version, 0);
  assert.equal(authority.applyEvent(2, { kind: 'pry-cable', effort: 2 }), undefined);
  assert.equal(authority.snapshot(2).version, 0);
});

test('night window closes service even on a fully repaired line', async () => {
  const { cableServiceOpen } = await import('../../src/presence/cable-line-authority');
  const open = { cableLine1Open: true, cableLine2Open: true };
  assert.equal(cableServiceOpen(open, 1, 'day'), true);
  assert.equal(cableServiceOpen(open, 2, 'awaiting-beacon'), true);
  assert.equal(cableServiceOpen(open, 1, 'night-window'), false);
  assert.equal(cableServiceOpen(open, 2, 'night-window'), false);
  assert.equal(cableServiceOpen({ cableLine1Open: false, cableLine2Open: false }, 1, 'day'), false);
  assert.equal(cableServiceOpen(open, 1, undefined), true, 'unknown phase does not close service');
});
