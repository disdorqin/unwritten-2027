import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundCrystalMimic, undergroundCrystalMimicCues,
} from '../tools/voxel-tavern/town-blockout/underground-crystal-mimic.ts';

function fixture() {
  let now = 100;
  const mimic = createUndergroundCrystalMimic({
    id: 'hall-mimic-3', crystalKind: 'host-blue-shard', wildGrade: 2, now: () => now,
  });
  return {
    mimic,
    at(milliseconds: number) { now = 100 + milliseconds; },
    hit(attackId: string, weapon: 'pickaxe' | 'snowball', actorId = 'miner') {
      return mimic.hit({ actorId, attackId, weapon });
    },
  };
}

test('the seeded phase changes only the tip by 2.5% over four seconds and uses a 1m chime range', () => {
  const { mimic, at } = fixture();
  assert.equal(mimic.sample().phase, 'disguised');
  assert.equal(mimic.sample().breathScale, 1);
  assert.ok(mimic.sample(1).chimeEligible);
  assert.equal(mimic.sample(1.001).chimeEligible, false);
  assert.equal(mimic.sample(-.01).chimeEligible, false);
  for (const [time, expected] of [[1000, 1.0125], [2000, 1.025], [3000, 1.0125], [4000, 1]]) {
    at(time);
    assert.ok(Math.abs(mimic.sample().breathScale - expected) < 1e-9);
    assert.equal(mimic.sample().canAttack, false);
  }
  at(6000);
  assert.equal(mimic.sample().breathScale, 1.025);
  assert.equal(undergroundCrystalMimicCues.breathing.part, 'tip');
  assert.equal(undergroundCrystalMimicCues.disguise.trueClusterFooting, 'broken-crystal-ring');
});

test('gaze is uninterrupted and per player, with one immutable recognition for the winning viewer', () => {
  const { mimic, at } = fixture();
  assert.deepEqual(mimic.observeSight('viewer-a', true), { kind: 'tracking', gazeMs: 0 });
  at(1000);
  assert.deepEqual(mimic.observeSight('viewer-b', true), { kind: 'tracking', gazeMs: 0 });
  at(2999);
  assert.deepEqual(mimic.observeSight('viewer-a', true), { kind: 'tracking', gazeMs: 2999 });
  mimic.observeSight('viewer-a', false);
  at(3000);
  assert.deepEqual(mimic.observeSight('viewer-a', true), { kind: 'tracking', gazeMs: 0 });
  assert.deepEqual(mimic.observeSight('viewer-b', true), { kind: 'tracking', gazeMs: 2000 });
  at(4000);
  const recognized = mimic.observeSight('viewer-b', true);
  assert.deepEqual(recognized, { kind: 'revealed', damage: 0, event: {
    kind: 'recognition', id: 'hall-mimic-3:recognition', mimicId: 'hall-mimic-3',
    actorId: 'viewer-b', at: 4100, source: 'gaze',
  } });
  assert.equal(mimic.sample().phase, 'unfolding');
  at(6001);
  assert.deepEqual(mimic.observeSight('viewer-a', true), { kind: 'ignored' });
  assert.ok(Object.isFrozen(mimic.sample().recognition));
});

test('both hit modes reveal without damage and gate combat for the full unfold and pause', () => {
  for (const weapon of ['snowball', 'pickaxe'] as const) {
    const { mimic, at, hit } = fixture();
    assert.deepEqual(hit('first', weapon), { kind: 'revealed', damage: 0, event: {
      kind: 'recognition', id: 'hall-mimic-3:recognition', mimicId: 'hall-mimic-3',
      actorId: 'miner', at: 100, source: weapon,
    } });
    assert.equal(mimic.sample().hitsRemaining, 3);
    assert.equal(mimic.sample(.5).chimeEligible, false);
    at(600);
    assert.equal(mimic.sample().unfoldProgress, .5);
    assert.deepEqual(hit('early', 'pickaxe'), { kind: 'immune', damage: 0 });
    at(1199);
    assert.equal(mimic.sample().phase, 'unfolding');
    at(1200);
    assert.equal(mimic.sample().unfoldProgress, 1);
    assert.equal(mimic.sample().phase, 'pausing');
    at(1699);
    assert.equal(mimic.sample().canAttack, false);
    assert.deepEqual(hit('late', 'snowball'), { kind: 'immune', damage: 0 });
    at(1700);
    assert.equal(mimic.sample().phase, 'combat');
    assert.equal(mimic.sample().canAttack, true);
    for (const replay of ['first', 'early', 'late']) {
      assert.deepEqual(hit(replay, weapon), { kind: 'duplicate', damage: 0 });
    }
    assert.equal(mimic.sample().hitsRemaining, 3);
  }
});

