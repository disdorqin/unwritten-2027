import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundMainlineTrack } from '../../src/shared/underground-mainline-track.js';
import { createUndergroundMainlineCart } from '../../src/presence/underground-mainline-cart.js';

function fixture() {
  const route = createUndergroundMainlineTrack({
    domainId: 'mine', waypoints: [0, 24, 48, 72, 96, 120]
      .map(m => ({ east: 0, north: -m, height: -90 })),
    turnoutMetres: 94, faults: { sleepers: 18, gauge: 48, 'turnout-rust': 83 },
    clearanceRadius: .82, gaugeMetres: 1,
    acceptsTrackStep: () => true, acceptsWorkFoot: () => true,
  });
  let clock = 1000;
  let place = route.work.camp.position;
  let domainId = 'mine';
  let permitted = true;
  let inventory = 30;
  let fail = false;
  const noise: number[] = [];
  const journal: unknown[] = [];
  const cart = createUndergroundMainlineCart({
    route, now: () => clock,
    readAcceptedFoot: playerId => ({ ...place, playerId, domainId }),
    canUse: () => permitted,
    canTransferOre: (_playerId, _oreId, pieces, direction) => direction === 'load' ? inventory >= pieces : true,
    playerCarryCapacity: () => 4,
    onAcceptedRun: (_, speed) => noise.push(speed),
    save(snapshot, ore) {
      if (fail) throw new Error('G11 cart inventory rollback');
      if (ore) inventory += ore.direction === 'load' ? -ore.pieces : ore.pieces;
      journal.push(structuredClone(snapshot));
    },
    config: {
      acceleration: 1.25, brakeDeceleration: 4.5, maxSpeed: 9,
      safeTurnoutSpeed: 3.5, recallMetresPerSecond: 12,
      maximumTickMs: 1000, actionReachMetres: 1,
    },
  });
  const state = () => cart.snapshot();
  const advance = (ms = 1000) => { clock += ms; return cart.tick(state().revision); };
  function repairAll() {
    for (const [fault, verbs] of [
      ['sleepers', ['carry-sleeper','carry-sleeper','carry-sleeper']],
      ['gauge', ['pry-gauge','pry-gauge','pry-gauge']],
      ['turnout-rust', ['knock-rust','knock-rust','knock-rust','apply-oil']],
    ] as const) {
      place = route.work[fault].position;
      for (const verb of verbs) cart.repair('miner', state().revision, fault, verb);
    }
  }
  return { cart, route, state, advance, repairAll, noise, journal,
    setPlace(v: typeof place) { place = v; },
    atCart() { place = route.sample(state().chainage).position; },
    atFault(fault: 'sleepers'|'gauge'|'turnout-rust') { place = route.work[fault].position; },
    setDomain(v: string) { domainId = v; },
    allow(v: boolean) { permitted = v; },
    fail(v: boolean) { fail = v; },
    get inventory() { return inventory; }, get clock() { return clock; },
  };
}
test('U-19 three distinct permanent repair tasks unlock one global service line, not the two-step cart', () => {
  const f = fixture();
  assert.equal(f.state().mode, 'repairing');
  assert.equal(f.cart.board('miner', 0), false);
  f.atFault('sleepers');
  assert.equal(f.cart.repair('miner', 0, 'sleepers', 'pry-gauge'), 'wrong-tool');
  assert.equal(f.cart.repair('miner', 0, 'sleepers', 'carry-sleeper'), 'repaired');
  assert.equal(f.cart.repair('miner', 0, 'sleepers', 'carry-sleeper'), 'rejected');
  f.repairAll();
  assert.equal(f.state().mode, 'stopped');
  assert.deepEqual(f.state().faults, { sleepers: 3, gauge: 3, 'turnout-rust': 4 });
  assert.equal(f.cart.repair('miner', f.state().revision, 'sleepers', 'carry-sleeper'), 'rejected');
  assert.equal(f.cart.board('miner', f.state().revision), false);
  f.atCart();
  assert.equal(f.cart.board('miner', f.state().revision), true);
  assert.equal(f.state().riderId, 'miner');
});

test('U-19 accepted passenger rolls with one authoritative revision and braking controls speed', () => {
  const f = fixture();
  f.repairAll();
  f.atCart();
  assert.equal(f.cart.board('miner', f.state().revision), true);
  assert.equal(f.cart.go('miner', f.state().revision), true);
  assert.equal(f.advance(), true);
  assert.ok(f.state().chainage > 0);
  assert.ok(f.state().speed > 0);
  assert.equal(f.noise.length, 1);
  const revision = f.state().revision;
  assert.equal(f.cart.brake('miner', revision, true), true);
  assert.equal(f.cart.brake('miner', revision, false), false);
  assert.equal(f.advance(), true);
  assert.equal(f.state().speed, 0);
  assert.equal(f.state().mode, 'stopped');
  assert.equal(f.cart.go('miner', f.state().revision), true);
  const before = f.state();
  f.setDomain('town');
  f.atCart();
  assert.equal(f.cart.leave('miner', before.revision), false);
  assert.equal(f.state().riderId, 'miner');
});

