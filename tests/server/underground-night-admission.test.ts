import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundNightAdmission } from '../../src/presence/underground-night-admission.js';

const surface = { domainId: 'town', east: 20, north: 0, height: 0 };
const crater = { domainId: 'town', east: -20, north: 0, height: -5 };
const mine = { domainId: 'mine', east: 10, north: 0, height: -90 };
const isInsideMineArea = (location: typeof surface) => location.domainId === 'mine' ||
  (location.domainId === 'town' && location.east < 0);

test('new arrivals use the same authoritative flag even when a boundary sits inside the town domain', () => {
  let open: boolean | undefined;
  const admit = createUndergroundNightAdmission({
    readAcceptedFoot: playerId => ({ ...surface, playerId }),
    isInsideMineArea, readNightEntryOpen: () => open,
  });
  assert.equal(admit('visitor', crater), false);
  open = false;
  assert.equal(admit('visitor', crater), false);
  assert.equal(admit('visitor', mine), false);
  open = true;
  assert.equal(admit('visitor', crater), true);
  assert.equal(admit('visitor', mine), true);
});

test('morning never prevents remaining underground, returning by the lift, or leaving the crater', () => {
  let previous = mine;
  const admit = createUndergroundNightAdmission({
    readAcceptedFoot: playerId => ({ ...previous, playerId }), isInsideMineArea,
    readNightEntryOpen() { throw new Error('Existing visitors do not need the entry flag'); },
  });
  assert.equal(admit('visitor', mine), true);
  assert.equal(admit('visitor', crater), true);
  previous = crater;
  assert.equal(admit('visitor', mine), true);
  assert.equal(admit('visitor', surface), true);
});

test('an open window does not authorize an unregistered or mismatched player foot', () => {
  const admit = createUndergroundNightAdmission({
    readAcceptedFoot: id => id === 'visitor' ? { ...surface, playerId: 'different-player' } : undefined,
    isInsideMineArea, readNightEntryOpen: () => true,
  });
  assert.equal(admit('visitor', crater), false);
  assert.equal(admit('unknown', crater), false);
  assert.equal(admit('visitor', { ...crater, east: NaN }), false);
});
