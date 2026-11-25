import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addUndergroundFireFuel, projectUndergroundFire } from '../../src/shared/underground-fire-cycle.js';
import { createUndergroundExpeditionCamps } from '../../src/presence/underground-expedition-camps.js';
import { createUndergroundVitals } from '../../src/presence/underground-vitals.js';

const fire = { maximumFuel: 10, weakBelowFuel: 2, burnFuelPerMs: .001 };
const campSite = { layer: 'mine', east: 12, north: 8, height: -90 };
function setup() {
  let clock = 1000;
  const feet = new Map([
    ['miner', { playerId: 'miner', ...campSite }],
    ['helper', { playerId: 'helper', ...campSite }],
  ]);
  let wood = 8;
  let tinder = 4;
  let fail = false;
  let ground = true;
  let idCounter = 0;
  const receipts: unknown[] = [];
  const camps = createUndergroundExpeditionCamps({
    now: () => clock, allocateCampId: () => 'camp/' + ++idCounter,
    readAcceptedFoot: playerId => feet.get(playerId),
    canReach: (_playerId, from, to) => from.layer === to.layer &&
      Math.hypot(from.east - to.east, from.north - to.north, from.height - to.height) <= 3,
    supportsFlatFirePoint: () => ground, isFreeGround: () => ground,
    canSpend: (_, debit) => wood >= debit.wood && tinder >= debit.tinder,
    save(snapshot, debit) {
      if (fail) throw new Error('inventory and camp rollback');
      if (debit) { wood -= debit.wood; tinder -= debit.tinder; }
      receipts.push(structuredClone(snapshot));
    },
    fire, buildFuel: 6, stokeFuel: 4, buildWood: 2, buildTinder: 1, stokeWood: 1,
    maximumCamps: 3, minimumSeparation: 3.5, maximumReach: 2.4,
  });
  return { camps, receipts, get clock() { return clock; }, get wood() { return wood; },
    get tinder() { return tinder; }, next(ms: number) { clock += ms; },
    setGround(value: boolean) { ground = value; },
    fail(value: boolean) { fail = value; },
    setFoot(id: 'miner' | 'helper', site: typeof campSite) { feet.set(id, { playerId: id, ...site }); } };
}
test('U-18 shared fire clock yields burning, weak, out and rekindled phases deterministically', () => {
  const initial = { fuel: 6, atMs: 1000 };
  assert.equal(projectUndergroundFire(initial, 1000, fire).phase, 'burning');
  assert.equal(projectUndergroundFire(initial, 6000, fire).phase, 'weak');
  assert.equal(projectUndergroundFire(initial, 8000, fire).phase, 'out');
  const lit = addUndergroundFireFuel(initial, 4, 9000, fire);
  assert.ok(lit && lit.phase === 'burning');
  assert.equal(lit.fuel, 4);
  assert.equal(addUndergroundFireFuel({ fuel: 10, atMs: 1000 }, 1, 1000, fire), undefined);
  assert.throws(() => projectUndergroundFire(initial, 999, fire), /clock/);
  assert.throws(() => addUndergroundFireFuel(initial, -1, 1000, fire), /fuel/);
});

test('U-18 single miner builds a registered camp; server U-13 light/fireAt disappears when fuel is out', () => {
  const f = setup();
  assert.equal(f.camps.activeU13FireSources('mine').length, 0);
  assert.deepEqual(f.camps.build('miner', 0, campSite), { kind: 'built', id: 'camp/1' });
  assert.equal(f.wood, 6);
  assert.equal(f.tinder, 3);
  assert.equal(f.camps.snapshot().revision, 1);
  assert.deepEqual(f.camps.activeU13FireSources('mine'), [
    { id: 'camp/1', at: campSite, kind: 'campfire' },
  ]);
  const vitals = createUndergroundVitals({
    now: () => f.clock, readPlayer: id => id === 'miner' ? { at: campSite } : undefined,
    readLights: layer => f.camps.activeU13FireSources(layer),
    reaches: () => true,
    climates: { mine: { ambient: .2, degreesPerSecond: .03 } },
    initialTemperature: .8, coldBelow: .4, warmDegreesPerSecond: .15,
    coldWalkScale: .7, coldStrikeScale: .6, darknessDamageScale: 1.5,
    torchRadius: 4, noiseLifetimeMs: 1000,
    noiseRadius: { walk: 2, run: 4, mining: 8, combat: 12 },
  });
  assert.equal(vitals.fireAt(campSite), 'camp/1');
  assert.equal(vitals.sample('miner')?.safe, true);
  f.next(6_200);
  assert.equal(f.camps.activeU13FireSources('mine').length, 0);
  assert.equal(vitals.fireAt(campSite), undefined);
  assert.equal(vitals.sample('miner')?.safe, false);
  assert.equal(f.camps.stoke('miner', 1, 'camp/1'), 'lit');
  assert.equal(vitals.fireAt(campSite), 'camp/1');
  assert.equal(vitals.sample('miner')?.safe, true);
});

