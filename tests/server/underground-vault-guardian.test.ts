import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundVaultGuardian, settleUndergroundVaultGuardianDamage,
} from '../../src/presence/underground-vault-guardian.ts';

type Options = Parameters<typeof createUndergroundVaultGuardian>[0];
type Hit = Parameters<ReturnType<typeof createUndergroundVaultGuardian>['hit']>[0];

function fixture(partySize = 1) {
  let now = 0;
  let core: ReturnType<Options['readCoreWindow']> = 'neither';
  let openResult: ReturnType<Options['openVault']> = 'opened';
  const openings: string[] = [];
  const guardian = createUndergroundVaultGuardian({
    encounterId: 'arena-fixture', partySize, now: () => now, soloStageHealth: 12,
    pickDamage: 6, snowDamage: 4, glancingPickDamage: 1, armourBreakHits: 2, transitionMs: 2400,
    readCoreWindow: () => core,
    openVault(id) { openings.push(id); return openResult; },
  });
  const entry = { insideArena: true, crossedMidline: true, atHandCue: false, guardianHasSight: true };
  let hitNumber = 0;
  function hit(tool: Hit['tool'], target: Hit['target'], plateId?: string, id = 'hit-' + ++hitNumber) {
    return guardian.hit({ id, actorId: 'walker', tool, target, plateId });
  }
  function fight() { guardian.updateOccupancy(entry); now += 3000; }
  function reachArmour() {
    fight();
    hit('pickaxe', 'joint');
    assert.equal(hit('pickaxe', 'joint').kind, 'transitioning');
    now += 2400;
  }
  function reachCores() {
    reachArmour();
    for (let i = 0; i < 3; i++) hit('snowball', 'armour', 'shoulder');
    assert.equal(guardian.snapshot().stage, 3);
    now += 2400;
  }
  return {
    guardian, hit, entry, fight, reachArmour, reachCores, openings,
    moveTime(ms: number) { now += ms; },
    setCore(value: typeof core) { core = value; },
    setOpenResult(value: typeof openResult) { openResult = value; },
    withdraw() { guardian.updateOccupancy({ insideArena: false, crossedMidline: false, atHandCue: false, guardianHasSight: false }); },
  };
}

test('only an accepted midline crossing starts the full three-second damage-free rising sequence', () => {
  const f = fixture();
  f.guardian.updateOccupancy({ ...f.entry, crossedMidline: false });
  assert.equal(f.guardian.snapshot().pose, 'kneeling');
  assert.equal(f.hit('pickaxe', 'joint', undefined, 'pre-fight').kind, 'immune');
  assert.equal(f.guardian.warnAttack({ id: 'early', kind: 'sweep' }), undefined);
  f.guardian.updateOccupancy(f.entry);
  assert.equal(f.guardian.snapshot().pose, 'rising');
  f.moveTime(1600);
  f.guardian.updateOccupancy({ ...f.entry, atHandCue: true });
  assert.equal(f.guardian.snapshot().handCue, true);
  f.moveTime(1399);
  assert.equal(f.hit('snowball', 'joint').kind, 'immune');
  f.moveTime(1);
  assert.equal(f.guardian.snapshot().pose, 'fighting');
  assert.equal(f.guardian.snapshot().handCue, false);
  assert.equal(f.hit('pickaxe', 'joint', undefined, 'pre-fight').kind, 'duplicate');
  assert.equal(f.guardian.snapshot().stageRemaining, 12);
});

test('stone joints take pickaxe damage, transitions block hits, and same-plate snowballs expose the armour', () => {
  const f = fixture();
  f.fight();
  assert.equal(f.hit('snowball', 'joint').kind, 'ineffective');
  assert.deepEqual(f.hit('pickaxe', 'joint'), { kind: 'damaged', damage: 6 });
  assert.deepEqual(f.hit('pickaxe', 'joint'), { kind: 'transitioning', stage: 2, damage: 6 });
  assert.equal(f.hit('pickaxe', 'armour', 'left').kind, 'immune');
  f.moveTime(2400);
  assert.deepEqual(f.hit('pickaxe', 'armour', 'left'), { kind: 'damaged', damage: 1 });
  f.hit('snowball', 'armour', 'left');
  f.hit('snowball', 'armour', 'right');
  assert.equal(f.hit('pickaxe', 'exposed-stone', 'left').kind, 'ineffective');
  assert.deepEqual(f.hit('snowball', 'armour', 'left'), { kind: 'transitioning', stage: 3, damage: 3 });
  assert.equal(f.guardian.snapshot().stageRemaining, 12);

  const g = fixture();
  g.reachArmour();
  g.hit('snowball', 'armour', 'left');
  g.hit('snowball', 'armour', 'left');
  assert.deepEqual(g.hit('pickaxe', 'exposed-stone', 'left'), { kind: 'transitioning', stage: 3, damage: 4 });
});