test('U-19 overspeed at uncertified turnout derails but NEVER auto-dismounts or causes G11 ore loss', () => {
  const f = fixture();
  f.repairAll();
  f.atCart();
  assert.equal(f.cart.board('miner', f.state().revision), true);
  assert.equal(f.cart.go('miner', f.state().revision), true);
  let ticks = 0;
  while (f.state().mode === 'rolling' && ++ticks < 35) f.advance();
  assert.equal(f.state().mode, 'derailed');
  assert.equal(f.state().chainage, f.route.turnoutMetres);
  assert.equal(f.state().riderId, 'miner');
  assert.equal(f.state().cargo.pieces, 0);
  f.atCart();
  assert.equal(f.cart.rerail('miner', f.state().revision), false, 'rider must choose to leave first');
  assert.equal(f.cart.leave('miner', f.state().revision), true);
  assert.equal(f.cart.rerail('miner', f.state().revision), true);
  assert.equal(f.state().mode, 'stopped');
  assert.equal(f.cart.switchTurnout('miner', f.state().revision, 'branch'), true);
  assert.equal(f.cart.board('miner', f.state().revision), true);
  assert.equal(f.cart.go('miner', f.state().revision), false,
    'the scenic spur is not an invented registered branch');
  assert.equal(f.cart.leave('miner', f.state().revision), true);
  assert.equal(f.cart.switchTurnout('miner', f.state().revision, 'gate'), true);
  assert.equal(f.cart.board('miner', f.state().revision), true);
  assert.equal(f.cart.go('miner', f.state().revision), true);
});

test('U-19 loading and unloading use G11 atomic 3x capacity and never duplicate inventory on failure', () => {
  const f = fixture();
  f.repairAll();
  f.atCart();
  assert.equal(f.cart.cargo('miner', f.state().revision, 'load', 'stardust', 13), false);
  assert.equal(f.cart.cargo('miner', f.state().revision, 'load', 'stardust', 12), true);
  assert.equal(f.inventory, 18);
  const state = f.state();
  f.fail(true);
  assert.throws(() => f.cart.cargo('miner', state.revision, 'unload', 'stardust', 5), /rollback/);
  assert.deepEqual(f.state(), state);
  assert.equal(f.inventory, 18);
  f.fail(false);
  assert.equal(f.cart.cargo('miner', state.revision, 'unload', 'stardust', 5), true);
  assert.equal(f.inventory, 23);
  assert.equal(f.state().cargo.pieces, 7);
  assert.equal(f.cart.cargo('miner', state.revision, 'unload', 'stardust', 5), false);
  assert.equal(f.cart.recall('miner', f.state().revision), false, 'loaded cart cannot teleport');
});

test('U-19 work denial and remote packets cannot repair, mount, steer, switch or alter cargo', () => {
  const f = fixture();
  f.atFault('sleepers');
  f.setDomain('town');
  assert.equal(f.cart.repair('miner', 0, 'sleepers', 'carry-sleeper'), 'rejected');
  f.setDomain('mine');
  f.allow(false);
  assert.equal(f.cart.repair('miner', 0, 'sleepers', 'carry-sleeper'), 'rejected');
  assert.equal(f.state().revision, 0);
  f.allow(true);
  f.atFault('gauge');
  assert.equal(f.cart.repair('miner', 0, 'sleepers', 'carry-sleeper'), 'rejected');
  assert.equal(f.cart.switchTurnout('miner', 0, 'branch'), false);
  assert.equal(f.cart.brake('miner', 0, true), false);
  assert.equal(f.cart.go('miner', 0), false);
  assert.equal(f.cart.rerail('miner', 0), false);
  assert.equal(f.cart.recall('miner', 0), false);
  assert.equal(f.cart.leave('miner', 0), false);
});

test('U-19 winch refuses riders and cargo, only empty end-of-line cart can be called back by held E', () => {
  const f = fixture();
  f.repairAll();
  f.atCart();
  f.cart.board('miner', f.state().revision);
  f.cart.go('miner', f.state().revision);
  for (let i = 0; i < 30 && f.state().mode === 'rolling'; i++) f.advance();
  f.atCart();
  f.cart.leave('miner', f.state().revision);
  f.cart.rerail('miner', f.state().revision);
  f.cart.switchTurnout('miner', f.state().revision, 'gate');
  f.cart.board('miner', f.state().revision);
  f.cart.go('miner', f.state().revision);
  for (let i = 0; i < 15 && f.state().mode === 'rolling'; i++) f.advance();
  assert.equal(f.state().mode, 'stopped');
  assert.equal(f.state().chainage, f.route.length);
  f.atCart();
  assert.equal(f.cart.leave('miner', f.state().revision), true);
  f.setPlace(f.route.work.camp.position);
  assert.equal(f.cart.recall('miner', f.state().revision), true);
  for (let i = 0; i < 12 && f.state().mode === 'recalling'; i++) {
    f.advance();
    f.cart.recallHold('miner', f.state().revision);
  }
  assert.equal(f.state().mode, 'stopped');
  assert.equal(f.state().chainage, 0);
  assert.equal(f.state().riderId, undefined);
});
