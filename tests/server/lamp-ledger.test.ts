import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLampLedger } from '../../src/presence/lamp-ledger.js';

// The single lamp ledger (ruling 2026-11-22): registration at the muster
// point is the prerequisite, the lamp room issues against it, and the camp
// never keeps a second book.

test('issue requires registration first', () => {
  const ledger = createLampLedger();
  assert.equal(ledger.issue('p1'), false);
  assert.equal(ledger.register('p1'), true);
  assert.equal(ledger.register('p1'), false, 'double registration refused');
  assert.equal(ledger.issue('p1'), true);
  assert.equal(ledger.holdsLamp('p1'), true);
  assert.equal(ledger.issue('p1'), false, 'one lamp per borrower');
});

test('return cancels the record; a fresh registration is needed again', () => {
  const ledger = createLampLedger();
  ledger.register('p1');
  ledger.issue('p1');
  assert.equal(ledger.returnLamp('p1'), true);
  assert.equal(ledger.record('p1'), undefined);
  assert.equal(ledger.returnLamp('p1'), false);
  assert.equal(ledger.issue('p1'), false, 'cancelled means unregistered');
});

test('damage is reported onto the same record and the lamp stays held', () => {
  const ledger = createLampLedger();
  assert.equal(ledger.reportDamage('p1'), false);
  ledger.register('p1');
  ledger.issue('p1');
  assert.equal(ledger.reportDamage('p1'), true);
  assert.equal(ledger.reportDamage('p1'), false, 'already reported');
  assert.deepEqual(ledger.record('p1'), { stage: 'holding', damaged: true });
});

test('death marks a held lamp lost, never dropped; the camp re-issues', () => {
  const ledger = createLampLedger();
  ledger.register('p1');
  ledger.issue('p1');
  ledger.reportDamage('p1');
  assert.equal(ledger.onDeath('p1'), true);
  assert.deepEqual(ledger.record('p1'), { stage: 'lost', damaged: true });
  assert.equal(ledger.holdsLamp('p1'), false);
  assert.equal(ledger.onDeath('p1'), false, 'already lost');
  assert.equal(ledger.reissueAtCamp('p1'), true);
  assert.deepEqual(ledger.record('p1'), { stage: 'holding', damaged: false },
    'the replacement is a sound lamp');
});

test('a placed lamp is on the record and cannot be lost or re-issued', () => {
  const ledger = createLampLedger();
  ledger.register('p1');
  ledger.issue('p1');
  assert.equal(ledger.placeAtNiche('p1'), true);
  assert.equal(ledger.holdsLamp('p1'), false);
  assert.equal(ledger.onDeath('p1'), false, 'a placed lamp is not carried');
  assert.equal(ledger.reissueAtCamp('p1'), false);
  assert.equal(ledger.returnLamp('p1'), false, 'placed is not held');
  assert.equal(ledger.record('p1')?.stage, 'placed');
});

test('borrowers are independent', () => {
  const ledger = createLampLedger();
  ledger.register('p1');
  ledger.issue('p1');
  assert.equal(ledger.holdsLamp('p2'), false);
  assert.equal(ledger.record('p2'), undefined);
});
