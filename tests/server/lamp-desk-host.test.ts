import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLampDeskHost } from '../../src/presence/lamp-desk-host';
import { createLampLedger } from '../../src/presence/lamp-ledger';

type Session = { id: string; where: 'desk' | 'lamp-room' | 'niche' | 'camp' | 'wild' };

function host() {
  const ledger = createLampLedger();
  return createLampDeskHost<Session>({
    profileOf: (s) => s.id,
    atDesk: (s) => s.where === 'desk',
    atLampRoom: (s) => s.where === 'lamp-room',
    atNiche: (s) => s.where === 'niche',
    atCamp: (s) => s.where === 'camp',
  }, ledger);
}
const at = (where: Session['where'], id = 'p1'): Session => ({ id, where });

test('the full take-and-return flow, gated by where the player stands', () => {
  const h = host();
  assert.equal(h.issue(at('lamp-room')), false, 'no registration, no lamp — even at the window');
  assert.equal(h.register(at('wild')), false, 'registration happens at the desk, not in the wild');
  assert.equal(h.register(at('desk')), true);
  assert.equal(h.issue(at('desk')), false, 'the desk registers; the lamp room issues');
  assert.equal(h.issue(at('lamp-room')), true);
  assert.equal(h.holdsLamp(at('wild')), true, 'reads are not position-gated');
  assert.equal(h.returnLamp(at('desk')), false, 'returns also happen at the window');
  assert.equal(h.returnLamp(at('lamp-room')), true);
  assert.equal(h.recordOf(at('wild')), undefined, 'return cancels the record outright');
});

test('damage, niche placement, death and camp reissue follow the one book', () => {
  const h = host();
  h.register(at('desk')); h.issue(at('lamp-room'));
  assert.equal(h.reportDamage(at('wild')), true, 'damage is reported from wherever the holder stands');
  assert.equal(h.recordOf(at('wild'))?.damaged, true);
  assert.equal(h.placeAtNiche(at('wild')), false, 'placing needs a niche');
  assert.equal(h.placeAtNiche(at('niche')), true);
  assert.equal(h.onDeath(at('wild')), false, 'a placed lamp is not the borrower\'s to lose');
  // Second player: death marks lost, camp re-issues.
  h.register(at('desk', 'p2')); h.issue(at('lamp-room', 'p2'));
  assert.equal(h.onDeath(at('wild', 'p2')), true);
  assert.equal(h.recordOf(at('wild', 'p2'))?.stage, 'lost');
  assert.equal(h.reissue(at('lamp-room', 'p2')), false, 'replacements are issued at the camp');
  assert.equal(h.reissue(at('camp', 'p2')), true);
  assert.equal(h.holdsLamp(at('wild', 'p2')), true);
});

test('anonymous sessions can do nothing', () => {
  const h = host();
  const anon: Session = { id: '', where: 'desk' };
  assert.equal(h.register(anon), false);
  assert.equal(h.holdsLamp(anon), false);
  assert.equal(h.recordOf(anon), undefined);
});
