import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZa36CableRepair } from '../tools/voxel-tavern/town-blockout/town-za36-cable-repair';

test('ZA-36 line one wake is only a one-station run; all three manual repairs unlock full line', () => {
  const line = createZa36CableRepair(1);
  assert.equal(line.snapshot().stage, 'dormant');
  assert.equal(line.apply({ kind: 'strike-rust' }).accepted, false, 'repairs are unavailable before wake');
  assert.deepEqual(line.apply({ kind: 'wake', impact: 'sled' }).state.stage, 'one-station');
  assert.equal(line.apply({ kind: 'wake', impact: 'snowball' }).accepted, false, 'duplicate impact must not reset');
  assert.equal(line.apply({ kind: 'pull-brake' }).accepted, false, 'rust needs nine hits first');
  for (let i = 0; i < 9; i++) assert.equal(line.apply({ kind: 'strike-rust' }).accepted, true);
  assert.equal(line.apply({ kind: 'strike-rust' }).accepted, false);
  assert.equal(line.apply({ kind: 'pull-brake' }).accepted, true);
  assert.deepEqual(line.snapshot().repaired[0], 'rust-brake');
  assert.equal(line.snapshot().stage, 'one-station');

  assert.equal(line.apply({ kind: 'tighten-cable' }).accepted, false);
  assert.equal(line.apply({ kind: 'pry-cable', effort: .6 }).state.cableHeight, .6);
  assert.equal(line.apply({ kind: 'release-cable' }).state.cableHeight, .3);
  assert.equal(line.apply({ kind: 'pry-cable', effort: .7 }).state.cableHeight, 1);
  for (let i = 0; i < 3; i++) assert.equal(line.apply({ kind: 'tighten-cable' }).accepted, true);
  assert.equal(line.apply({ kind: 'tighten-cable' }).accepted, false);
  assert.equal(line.snapshot().stage, 'one-station');

  const order = [2, 0, 3, 1];
  for (const index of order) {
    assert.equal(line.apply({ kind: 'hang-weight', index }).accepted, false, 'must carry weight first');
    assert.equal(line.apply({ kind: 'take-weight', index }).accepted, true);
    assert.equal(line.apply({ kind: 'take-weight', index: (index + 1) % 4 }).accepted, false,
      'only one shoulder-borne block at a time');
    const result = line.apply({ kind: 'hang-weight', index });
    assert.equal(result.accepted, true);
    assert.equal(result.opened, index === 1, 'signal completion exactly once');
  }
  assert.equal(line.snapshot().stage, 'full-line');
  assert.deepEqual(line.snapshot().repaired, ['rust-brake', 'cable-wheel', 'counterweight']);
  assert.equal(line.apply({ kind: 'take-weight', index: 0 }).accepted, false, 'full-line is permanent');
  assert.equal(line.snapshot().weightMounted.every(Boolean), true);
});

test('ZA-36 line two has independent repair state, accepts no invalid payload and does not auto-authorize the world', () => {
  const line1 = createZa36CableRepair(1);
  const line2 = createZa36CableRepair(2);
  assert.equal(line2.apply({ kind: 'wake', impact: 'night-window' }).accepted, true);
  assert.equal(line1.snapshot().stage, 'dormant');
  for (const effort of [0, -1, 1.01, NaN, Infinity]) {
    assert.equal(line2.apply({ kind: 'pry-cable', effort }).accepted, false);
  }
  for (const index of [-1, 4, 1.5, Number.NaN]) {
    assert.equal(line2.apply({ kind: 'take-weight', index }).accepted, false);
  }
  assert.equal(line2.snapshot().version, 1, 'rejected malformed commands never mutate state');
  assert.equal(line2.snapshot().line, 2);
  assert.equal(line2.snapshot().stage, 'one-station');
});
