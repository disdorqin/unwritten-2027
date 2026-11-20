import assert from 'node:assert/strict';
import test from 'node:test';
import { boosterForgeHeatMs, createBoosterForge, type BoosterForgeProfile } from '../../src/presence/booster-forge.ts';
import { createFlightThrust } from '../../src/shared/flight-thrust.ts';
import { createZodiacStarStones, zodiacStarStoneIds, type ZodiacStarStoneId } from '../../src/shared/zodiac-star-stones.ts';

const sockets = { 'install-core': 'core-stand', place: 'stone-table', stoke: 'bellows', collect: 'outlet', fuel: 'outlet' } as const;

test('forge reserves both materials, exposes a timed outlet and saves one booster and fuel unit', () => {
  let time = 20_000;
  let fail = false;
  let beforeCommit: (() => void) | undefined;
  const profiles = new Map<string, BoosterForgeProfile>([
    ['owner', { iceCrystalShards: 2, stardustOre: 3, boosterOwned: false, fuelSeconds: 0 }],
    ['peer', { iceCrystalShards: 1, stardustOre: 0, boosterOwned: false, fuelSeconds: 0 }],
  ]);
  const ring = createZodiacStarStones({ origins: {}, installed: zodiacStarStoneIds.filter(id => id !== 'goat') });
  const options = {
    forgeId: 'u4-forge', socketIds: sockets, now: () => time,
    // Deliberately exercise non-default quantities; no game recipe amount is asserted here.
    recipe: { iceCrystalShards: 2, stardustOre: 2 },
    readInstalledStones: () => ring.ringProgress().installed,
    readProfile: (id: string) => profiles.get(id),
    save: (next: { revision: number }, change: { playerId: string; prior: BoosterForgeProfile; next: BoosterForgeProfile } | undefined,
      priorRevision: number) => {
      assert.equal(next.revision, priorRevision + 1);
      beforeCommit?.();
      if (fail) return false;
      if (change) {
        assert.deepEqual(change.prior, profiles.get(change.playerId));
        profiles.set(change.playerId, change.next);
      }
      return true;
    },
  };
  let forge = createBoosterForge(options);
  const order = (action: keyof typeof sockets, requestId = String(forge.readForge().revision), playerId = 'owner') => ({
    playerId, requestId, action, forgeId: options.forgeId, socketId: sockets[action], expectedRevision: forge.readForge().revision,
  });
  assert.equal(forge.readForge().core, 'unformed');
  assert.equal(forge.submit(order('place')).kind, 'core-required');
  const install = order('install-core', 'town-install-first', 'installer');
  assert.equal(forge.submit(install).kind, 'unavailable');
  ring.recordXiaoweiResonance(true);
  ring.inlayGoatAtFinale(true, true);
  const inRing = ring.ringProgress();
  assert.equal(forge.readForge().core, 'formed');
  assert.equal(forge.submit(order('place')).kind, 'core-required');
  fail = true;
  assert.equal(forge.submit(install).kind, 'save-failed');
  assert.equal(forge.readForge().core, 'formed');
  fail = false;
  beforeCommit = () => assert.equal(forge.submit(order('install-core', 'competing-install', 'peer')).kind, 'stale');
  assert.equal(forge.submit(install).kind, 'accepted');
  beforeCommit = undefined;
  assert.equal(forge.submit(install).kind, 'replayed');
  assert.equal(forge.submit(order('install-core', 'second-install', 'peer')).kind, 'unavailable');
  assert.deepEqual(ring.ringProgress(), inRing);
  forge = createBoosterForge({ ...options, initial: forge.snapshot() });
  assert.equal(forge.readForge().core, 'installed');
  assert.equal(forge.submit(order('place', 'peer-p1', 'peer')).kind, 'materials-missing');
  assert.equal(forge.submit({ ...order('place'), socketId: sockets.stoke }).kind, 'invalid');
  assert.equal(forge.submit({ ...order('place'), expectedRevision: 10 }).kind, 'stale');
  const placed = order('place');
  assert.equal(forge.submit(placed).kind, 'accepted');
  assert.equal(forge.submit(placed).kind, 'replayed');
  assert.deepEqual(profiles.get('owner'), { iceCrystalShards: 0, stardustOre: 1, boosterOwned: false, fuelSeconds: 0 });
  assert.equal(forge.submit(order('stoke', 'peer-s1', 'peer')).kind, 'unavailable');
  assert.equal(forge.submit(order('stoke')).kind, 'accepted');
  time += boosterForgeHeatMs / 2;
  assert.deepEqual([forge.readForge().phase, forge.readForge().heat], ['heating', .5]);
  assert.equal(forge.submit(order('collect')).kind, 'unavailable');
  forge = createBoosterForge({ ...options, initial: forge.snapshot() });
  time += boosterForgeHeatMs / 2;
  assert.equal(forge.readForge().phase, 'outlet');
  assert.equal(forge.submit(order('collect', 'peer-c1', 'peer')).kind, 'unavailable');
  fail = true;
  const picked = order('collect');
  assert.equal(forge.submit(picked).kind, 'save-failed');
  assert.equal(profiles.get('owner')!.boosterOwned, false);
  assert.equal(forge.readForge().phase, 'outlet');
  fail = false;
  assert.equal(forge.submit(picked).kind, 'accepted');
  assert.equal(forge.submit(picked).kind, 'replayed');
  assert.equal(forge.submit(order('place')).kind, 'owned');
  const fuel = order('fuel');
  assert.equal(forge.submit(fuel).kind, 'accepted');
  assert.equal(forge.submit(fuel).kind, 'replayed');
  assert.deepEqual(profiles.get('owner'), { iceCrystalShards: 0, stardustOre: 0, boosterOwned: true, fuelSeconds: 600 });
  assert.deepEqual(ring.ringProgress(), inRing);
  assert.equal(forge.readForge().core, 'installed');
});

