// Run on a joint tree containing the checked-in C sockets and D forge authority.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBoosterForge, type BoosterForgeProfile, type BoosterForgeState,
} from '../../src/presence/booster-forge.ts';
import type { UndergroundSurvivalPoint } from '../../src/presence/underground-survival.ts';
import { createUndergroundWarriorForge } from '../../src/presence/underground-warrior-forge.ts';
import { createZodiacStarStones, zodiacStarStoneIds } from '../../src/shared/zodiac-star-stones.ts';
import { createWarriorForgeHall } from '../voxel-tavern/town-blockout/underground-warrior-forge-hall.ts';

const layer = 'warrior-city-fixture';
const forgeId = 'warrior-city-forge';
const socketIds = { 'install-core': 'core-stand', place: 'stone-table', stoke: 'bellows',
  collect: 'outlet', fuel: 'outlet' } as const;

function fixture() {
  const hall = createWarriorForgeHall();
  const gauge = hall.group.getObjectByName('forge-heat-gauge');
  assert.ok(gauge);
  const ring = createZodiacStarStones({ origins: {}, installed: zodiacStarStoneIds });
  const profile: BoosterForgeProfile = { iceCrystalShards: 5, stardustOre: 10, boosterOwned: false, fuelSeconds: 0 };
  const profiles = new Map([['owner', profile], ['peer', profile]]);
  const feet = new Map<string, UndergroundSurvivalPoint>();
  let now = 100_000;
  let saveRefused = false;
  let durable: BoosterForgeState | undefined;

  const options: Parameters<typeof createBoosterForge>[0] = {
    forgeId, socketIds, now: () => now,
    // Candidate parameters used for deterministic verification, with no production defaults.
    recipe: { iceCrystalShards: 3, stardustOre: 5 },
    heating: { durationMs: 3000, min: .25, max: .75, initialLevel: .5,
      heatPerStoke: .375, decayPerSecond: .125, orePerStoke: 2, refundRounding: 'down' },
    readInstalledStones: () => ring.ringProgress().installed,
    readProfile: id => profiles.get(id),
    save(next, change, priorRevision) {
      assert.equal(durable?.revision ?? 0, priorRevision);
      if (saveRefused) return false;
      if (change) {
        assert.deepEqual(change.prior, profiles.get(change.playerId));
        profiles.set(change.playerId, change.next);
      }
      durable = next;
      return true;
    },
  };
  let authority = createBoosterForge(options);
  function socket(action: keyof typeof socketIds, stand: keyof typeof hall.stand) {
    return { id: socketIds[action], point: { ...hall.stand[stand], layer } };
  }
  const sockets = {
    place: socket('place', 'place'), stoke: socket('stoke', 'stoke'), collect: socket('collect', 'collect'),
    // The candidate uses the D review's outlet-side foot for both ancillary actions.
    'install-core': socket('install-core', 'collect'), fuel: socket('fuel', 'collect'),
  };
  const interaction = createUndergroundWarriorForge({
    forgeId, sockets, readAcceptedFoot: id => feet.get(id),
    canReach: (foot, socket) => hall.canStand(foot.east, foot.north) &&
      Math.hypot(foot.east - socket.point.east, foot.north - socket.point.north, foot.height - socket.point.height) <= .35,
    readForge: id => authority.readForge(id),
    receipt: (...args) => authority.receipt(...args),
    submit: command => authority.submit(command),
  });
  function go(action: keyof typeof sockets, playerId = 'owner') { feet.set(playerId, sockets[action].point); }
  function interact(action: keyof typeof sockets, requestId: string, playerId = 'owner') {
    return interaction.interact({ action, requestId, playerId });
  }
  function begin() {
    go('install-core', 'peer');
    assert.deepEqual(interact('install-core', 'core', 'peer'), accepted(1));
    go('place');
    assert.deepEqual(interact('place', 'recipe'), accepted(2));
    go('stoke');
    assert.deepEqual(interact('stoke', 'ignite'), accepted(3));
  }

  return { hall, begin, go, interact, snapshot: () => authority.readForge(), advance: () => authority.advance(),
    elapse: (ms: number) => { now += ms; }, profile: (id = 'owner') => profiles.get(id),
    removeFoot: (id: string) => { feet.delete(id); }, move: (id: string, point: UndergroundSurvivalPoint) => feet.set(id, point),
    rejectSave: (refuse: boolean) => { saveRefused = refuse; },
    reload: () => { authority = createBoosterForge({ ...options, initial: durable }); },
    gaugeVisible() {
      hall.updateHeat(authority.readForge().temperature);
      return gauge.visible;
    },
  };
}

function accepted(revision: number) {
  return { kind: 'submitted', result: { kind: 'accepted', revision } };
}

