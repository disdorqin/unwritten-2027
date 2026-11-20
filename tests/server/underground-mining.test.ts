import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundMining, type UndergroundMiningReward, type UndergroundMiningState,
} from '../../src/presence/underground-mining.js';
import { createUndergroundOreDistribution } from '../../tools/voxel-tavern/town-blockout/underground-ore-distribution.js';

const layer = 'test-mine';
const feet = { layer, east: 9, north: 10, height: -90 };
const coreAt = { layer, east: 12, north: 10, height: -90 };
const regrowMs = 3 * 600_000;
const openingKinds = ['gate-rubble', 'gate-ice', 'gate-wood', 'thin-wall'] as const;
const markers = createUndergroundOreDistribution({
  anchors: [{ id: 'test-band', depth: -90, region: 'pre-gate-waterline', evidence: 'test geometry', contains: () => true }],
  fallTraceBands: [{ id: 'test-trace', anchorId: 'test-band', evidence: 'test trace', centreline: [[10, 0, -88.8], [10, 20, -88.8]], radius: .5 }],
  points: [{ id: 'vein', anchorId: 'test-band', depth: -90, position: [10, 10, -88.8],
    mineral: 'stardust', amount: 2, fallTraceBandId: 'test-trace', firstFind: true }],
}).layers[0].markers;

type Options = Parameters<typeof createUndergroundMining>[0];
type Action = NonNullable<ReturnType<Options['accept']>>;

function setup(strikes: 3 | 4 | 5 = 3) {
  let now = 10;
  let action: Action | undefined;
  let saved: UndergroundMiningState | undefined;
  let commitError = false;
  let commitAllowed = true;
  const rewards: UndergroundMiningReward[] = [];
  const options: Options = {
    ore: markers.map(marker => ({ marker, coreAt, layer, surface: 'crystal', strikes })),
    openings: openingKinds.map((kind, i) => ({ id: kind, kind, strikes: 2, at: { ...feet, north: 9 + .25 * i } })),
    reach: 2.5,
    regrowMs,
    now: () => now,
    strikeDelayMs: playerId => playerId === 'cold' ? 800 : 400,
    accept: () => action,
    commit(_playerId, next, reward) {
      if (commitError) throw new Error('storage unavailable');
      if (!commitAllowed) return false;
      saved = next;
      if (reward) rewards.push(reward);
      return true;
    },
  };
  const mine = createUndergroundMining(options);
  function accept(sequence: number, patch: Partial<Action> = {}) {
    action = { sequence, action: 'strike', targetId: 'vein', active: true, feet, held: 'pickaxe', ...patch };
  }
  function request(sequence: number, patch: Partial<Action> = {}, player = 'p') {
    accept(sequence, patch);
    return mine.apply(player, sequence);
  }
  function breakVein() {
    let receipt;
    for (let i = 1; i <= strikes; i++) {
      receipt = request(i);
      now += 400;
    }
    assert.ok(receipt?.action === 'strike' && receipt.core);
    return receipt.core;
  }
  return { mine, options, accept, request, breakVein, rewards, setTime: (at: number) => { now = at; },
    throwOnCommit: () => { commitError = true; }, refuseCommit: () => { commitAllowed = false; },
    allowCommit: () => { commitAllowed = true; commitError = false; }, saved: () => saved };
}

test('only a verified single strike with a held pickaxe can affect a close registered target on the active layer', () => {
  const f = setup();
  assert.equal(f.mine.apply('p', 1), undefined);
  for (const invalid of [
    { sequence: 2 }, { active: false }, { held: 'other' }, { targetId: 'ordinary-wall' },
    { feet: { ...feet, layer: 'different-mine' } }, { feet: { ...feet, east: 6 } },
  ] as const) assert.equal(f.request(1, invalid), undefined);
  assert.deepEqual(f.mine.snapshot(), { deposits: [], cores: [], players: [] });
  const accepted = f.request(1);
  assert.equal(accepted?.action, 'strike');
  if (accepted?.action !== 'strike') assert.fail('expected strike');
  assert.equal(accepted.target.hits, 1);
  assert.equal(accepted.sound.at.layer, layer);
  assert.equal(f.request(1), undefined);
  assert.equal(f.request(2), undefined);
  f.setTime(410);
  assert.equal(f.request(2)?.action, 'strike');
  assert.equal(f.rewards.length, 2);
});

test('host cold state lengthens strike cadence without applying another hit or sound', () => {
  const f = setup();
  assert.equal(f.request(1, {}, 'cold')?.action, 'strike');
  f.setTime(410);
  assert.equal(f.request(2, {}, 'cold'), undefined);
  f.setTime(810);
  assert.equal(f.request(2, {}, 'cold')?.action, 'strike');
});