test('duplicate ring entries, unsigned recipe costs and outstanding legacy recipes cannot authorize crafting', () => {
  const options = {
    forgeId: 'u4-forge', socketIds: sockets, now: () => 100,
    recipe: { iceCrystalShards: 1, stardustOre: 1 },
    readInstalledStones: () => [...zodiacStarStoneIds.slice(0, 11), 'mouse'] as ZodiacStarStoneId[],
    readProfile: () => undefined, save: () => true,
  };
  const oldClean = { revision: 0, receipts: [] };
  const forge = createBoosterForge({ ...options, initial: oldClean });
  assert.deepEqual(forge.snapshot(), { version: 2, coreInstalled: false, ...oldClean });
  assert.equal(forge.readForge().core, 'unformed');
  assert.throws(() => createBoosterForge({ ...options, recipe: { ...options.recipe, iceCrystalShards: 0 } }), /Invalid booster forge/);
  assert.throws(() => createBoosterForge({ ...options, recipe: { ...options.recipe, stardustOre: 1.5 } }), /Invalid booster forge/);
  assert.throws(() => createBoosterForge({ ...options, initial: { ...oldClean, revision: 1, owner: 'old-owner' } }),
    /explicit legacy recipe reconciliation/);
});

test('one fuel unit lasts 600 seconds at full and 1,200 at cruise, then returns to glide', () => {
  for (const [throttle, duration] of [['full', 600], ['cruise', 1200]] as const) {
    const power = createFlightThrust(600);
    assert.equal(power.step(90, 'off', 200).fuelSeconds, 600);
    assert.equal(power.step(duration - 1, throttle, 200).throttle, throttle);
    const last = power.step(2, throttle, 200);
    assert.equal(last.poweredSeconds, 1);
    assert.equal(last.depleted, true);
    assert.equal(last.throttle, 'off');
    assert.equal(last.fuelSeconds, 0);
    assert.equal(power.step(1, 'full', 200).liftMetres, 0);
  }
});

test('powered climb ramps, weakens near the ceiling and respects flight speed caps', () => {
  const power = createFlightThrust(600);
  const rise = power.step(.5, 'full', 880);
  assert.equal(rise.thrust, 1);
  assert.equal(rise.liftMetres, 1);
  assert.equal(rise.speedLimit, 38);
  assert.equal(power.step(1, 'full', 880).liftMetres, 4);
  assert.equal(power.step(1, 'full', 950, true).speedLimit, 40);
  assert.equal(power.step(1, 'full', 950).liftMetres, 2);
  assert.equal(power.step(1, 'full', 1000).liftMetres, 0);
  assert.equal(power.step(1, 'off', 880).speedLimit, 22);
});