test('dual cores require both the matching tool and lit window, and the vault opens only after letting players pass', () => {
  const f = fixture();
  f.reachCores();
  f.setCore('stone');
  assert.equal(f.hit('snowball', 'ice-core').kind, 'ineffective');
  assert.equal(f.hit('snowball', 'stone-core').kind, 'ineffective');
  assert.deepEqual(f.hit('pickaxe', 'stone-core'), { kind: 'damaged', damage: 6 });
  f.setCore('ice');
  assert.equal(f.hit('pickaxe', 'stone-core').kind, 'ineffective');
  assert.deepEqual(f.hit('snowball', 'ice-core'), { kind: 'damaged', damage: 4 });
  f.setCore('both');
  assert.deepEqual(f.hit('pickaxe', 'stone-core'), { kind: 'yielding', damage: 2 });
  assert.equal(f.guardian.snapshot().vaultDoorOpen, false);
  assert.equal(f.guardian.confirmYielded(false), false);
  assert.deepEqual(f.openings, []);
  f.setOpenResult('rejected');
  assert.equal(f.guardian.confirmYielded(true), false);
  assert.equal(f.guardian.snapshot().pose, 'yielding');
  f.setOpenResult('already-open');
  assert.equal(f.guardian.confirmYielded(true), true);
  assert.equal(f.guardian.confirmYielded(true), false);
  assert.deepEqual(f.openings, ['arena-fixture', 'arena-fixture']);
  f.guardian.updateOccupancy(f.entry);
  assert.equal(f.guardian.snapshot().vaultDoorOpen, true);
  assert.equal(f.guardian.snapshot().coreChamberDoorOpen, false);
  assert.equal(f.guardian.snapshot().pose, 'yielded');
  assert.equal(f.hit('pickaxe', 'stone-core').kind, 'ignored');
});

test('warnings gate releases, freeze throw impact and reject a repeat attack ID', () => {
  const f = fixture();
  f.fight();
  const warning = f.guardian.warnAttack({ id: 'arm', kind: 'sweep' })!;
  assert.equal(warning.readyAt, 4200);
  assert.equal(f.guardian.releaseAttack('arm'), undefined);
  f.moveTime(1199);
  assert.equal(f.guardian.releaseAttack('arm'), undefined);
  f.moveTime(1);
  assert.deepEqual(f.guardian.releaseAttack('arm'), warning);
  assert.equal(f.guardian.releaseAttack('arm'), undefined);
  assert.equal(f.guardian.warnAttack({ id: 'arm', kind: 'sweep' }), undefined);
  // The exact host geometry choice is injected; this point only exercises immutable lock-on.
  const impact: [number, number, number] = [0, 117, -2.4];
  f.guardian.warnAttack({ id: 'ice', kind: 'throw', impact });
  impact[0] = 10;
  f.moveTime(1000);
  assert.deepEqual(f.guardian.releaseAttack('ice'),
    { id: 'ice', kind: 'throw', impact: [0, 117, -2.4], readyAt: 5200 });
});

test('retreat restores only half of the current loss; a full-party wipe resets only that stage', () => {
  const f = fixture();
  f.reachArmour();
  f.hit('snowball', 'armour', 'left', 'recorded-hit');
  f.withdraw();
  f.moveTime(9999);
  assert.equal(f.guardian.snapshot().pose, 'fighting');
  assert.equal(f.guardian.warnAttack({ id: 'pursuit', kind: 'sweep' }), undefined);
  f.moveTime(1);
  assert.equal(f.guardian.snapshot().pose, 'kneeling');
  assert.equal(f.guardian.snapshot().stage, 2);
  assert.equal(f.guardian.snapshot().stageRemaining, 10);
  f.fight();
  assert.equal(f.hit('snowball', 'armour', 'left', 'recorded-hit').kind, 'duplicate');
  assert.equal(f.guardian.retryAfterPartyWipe(), true);
  assert.equal(f.guardian.snapshot().stage, 2);
  assert.equal(f.guardian.snapshot().stageRemaining, 12);
  assert.equal(f.guardian.retryAfterPartyWipe(), false);
});

test('summons use only the reviewed roster and scale within the capped party band', () => {
  const f = fixture();
  f.fight();
  assert.equal(f.guardian.summonPlan(0), undefined);
  f.hit('pickaxe', 'joint');
  f.hit('pickaxe', 'joint');
  f.moveTime(2400);
  assert.deepEqual(f.guardian.summonPlan(0), { cap: 2, allowed: ['small-ice-golem'] });
  assert.equal(f.guardian.summonPlan(1), undefined);
  const four = fixture(6);
  four.fight();
  assert.ok(Math.abs(four.guardian.snapshot().stageHealth - 26.4) < 1e-9);
  for (let shot = 0; shot < 5; shot++) four.hit('pickaxe', 'joint');
  four.moveTime(2400);
  assert.deepEqual(four.guardian.summonPlan(0), { cap: 3, allowed: ['small-ice-golem'] });
  for (let shot = 0; shot < 7; shot++) four.hit('snowball', 'armour', 'joint');
  four.moveTime(2400);
  assert.deepEqual(four.guardian.summonPlan(0), { cap: 4, allowed: ['small-ice-golem', 'stone-monster'] });
});

test('per-attack and per-frame damage limits include repeated overlapping impacts', () => {
  const resolve = (...hits: [string, number][]) => settleUndergroundVaultGuardianDamage(100,
    hits.map(([attackId, damage]) => ({ attackId, damage })));
  assert.equal(resolve(['sweep', 200]), 50);
  assert.equal(resolve(['one-throw', 20], ['one-throw', 10], ['one-throw', 20]), 20);
  assert.equal(resolve(['sweep', 40], ['throw', 50], ['summon', 8]), 80);
  assert.equal(resolve(['bad', Number.POSITIVE_INFINITY], ['negative', -1]), 0);
});