test('five accepted forge sockets, safe heat and retries grant one booster and one fuel charge', t => {
  const forge = fixture();
  t.after(forge.hall.dispose);
  assert.equal(forge.gaugeVisible(), false);
  forge.move('peer', { ...forge.hall.stand.collect, layer: 'crystal' });
  assert.equal(forge.interact('install-core', 'core', 'peer').kind, 'unreachable');
  forge.go('place', 'peer');
  assert.equal(forge.interact('install-core', 'core', 'peer').kind, 'unreachable');
  forge.begin();
  assert.deepEqual(forge.profile('peer'), { iceCrystalShards: 5, stardustOre: 10, boosterOwned: false, fuelSeconds: 0 });
  assert.deepEqual(forge.snapshot().temperature, { level: .5, min: .25, max: .75 });
  assert.equal(forge.gaugeVisible(), true);
  forge.elapse(1000);
  forge.go('stoke', 'peer');
  assert.deepEqual(forge.interact('stoke', 'foreign-batch', 'peer'),
    { kind: 'submitted', result: { kind: 'unavailable', phase: 'heating' } });
  assert.deepEqual(forge.interact('stoke', 'add-fuel'), accepted(4));
  assert.equal(forge.profile()?.stardustOre, 3);
  assert.equal(forge.snapshot().heat, .75);
  forge.reload();
  forge.elapse(2000);
  assert.equal(forge.snapshot().phase, 'outlet');
  assert.deepEqual(forge.interact('stoke', 'add-fuel'), { kind: 'submitted', result: { kind: 'replayed', revision: 4 } });
  forge.go('collect');
  assert.deepEqual(forge.interact('collect', 'booster'), accepted(5));
  assert.deepEqual(forge.interact('collect', 'booster'), { kind: 'submitted', result: { kind: 'replayed', revision: 5 } });
  assert.equal(forge.gaugeVisible(), false);
  forge.go('fuel');
  assert.deepEqual(forge.interact('fuel', 'charge'), accepted(6));
  assert.deepEqual(forge.interact('fuel', 'charge'), { kind: 'submitted', result: { kind: 'replayed', revision: 6 } });
  assert.deepEqual(forge.profile(), { iceCrystalShards: 2, stardustOre: 2, boosterOwned: true, fuelSeconds: 600 });
});

test('an unattended outage settles the reserved half once after a failed save and reload', t => {
  const forge = fixture();
  t.after(forge.hall.dispose);
  forge.begin();
  forge.removeFoot('owner');
  forge.elapse(2001);
  assert.equal(forge.snapshot().acceptsHeatingStoke, false);
  assert.equal(forge.snapshot().outage, true);
  assert.equal(forge.gaugeVisible(), true);
  forge.rejectSave(true);
  assert.deepEqual(forge.advance(), { kind: 'save-failed' });
  assert.deepEqual(forge.profile(), { iceCrystalShards: 2, stardustOre: 5, boosterOwned: false, fuelSeconds: 0 });
  forge.reload();
  forge.rejectSave(false);
  assert.deepEqual(forge.advance(), { kind: 'accepted', revision: 4, heatingFailure: 'outage' });
  assert.deepEqual(forge.profile(), { iceCrystalShards: 3, stardustOre: 7, boosterOwned: false, fuelSeconds: 0 });
  forge.reload();
  assert.equal(forge.advance(), undefined);
  assert.equal(forge.gaugeVisible(), false);
  assert.equal(forge.snapshot().core, 'installed');
});

test('overheat at the bellows atomically charges the stoke and refunds half, including after replay', t => {
  const forge = fixture();
  t.after(forge.hall.dispose);
  forge.begin();
  const fail = (kind: 'accepted' | 'replayed') =>
    ({ kind: 'submitted', result: { kind, revision: 4, heatingFailure: 'overheat' } });
  forge.rejectSave(true);
  assert.deepEqual(forge.interact('stoke', 'too-hot'), { kind: 'submitted', result: { kind: 'save-failed' } });
  assert.equal(forge.snapshot().phase, 'heating');
  forge.rejectSave(false);
  assert.deepEqual(forge.interact('stoke', 'too-hot'), fail('accepted'));
  assert.deepEqual(forge.profile(), { iceCrystalShards: 3, stardustOre: 5, boosterOwned: false, fuelSeconds: 0 });
  forge.reload();
  assert.deepEqual(forge.interact('stoke', 'too-hot'), fail('replayed'));
  assert.deepEqual(forge.profile(), { iceCrystalShards: 3, stardustOre: 5, boosterOwned: false, fuelSeconds: 0 });
  assert.equal(forge.gaugeVisible(), false);
});