test('each ore strike commits a fragment, and authored 3–5 hits reveal one core without crediting it', () => {
  for (const strikes of [3, 4, 5] as const) {
    const f = setup(strikes);
    const core = f.breakVein();
    assert.equal(f.mine.readLayer(layer).targets[0].open, true);
    assert.equal(f.mine.readLayer(layer).targets[0].hits, strikes);
    assert.equal(f.mine.readLayer(layer).targets[0].mineral, 'stardust');
    assert.deepEqual(f.mine.readLayer(layer).cores, [core]);
    assert.deepEqual(f.mine.readLayer('different-mine'), { targets: [], cores: [] });
    assert.equal(f.request(strikes + 1), undefined);
    assert.equal(f.rewards.length, strikes);
    assert.ok(f.rewards.every(reward => reward.kind === 'fragment' && reward.amount === 1));
  }
});

test('E pickup resolves the core on the actual same-layer landing and can credit only one contender', () => {
  const f = setup();
  const core = f.breakVein();
  const pickup = { action: 'pickup', targetId: core.id, held: null } as const;
  assert.deepEqual(core.at, coreAt);
  assert.equal(f.request(4, pickup), undefined, 'within reach of the ore face is insufficient');
  assert.equal(f.request(4, { ...pickup, feet: { ...coreAt, layer: 'different-mine' } }), undefined);
  assert.deepEqual(f.request(4, { ...pickup, feet: coreAt }), { action: 'pickup', core });
  assert.equal(f.request(4, { ...pickup, feet: coreAt }), undefined);
  assert.equal(f.request(1, { ...pickup, feet: coreAt }, 'other'), undefined);
  assert.deepEqual(f.rewards.slice(-1), [{ kind: 'core', mineral: 'stardust', amount: 2 }]);
  assert.deepEqual(f.mine.readLayer(layer).cores, []);
});

test('restore retains loose cores and open barriers while only ore regrows after its deadline', () => {
  const f = setup();
  const core = f.breakVein();
  for (const [index, kind] of openingKinds.entries()) {
    f.setTime(1210 + index * 800);
    const targetId = kind;
    assert.equal(f.request(4 + index * 2, { targetId })?.action, 'strike');
    f.setTime(1610 + index * 800);
    const result = f.request(5 + index * 2, { targetId });
    assert.ok(result?.action === 'strike' && result.target.open);
    assert.equal(result.core, undefined);
    assert.equal(result.target.regrowAt, undefined);
  }
  const restored = createUndergroundMining(f.options, f.saved());
  f.setTime(810 + regrowMs - 1);
  assert.equal(restored.readLayer(layer).targets[0].open, true);
  f.setTime(810 + regrowMs);
  const layerView = restored.readLayer(layer);
  assert.equal(layerView.targets[0].open, false);
  assert.equal(layerView.targets[0].hits, 0);
  assert.ok(layerView.targets.slice(1).every(target => target.open));
  assert.deepEqual(layerView.cores, [core]);
  f.accept(12);
  const nextStrike = restored.apply('p', 12);
  assert.ok(nextStrike?.action === 'strike' && nextStrike.target.hits === 1);
  assert.deepEqual(restored.readLayer(layer).cores, [core]);
});

test('a refused or failed commit delivers no receipt and does not consume the hit, core or inventory credit', () => {
  const f = setup();
  f.refuseCommit();
  assert.equal(f.request(1), undefined);
  f.throwOnCommit();
  assert.throws(() => f.request(1), /storage unavailable/);
  assert.deepEqual(f.mine.snapshot(), { deposits: [], cores: [], players: [] });
  assert.deepEqual(f.rewards, []);
  f.allowCommit();
  const core = f.breakVein();
  const pickup = { action: 'pickup', targetId: core.id, feet: coreAt } as const;
  f.refuseCommit();
  assert.equal(f.request(4, pickup), undefined);
  assert.deepEqual(f.mine.readLayer(layer).cores, [core]);
  assert.equal(f.rewards.length, 3);
  f.allowCommit();
  assert.deepEqual(f.request(4, pickup), { action: 'pickup', core });
  assert.equal(f.rewards.length, 4);
});

test('registration refuses a cross-layer core, an opening with an ore ID, and surface meteor-iron', () => {
  const f = setup();
  assert.throws(() => createUndergroundMining({ ...f.options, ore: f.options.ore.map(ore => ({
    ...ore, coreAt: { ...ore.coreAt, layer: 'different-mine' },
  })) }), /same-layer core landing/);
  assert.throws(() => createUndergroundMining({ ...f.options, openings: [
    ...f.options.openings, { id: 'vein', at: feet, kind: 'thin-wall', strikes: 2 },
  ] }), /duplicate underground mining site/);
  assert.throws(() => createUndergroundMining({ ...f.options, ore: f.options.ore.map(ore => ({
    ...ore, marker: { ...ore.marker, mineral: 'meteor-iron' },
  })) }), /Invalid ore/);
});
