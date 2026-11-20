import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundVitals } from '../../src/presence/underground-vitals.js';
import { createUndergroundMining } from '../../src/presence/underground-mining.js';
import type { UndergroundSurvivalPoint } from '../../src/presence/underground-survival.js';

type Settings = Parameters<typeof createUndergroundVitals>[0];
const at = (east = 0, layer = 'mine'): UndergroundSurvivalPoint => ({ east, north: 0, height: -90, layer });

function setup() {
  let time = 0;
  let foot: { at: UndergroundSurvivalPoint; hotDrink?: boolean } | undefined = { at: at() };
  let blocked = false;
  const lights: ReturnType<Settings['readLights']>[number][] = [];
  const vitals = createUndergroundVitals({
    now: () => time, readPlayer: id => id === 'miner' ? foot : undefined,
    readLights: () => lights, reaches: () => !blocked,
    climates: { mine: { ambient: .2, degreesPerSecond: .25 }, core: { ambient: .8, degreesPerSecond: .4 } },
    initialTemperature: .65, coldBelow: .5, warmDegreesPerSecond: .5,
    coldWalkScale: .7, coldStrikeScale: .5, darknessDamageScale: 1.4, torchRadius: 5,
    noiseLifetimeMs: 800, noiseRadius: { walk: 1, run: 6, mining: 10, combat: 12 },
  });
  return {
    vitals, lights,
    time(value: number) { time = value; }, now: () => time,
    move(next: typeof foot) { foot = next; },
    block(value: boolean) { blocked = value; },
  };
}

test('body temperature cools, warms by an approved heat source, and cannot tick twice on one timestamp', () => {
  const f = setup();
  const sample = () => f.vitals.sample('miner')!;
  assert.equal(sample().temperature, .65);
  f.time(1000);
  assert.equal(sample().walkScale, .7);
  assert.equal(sample().strikeSpeedScale, .5);
  assert.equal(sample().temperature, .4);
  f.time(500);
  assert.equal(sample().temperature, .4);
  f.move({ at: at(), hotDrink: true });
  assert.equal(sample().temperature, .4);
  f.time(2000);
  assert.equal(sample().temperature, .9);
  assert.equal(sample().walkScale, 1);
  f.move({ at: at(0, 'core') });
  sample();
  f.time(3000);
  assert.equal(sample().temperature, .8);
  f.move({ at: at(0, 'town') });
  assert.equal(f.vitals.sample('miner'), undefined);
});

test('head lamp visibility is separate from danger; fire safety, ray blocking and torch expiry are layer-bound', () => {
  const f = setup();
  const sample = () => f.vitals.sample('miner')!;
  assert.equal(sample().headLampRadius, 6);
  assert.equal(sample().damageScale, 1.4);
  f.lights.push({ id: 'other-layer', kind: 'campfire', at: at(0, 'core') },
    { id: 'near-torch', kind: 'torch', at: at(2), expiresAt: 600 });
  assert.equal(sample().environmentLit, true);
  assert.equal(sample().safe, false);
  assert.equal(sample().damageScale, 1);
  f.block(true);
  assert.equal(sample().environmentLit, false);
  f.block(false);
  f.time(600);
  assert.equal(sample().environmentLit, false);
  f.lights.push({ id: 'fire', kind: 'cold-flame', at: at(2) });
  for (let i = 3; i < 8; i++) f.lights.push({ id: 'lamp-' + i, kind: 'mine-lamp', at: at(i - 5) });
  assert.equal(sample().safe, true);
  assert.equal(sample().worldLights.length, 4);
  assert.ok(sample().worldLights.every(light => light.at.layer === 'mine'));
});

test('accepted walk, run and mining edges have separate reach, layer isolation, occlusion and expiry', () => {
  const f = setup();
  assert.equal(f.vitals.recordNoise('missing', 'run', 1), false);
  assert.equal(f.vitals.recordNoise('miner', 'walk', 1), true);
  assert.equal(f.vitals.recordNoise('miner', 'walk', 1), false);
  assert.equal(f.vitals.recordNoise('miner', 'run', 1), true);
  assert.equal(f.vitals.recordNoise('miner', 'mining', 1), true);
  assert.deepEqual(f.vitals.heardBy(at(7)).map(sound => sound.activity), ['mining']);
  assert.deepEqual(f.vitals.heardBy(at(0, 'core')), []);
  f.block(true);
  assert.deepEqual(f.vitals.heardBy(at()), []);
  f.block(false);
  f.time(800);
  assert.deepEqual(f.vitals.heardBy(at()), []);
  assert.equal(f.vitals.recordNoise('miner', 'mining', 1), false);
  assert.equal(f.vitals.recordNoise('miner', 'combat', 1), true);
  f.vitals.forget('miner');
  assert.deepEqual(f.vitals.heardBy(at()), []);
});

test('U-8 consumes the cold strike pace and only committed blows produce audible mining edges', () => {
  const f = setup();
  f.vitals.sample('miner');
  f.time(2000);
  const mining = createUndergroundMining({
    ore: [{ marker: { id: 'vein', position: [0, 0, -90], mineral: 'ordinary-ore', amount: 1 },
      layer: 'mine', coreAt: at(), surface: 'rock', strikes: 3 }],
    openings: [], reach: 2, regrowMs: 10_000, now: f.now,
    strikeDelayMs: id => Math.ceil(100 / (f.vitals.sample(id)?.strikeSpeedScale ?? 1)),
    accept: (_, sequence) => ({ sequence, action: 'strike', targetId: 'vein', feet: at(), active: true, held: 'pickaxe' }),
    commit: () => true,
  });
  const attempt = (sequence: number) => {
    const result = mining.apply('miner', sequence);
    if (result?.action === 'strike') f.vitals.recordNoise('miner', 'mining', sequence);
    return result?.action === 'strike' ? result.target.hits : undefined;
  };
  assert.equal(attempt(1), 1);
  f.time(2100);
  assert.equal(attempt(2), undefined);
  assert.equal(f.vitals.heardBy(at(7))[0]?.sequence, 1);
  f.time(2200);
  assert.equal(attempt(3), 2);
  assert.equal(f.vitals.heardBy(at(7))[0]?.sequence, 3);
});
