import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  residentBondBetween, residentDossierRoles, residentHabitAt, residentNamedBonds,
} from '../tools/voxel-tavern/town-blockout/town-resident-environment.ts';

const anchor = [300, 250, 20] as const;

test('resident actions wait for their authoritative placement and emit no text', () => {
  assert.equal(residentHabitAt('before-story', () => undefined), undefined);
  assert.equal(residentHabitAt('world-anomaly-advanced', () => [300, NaN, 20]), undefined);
  assert.deepEqual(residentHabitAt('mine-news-returned', role => role === 'firekeeper' ? anchor : undefined),
    { role: 'firekeeper', action: 'add-wood-and-pause', logs: 3, anchor });
  assert.deepEqual(residentHabitAt('after-palace-progress', role => role === 'palace-guard' ? anchor : undefined),
    { role: 'palace-guard', action: 'wipe-lock', lettering: 'unreadable', anchor });
  assert.equal(residentHabitAt('flying-device-assembled', () => anchor)?.action, 'try-locked-gate');
});

test('the dossier relationships include every listed role without assigning placements', () => {
  assert.equal(residentNamedBonds.length, 9);
  assert.equal(new Set(residentDossierRoles).size, residentDossierRoles.length);
  for (const [a, b, cue] of residentNamedBonds) {
    const forward = residentBondBetween(a, b, () => anchor);
    assert.deepEqual(forward, residentBondBetween(b, a, () => anchor));
    assert.equal(forward?.cue, cue);
  }
  for (const role of residentDossierRoles.filter(role => role !== 'mascot')) {
    assert.deepEqual(residentBondBetween(role, 'mascot', () => anchor)?.roles, ['mascot', role]);
  }
  assert.equal(residentBondBetween('railmaster', 'sky-watch', () => anchor), undefined);
  assert.equal(residentBondBetween('registrar', 'sky-watch',
    role => role === 'registrar' ? anchor : undefined), undefined);
  assert.equal(residentBondBetween('registrar', 'sky-watch', () => anchor)?.cue, 'flags-and-lights');
});
