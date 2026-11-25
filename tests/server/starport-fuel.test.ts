import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStarportFuelDispenser, type StarportFuelProfile } from '../../src/presence/starport-fuel';
import { fuelSecondsPerStardustOre } from '../../src/shared/flight-thrust';

const pad = { east: 324, north: 657, height: 347 };
const initial = (): StarportFuelProfile => ({ revision: 5, assembled: true, stardustOre: 2, fuelSeconds: 20 });

function fixture() {
  let profile = initial();
  let foot = { area: 'mountain', at: { ...pad }, grounded: true };
  let commits = 0;
  let permitted = true;
  const fuel = createStarportFuelDispenser({ area: 'mountain', point: pad }, {
    foot: () => foot,
    profile: () => profile,
    commit(_player, oldRevision, next) {
      commits++;
      if (!permitted || oldRevision !== profile.revision) return false;
      profile = next;
      return true;
    },
  });
  return { fuel, current: () => profile, commits: () => commits,
    setFoot(next: typeof foot) { foot = next; },
    setProfile(next: StarportFuelProfile) { profile = next; },
    setPermission(next: boolean) { permitted = next; } };
}

test('F-6 at a grounded starport pad atomically consumes one ore for 600 full-thrust seconds', () => {
  const t = fixture();
  assert.deepEqual(t.fuel.inspect(1), { revision: 5, ore: 2, fuelSeconds: 20,
    fullThrustSecondsPerOre: fuelSecondsPerStardustOre });
  assert.equal(fuelSecondsPerStardustOre, 600);
  assert.equal(t.fuel.refill(1, 5), true);
  assert.deepEqual(t.current(), { revision: 6, assembled: true, stardustOre: 1, fuelSeconds: 620 });
  assert.equal(t.fuel.refill(1, 5), false, 'stale request must never debit twice');
  assert.equal(t.fuel.refill(1, 6), true);
  assert.deepEqual(t.current(), { revision: 7, assembled: true, stardustOre: 0, fuelSeconds: 1220 });
  assert.equal(t.fuel.refill(1, 7), false, 'empty tank stock cannot be overdrawn');
  assert.equal(t.commits(), 2);
});

test('F-6 rejects untrusted or moving feet and never writes a profile', () => {
  const t = fixture();
  const invalid = [
    { area: 'town', at: { ...pad }, grounded: true },
    { area: 'mountain', at: { ...pad }, grounded: false },
    { area: 'mountain', at: { ...pad, east: pad.east + 1.101 }, grounded: true },
    { area: 'mountain', at: { ...pad, height: pad.height + .431 }, grounded: true },
    { area: 'mountain', at: { ...pad, north: Infinity }, grounded: true },
  ];
  for (const foot of invalid) {
    t.setFoot(foot);
    assert.equal(t.fuel.inspect(1), undefined);
    assert.equal(t.fuel.refill(1, 5), false);
  }
  t.setFoot({ area: 'mountain', at: { ...pad }, grounded: true });
  for (const id of [-1, 0, 1.5, NaN, Infinity]) {
    assert.equal(t.fuel.inspect(id), undefined);
    assert.equal(t.fuel.refill(id, 5), false);
  }
  assert.deepEqual(t.current(), initial());
  assert.equal(t.commits(), 0);
});

test('F-6 rejects unassembled or malformed authoritative inventory, failed CAS preserves state', () => {
  const t = fixture();
  for (const profile of [
    { ...initial(), assembled: false },
    { ...initial(), revision: -1 },
    { ...initial(), stardustOre: -1 },
    { ...initial(), fuelSeconds: NaN },
  ]) {
    t.setProfile(profile);
    assert.equal(t.fuel.inspect(1), undefined);
    assert.equal(t.fuel.refill(1, 5), false);
  }
  t.setProfile(initial());
  t.setPermission(false);
  assert.equal(t.fuel.refill(1, 5), false);
  assert.equal(t.commits(), 1);
  assert.deepEqual(t.current(), initial());
});

test('F-6 refuses malformed stations and overflowing credit', () => {
  assert.throws(() => createStarportFuelDispenser({ area: '', point: pad },
    { foot: () => undefined, profile: () => undefined, commit: () => true }));
  assert.throws(() => createStarportFuelDispenser({ area: 'mountain', point: { ...pad, height: NaN } },
    { foot: () => undefined, profile: () => undefined, commit: () => true }));
  const t = fixture();
  t.setProfile({ ...initial(), fuelSeconds: Number.MAX_VALUE });
  assert.equal(t.fuel.refill(1, 5), false);
  assert.equal(t.commits(), 0);
});
