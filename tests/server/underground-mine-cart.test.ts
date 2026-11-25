import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundMineCart } from '../../src/presence/underground-mine-cart.js';
import { createUndergroundMineCartTrack, undergroundMineCartLocalTrack } from '../../src/shared/underground-mine-cart-track.js';

const track = createUndergroundMineCartTrack(undergroundMineCartLocalTrack);

test('surveyed endpoints, push feet and pitch agree with a rail falling 5 percent into the mine', () => {
  assert.equal(track.point(2).north, -17.4);
  assert.ok(Math.abs(track.slope - Math.atan(-.05)) < 1e-12);
  assert.ok(Math.abs(track.approach(0, 1).north + 14.88) < 1e-12);
  assert.ok(Math.abs(track.approach(2, -1).height + 90.326) < 1e-12);
  assert.equal(Math.abs(track.heading), Math.PI);
});

test('two players share one two-step cart, and either end can push it back', () => {
  let stand = track.approach(0, 1);
  const cart = createUndergroundMineCart({
    track, domainId: 'mine', pushReach: .22, canRoll: () => true,
    readAcceptedFoot: playerId => ({ ...stand, playerId, domainId: 'mine' }),
  });
  assert.deepEqual(cart.push('one', { revision: 0, direction: 1 }), { revision: 1, step: 1 });
  assert.equal(cart.push('two', { revision: 0, direction: 1 }), undefined);
  assert.equal(cart.push('two', { revision: 1, direction: 1 }), undefined);
  stand = track.approach(1, 1);
  assert.deepEqual(cart.push('two', { revision: 1, direction: 1 }), { revision: 2, step: 2 });
  assert.equal(cart.push('one', { revision: 2, direction: 1 }), undefined);
  stand = track.approach(2, -1);
  assert.deepEqual(cart.push('one', { revision: 2, direction: -1 }), { revision: 3, step: 1 });
});

test('other domains and blocked sweeps cannot advance the cart revision', () => {
  let domainId = 'elsewhere';
  let clear = false;
  const cart = createUndergroundMineCart({
    track, domainId: 'mine', pushReach: .22,
    canRoll: (from, to, player) => clear && from.north === -16 && to.north === -16.7 && player === 'one',
    readAcceptedFoot: playerId => ({ ...track.approach(0, 1), playerId, domainId }),
  });
  assert.equal(cart.push('one', { revision: 0, direction: 1 }), undefined);
  domainId = 'mine';
  assert.equal(cart.push('one', { revision: 0, direction: 1 }), undefined);
  assert.deepEqual(cart.snapshot(), { revision: 0, step: 0 });
  clear = true;
  assert.equal(cart.push('one', { revision: 0, direction: 1 })?.step, 1);
});