test('combat only slows on snowballs, and exactly three unique pickaxe hits drop its own crystal once', () => {
  const { mimic, at, hit } = fixture();
  hit('reveal', 'snowball');
  at(1700);
  assert.deepEqual(hit('slow', 'snowball'), { kind: 'slowed', damage: 0 });
  assert.equal(mimic.sample().hitsRemaining, 3);
  assert.deepEqual(hit('a', 'pickaxe'), { kind: 'damaged', damage: 1, hitsRemaining: 2 });
  assert.deepEqual(hit('a', 'pickaxe'), { kind: 'duplicate', damage: 0 });
  // Accepted hit IDs are local to the actor, not globally shared.
  assert.deepEqual(hit('a', 'pickaxe', 'other-miner'), { kind: 'damaged', damage: 1, hitsRemaining: 1 });
  assert.deepEqual(hit('b', 'pickaxe'), { kind: 'defeated', damage: 1, event: {
    kind: 'defeat', id: 'hall-mimic-3:defeat', mimicId: 'hall-mimic-3', actorId: 'miner',
    at: 1800, drop: { crystalKind: 'host-blue-shard', grade: 3 },
  } });
  assert.deepEqual(hit('new', 'pickaxe'), { kind: 'ignored', damage: 0 });
  assert.equal(mimic.sample().phase, 'defeated');
  assert.equal(mimic.sample().canAttack, false);
  assert.equal(mimic.sample().hitsRemaining, 0);
  assert.equal(mimic.sample().recognition?.source, 'snowball');
  assert.equal(mimic.sample().defeat?.id, 'hall-mimic-3:defeat');
});

test('the ten-second ground glimmer expires independently of the drop', () => {
  const { mimic, hit, at } = fixture();
  hit('reveal', 'pickaxe');
  at(2500);
  hit('1', 'pickaxe');
  hit('2', 'pickaxe');
  hit('3', 'pickaxe');
  assert.equal(mimic.sample().glowOpacity, 1);
  at(7500);
  assert.equal(mimic.sample().glowOpacity, .5);
  at(12_499);
  assert.ok(mimic.sample().glowOpacity > 0);
  at(12_500);
  assert.equal(mimic.sample().glowOpacity, 0);
  at(13_000);
  assert.equal(mimic.sample().glowOpacity, 0);
  assert.deepEqual(mimic.sample().drop, { crystalKind: 'host-blue-shard', grade: 3 });
});

test('invalid time and rejected hit IDs cannot advance the encounter', () => {
  const { mimic, at, hit } = fixture();
  at(80);
  mimic.sample();
  at(79);
  assert.throws(() => hit('a', 'pickaxe'), /clock went backwards/);
  at(Number.NaN);
  assert.throws(() => mimic.observeSight('viewer', true), /became invalid/);
  at(80);
  assert.deepEqual(hit('', 'pickaxe'), { kind: 'ignored', damage: 0 });
  assert.deepEqual(hit('a', 'snowball', ''), { kind: 'ignored', damage: 0 });
  assert.equal(mimic.sample().phase, 'disguised');
  assert.equal(hit('a', 'pickaxe').kind, 'revealed');
  assert.throws(() => createUndergroundCrystalMimic({
    id: 'fixture', crystalKind: 'host-blue-shard', wildGrade: Number.MAX_SAFE_INTEGER, now: () => 0,
  }), /valid identity, crystal and clock/);
});