test('U-18 helper can tend shared camp while original miner is away; stale revisions cannot burn inventory', () => {
  const f = setup();
  assert.deepEqual(f.camps.build('miner', 0, campSite), { kind: 'built', id: 'camp/1' });
  f.next(4000);
  const oldWood = f.wood;
  assert.equal(f.camps.stoke('helper', 0, 'camp/1'), 'unavailable');
  assert.equal(f.wood, oldWood);
  assert.equal(f.camps.stoke('helper', 1, 'camp/1'), 'lit');
  assert.equal(f.wood, oldWood - 1);
  assert.equal(f.camps.snapshot().revision, 2);
  assert.equal(f.camps.stoke('miner', 1, 'camp/1'), 'unavailable');
  assert.equal(f.camps.activeU13FireSources('mine').length, 1);
});

test('U-18 requires certified flat terrain, actor reach, non-overlap and G-11 inventory debit', () => {
  const f = setup();
  f.setGround(false);
  assert.equal(f.camps.build('miner', 0, campSite), 'unavailable');
  f.setGround(true);
  assert.deepEqual(f.camps.build('miner', 0, campSite), { kind: 'built', id: 'camp/1' });
  assert.equal(f.camps.build('miner', 1, { ...campSite, east: 13 }), 'unavailable');
  assert.equal(f.camps.build('miner', 1, { ...campSite, layer: 'town' }), 'unavailable');
  assert.equal(f.camps.build('miner', 1, { ...campSite, east: Infinity }), 'unavailable');
  f.setFoot('miner', { ...campSite, east: 1000 });
  assert.equal(f.camps.stoke('miner', 1, 'camp/1'), 'unavailable');
  assert.equal(f.camps.snapshot().camps.length, 1);
});

test('U-18 atomic G-11 failure cannot leave ghost fireplaces or steal fuel; later retry succeeds', () => {
  const f = setup();
  f.fail(true);
  assert.throws(() => f.camps.build('miner', 0, campSite), /rollback/);
  assert.equal(f.camps.snapshot().revision, 0);
  assert.equal(f.camps.snapshot().camps.length, 0);
  assert.equal(f.wood, 8);
  assert.equal(f.tinder, 4);
  f.fail(false);
  assert.deepEqual(f.camps.build('miner', 0, campSite), { kind: 'built', id: 'camp/2' });
  f.next(6000);
  f.fail(true);
  assert.throws(() => f.camps.stoke('helper', 1, 'camp/2'), /rollback/);
  assert.equal(f.camps.snapshot().revision, 1);
  assert.equal(f.wood, 6);
  f.fail(false);
  assert.equal(f.camps.stoke('helper', 1, 'camp/2'), 'lit');
  assert.equal(f.camps.snapshot().revision, 2);
});

test('U-18 validates corrupted camp payloads and cannot become a second U-13 recovery rule', () => {
  const f = setup();
  assert.deepEqual(f.camps.build('miner', 0, campSite), { kind: 'built', id: 'camp/1' });
  const p = f.camps.visibleCamps();
  assert.equal(p.length, 1);
  assert.equal('healPerSecond' in p[0], false);
  assert.equal('safeRadius' in p[0], false);
  f.next(6500);
  assert.equal(f.camps.visibleCamps()[0].fire.phase, 'out');
  assert.equal(f.camps.tick(f.camps.snapshot().revision), true);
  assert.equal(f.camps.activeU13FireSources('mine').length, 0);
  assert.equal(f.camps.tick(f.camps.snapshot().revision), false);
});
