import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundPumpHouse, pumpHouseLogbook, type PumpHouseSnapshot,
} from '../../src/presence/underground-pump-house.js';

function setup(initial?: PumpHouseSnapshot) {
  let clock = initial?.lastAtMs ?? 10_000;
  let foot = { playerId: 'miner', domainId: 'mine/pump', east: 12, north: 22, height: -90 };
  let canUse = true;
  let stamina = 50;
  let failSave = false;
  const receipts: PumpHouseSnapshot[] = [];
  const host = createUndergroundPumpHouse({
    domainId: 'mine/pump', now: () => clock,
    readAcceptedFoot: player => player === foot.playerId ? foot : undefined,
    canUse: () => canUse,
    canSpendStamina: (_, amount) => stamina >= amount,
    mayCross: () => true,
    isRegisteredLowWaterOre: (_, id) => id === 'side/one',
    save(next, debit) {
      if (failSave) throw new Error('atomic transaction rejected');
      if (debit) stamina -= debit.stamina;
      receipts.push(structuredClone(next));
    },
    initial,
    config: { drainPerSecond: .13, refillPerSecond: .015, passageWaterLimit: .55,
      jamEveryPumpMs: 5_200, pumpHeartbeatMaxMs: 1_200, staminaPerSecond: 2,
      blockageStrikes: 3 },
  });
  function pump() { return host.pump('miner', host.snapshot().revision); }
  function interact(action: Parameters<typeof host.interact>[2]) {
    return host.interact('miner', host.snapshot().revision, action);
  }
  return { host, pump, interact, receipts, get stamina() { return stamina; },
    setClock(t: number) { clock = t; },
    next(ms: number) { clock += ms; },
    setFoot(next: Partial<typeof foot>) { foot = { ...foot, ...next }; },
    allow(value: boolean) { canUse = value; }, fail(value: boolean) { failSave = value; } };
}

test('U-17 phase 1: holds drain only from accepted sequential time and never from forged revisions or cross-domain feet', () => {
  const f = setup();
  assert.equal(f.host.snapshot().water, 1);
  assert.equal(f.host.projected()?.passageOpen, false);
  assert.equal(f.host.pump('miner', 99), 'rejected');
  f.setFoot({ domainId: 'west' });
  assert.equal(f.pump(), 'rejected');
  f.setFoot({ domainId: 'mine/pump' });
  assert.equal(f.pump(), 'pumping');
  assert.equal(f.host.snapshot().water, 1);
  f.next(1000);
  assert.equal(f.pump(), 'pumping');
  assert.ok(f.host.snapshot().water < .89);
  assert.equal(f.stamina, 48);
  assert.equal(f.receipts.length, 2);
  f.next(10_000);
  assert.equal(f.pump(), 'pumping', 'stale hold is a fresh press, not ten seconds of free work');
  assert.ok(f.host.snapshot().water > .9, 'long absence refloods');
  const settled = f.host.snapshot().water;
  f.allow(false);
  f.next(500);
  assert.equal(f.pump(), 'rejected');
  assert.equal(f.host.snapshot().water, settled);
});

test('U-17 phase 4: single player drains to traversable waterline, enters ore window, jams, repairs three actions, and can pump again', () => {
  const f = setup();
  assert.equal(f.interact('journal'), 'read');
  assert.equal(f.interact('journal'), 'read');
  assert.deepEqual(f.host.snapshot().journalReaders, ['miner']);
  assert.equal(f.pump(), 'pumping');
  for (let step = 0; step < 6; step++) {
    f.next(1_000);
    const result = f.pump();
    if (step < 5) assert.equal(result, 'pumping');
    else assert.equal(result, 'jammed');
  }
  const before = f.host.snapshot();
  assert.equal(before.stage, 'jammed');
  assert.equal(before.pumpedMs, 5200);
  assert.equal(before.water < .55, true, 'single-player pump can expose the bridge');
  assert.equal(f.host.canCross('miner'), true);
  assert.equal(f.host.canMineLowWaterOre('miner', 'side/one'), true);
  assert.equal(f.host.canMineLowWaterOre('miner', 'not-registered'), false);
  assert.equal(f.interact('reset-lever'), 'rejected');
  assert.equal(f.interact('strike-blockage'), 'rejected');
  assert.equal(f.interact('open-cover'), 'opened');
  assert.equal(f.interact('open-cover'), 'rejected');
  assert.equal(f.interact('strike-blockage'), 'struck');
  assert.equal(f.interact('strike-blockage'), 'struck');
  assert.equal(f.interact('strike-blockage'), 'cleared');
  assert.equal(f.interact('strike-blockage'), 'rejected');
  assert.equal(f.interact('reset-lever'), 'reset');
  assert.equal(f.host.snapshot().repairedJams, 1);
  assert.equal(f.host.snapshot().stage, 'running');
  assert.equal(f.pump(), 'pumping', 'repaired pump restarts only with a new deliberate hold');
  assert.equal(f.host.snapshot().pumpedMs, 0);
  f.next(55_000);
  assert.equal(f.host.projected()?.passageOpen, false, 'water returns if nobody keeps pumping');
  assert.equal(f.host.canCross('miner'), false);
  assert.equal(f.host.canMineLowWaterOre('miner', 'side/one'), false);
  assert.equal(pumpHouseLogbook.pages.length, 4);
  assert.ok(pumpHouseLogbook.pages.every(page => page.length > 25));
});

test('U-17 saves water, stamina and repair as an atomic authority transaction, preserving revision and energy on failure', () => {
  const f = setup();
  assert.equal(f.pump(), 'pumping');
  f.next(1000);
  const before = f.host.snapshot();
  const energyBefore = f.stamina;
  f.fail(true);
  assert.throws(() => f.pump(), /atomic transaction rejected/);
  assert.deepEqual(f.host.snapshot(), before);
  assert.equal(f.stamina, energyBefore);
  f.fail(false);
  assert.equal(f.pump(), 'pumping');
  assert.equal(f.stamina, energyBefore - 2);
  assert.equal(f.host.snapshot().revision, before.revision + 1);
  assert.equal(f.host.pump('miner', before.revision), 'rejected');
});

test('U-17 survives reloads without replaying water work, persists reader IDs and refuses malformed snapshots', () => {
  const f = setup();
  assert.equal(f.interact('journal'), 'read');
  assert.equal(f.pump(), 'pumping');
  f.next(500);
  assert.equal(f.pump(), 'pumping');
  const state = f.host.snapshot();
  const g = setup(state);
  assert.deepEqual(g.host.snapshot(), state);
  assert.equal(g.interact('journal'), 'read');
  assert.equal(g.host.snapshot().revision, state.revision);
  assert.throws(() => setup({ ...state, water: 2 }), /Invalid persisted/);
  assert.throws(() => setup({ ...state, revision: -1 }), /Invalid persisted/);
  assert.throws(() => setup({ ...state, journalReaders: ['miner', 'miner'] }), /Invalid persisted/);
  assert.throws(() => setup({ ...state, lastPumpAtMs: state.lastAtMs + 1 }), /Invalid persisted/);
});

test('U-17 rejects unsupported/unauthorized actions and never crosses or grants minerals by UI alone', () => {
  const f = setup();
  assert.equal(f.host.canCross('visitor'), false);
  assert.equal(f.host.canMineLowWaterOre('visitor', 'side/one'), false);
  f.setFoot({ playerId: 'visitor' });
  assert.equal(f.pump(), 'rejected');
  assert.equal(f.interact('journal'), 'rejected');
  f.setFoot({ playerId: 'miner', height: Infinity });
  assert.equal(f.pump(), 'rejected');
  assert.equal(f.interact('open-cover'), 'rejected');
  assert.equal(f.receipts.length, 0);
});

test('U-17 refuses nonsensical pump settings without quietly inventing a G-09 stamina constant', () => {
  const f = setup();
  assert.equal(typeof f.host.snapshot().revision, 'number');
  // No default rates: caller must explicitly supply rates and U-13 stamina billing.
  assert.throws(() => createUndergroundPumpHouse({
    domainId: 'bad', now: () => 0,
    readAcceptedFoot: () => undefined, canUse: () => true, canSpendStamina: () => true,
    save: () => undefined, mayCross: () => true, isRegisteredLowWaterOre: () => false,
    config: { drainPerSecond: 0, refillPerSecond: 1, passageWaterLimit: .5,
      jamEveryPumpMs: 2_000, pumpHeartbeatMaxMs: 10_000, staminaPerSecond: 0, blockageStrikes: 1 },
  }), /pump profile/);
});
