import assert from 'node:assert/strict';
import test from 'node:test';
import type { UndergroundMineGateStage } from '../src/presence/underground-mine-gate.ts';
import { createUndergroundMineReach } from '../src/presence/underground-mine-reach.ts';
import { createUndergroundSurvival, type UndergroundSurvivalPoint } from '../src/presence/underground-survival.ts';
import { createUndergroundVitals } from '../src/presence/underground-vitals.ts';
import { createUndergroundMineLayout } from '../tools/voxel-tavern/town-blockout/underground-mine-layout.ts';

const layer = 'mine';
const point = (x: number, y: number, z: number): UndergroundSurvivalPoint =>
  ({ layer, east: 120 + x, north: 300 - z, height: y });
const toLocal = (at: UndergroundSurvivalPoint) => [at.east - 120, at.height, 300 - at.north] as const;

function mineReach(openBackForExpansion: boolean, readGateStage?: () => UndergroundMineGateStage) {
  const mine = createUndergroundMineLayout({
    pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
    shoreLength: 8, gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
    collapse: { length: 3, width: 1.2, height: 1.3 },
    camp: { length: 10, side: 'right', extension: 5, openBackForExpansion, crystalGate: !!readGateStage },
    walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
  });
  return createUndergroundMineReach({ layer, mine, readGateStage,
    toLocal: at => at.east === 111 ? undefined : toLocal(at),
  });
}

const mouthFrom = point(0, -89.4, 44.6);
const mouthTo = point(0, -89.4, 45.4);
const shoulderFrom = point(3, -89.4, 44.6);
const shoulderTo = point(1.6, -89.4, 45.4);

test('mine reach follows the opened aperture while its shoulder and the legacy cap block', () => {
  const opened = mineReach(true);
  const closed = mineReach(false);
  try {
    assert.equal(opened.reaches(mouthFrom, mouthTo), true);
    assert.equal(opened.reaches(mouthTo, mouthFrom), true);
    assert.equal(closed.reaches(mouthFrom, mouthTo), false);
    assert.equal(opened.reaches(shoulderFrom, shoulderTo), false);
    assert.equal(opened.reaches(shoulderTo, shoulderFrom), false);
    assert.equal(opened.reaches({ ...mouthFrom, layer: 'crystal' }, mouthTo), false);
    assert.equal(opened.reaches(mouthFrom, point(3, -89.4, 45.4)), false);
    assert.equal(opened.reaches(mouthFrom, { ...mouthTo, east: 111 }), false);
    assert.equal(opened.reaches(mouthFrom, { ...mouthTo, height: Infinity }), false);
  } finally {
    opened.dispose();
    closed.dispose();
  }
});

test('mine reach respects the low collapse rock even with both endpoints in the same gallery', () => {
  const sight = mineReach(true);
  try {
    assert.equal(sight.reaches(point(0, -89.3, 31.6), point(0, -89.3, 35.4)), false);
    assert.equal(sight.reaches(point(0, -90.4, 31.6), point(0, -90.4, 35.4)), true);
  } finally {
    sight.dispose();
  }
});

test('the staged mine gate blocks standing-height rays and transmits only through its current gap', () => {
  let stage: UndergroundMineGateStage = 'closed';
  let reads = 0;
  const sight = mineReach(true, () => { reads++; return stage; });
  const before = point(0, -89.4, 138.2);
  const after = point(0, -89.4, 139.4);
  const lowBefore = point(0, -90.95, 138.2);
  const lowAfter = point(0, -90.95, 139.4);
  try {
    for (const next of ['closed', 'ajar', 'open'] as const) {
      stage = next;
      assert.equal(sight.reaches(before, after), next === 'open');
      assert.equal(sight.reaches(after, before), next === 'open');
      assert.equal(sight.reaches(lowBefore, lowAfter), next !== 'closed');
      assert.equal(sight.reaches(lowAfter, lowBefore), next !== 'closed');
      assert.equal(sight.reaches(before, point(0, -89.4, 138.6)), true);
      assert.equal(sight.reaches(shoulderFrom, shoulderTo), false);
    }
    assert.equal(reads, 18);
  } finally {
    sight.dispose();
  }
});

test('U-13 fire warmth, danger and mining sound follow the U-15 rock even within radius', () => {
  const sight = mineReach(true);
  try {
    let time = 0;
    let listener = mouthTo;
    let source = mouthFrom;
    type Lights = ReturnType<Parameters<typeof createUndergroundVitals>[0]['readLights']>;
    let lights: Lights = [];
    const vitals = createUndergroundVitals({
      now: () => time,
      readPlayer: id => id === 'listener' ? { at: listener } : id === 'miner' ? { at: source } : undefined,
      readLights: () => lights,
      reaches: sight.reaches,
      climates: { mine: { ambient: .25, degreesPerSecond: .25 } },
      initialTemperature: .5, coldBelow: .5, warmDegreesPerSecond: .5,
      coldWalkScale: .7, coldStrikeScale: .5, darknessDamageScale: 1.4, torchRadius: 5,
      noiseLifetimeMs: 800, noiseRadius: { walk: 1, run: 6, mining: 10, combat: 12 },
    });
    const sample = () => vitals.sample('listener')!;
    const dark = sample();
    assert.equal(dark.headLampRadius, 6);
    assert.equal(dark.safe, false);
    assert.equal(dark.environmentLit, false);
    assert.equal(dark.damageScale, 1.4);

    time = 1000;
    lights = [{ id: 'fire', at: source, kind: 'campfire' }];
    assert.equal(sample().temperature, .25);
    assert.equal(sample().worldLights[0]?.id, 'fire');
    assert.equal(sample().damageScale, 1);
    assert.equal(vitals.recordNoise('miner', 'mining', 1), true);
    assert.deepEqual(vitals.heardBy(listener).map(edge => edge.sequence), [1]);

    time = 2000;
    lights = [...lights, ...[45.5, 45.6, 45.7, 45.8].map((z, index) => ({
      id: 'lamp-' + index, at: point(0, -89.4, z), kind: 'mine-lamp' as const,
    }))];
    const warm = sample();
    assert.equal(warm.temperature, .75);
    assert.equal(warm.walkScale, 1);
    assert.equal(warm.strikeSpeedScale, 1);
    assert.equal(warm.safe, true);
    assert.deepEqual(warm.worldLights.map(light => light.id), ['lamp-0', 'lamp-1', 'lamp-2', 'lamp-3']);

    listener = shoulderTo;
    source = shoulderFrom;
    lights = [{ id: 'fire', at: source, kind: 'campfire' }];
    const blocked = sample();
    assert.equal(blocked.safe, false);
    assert.equal(blocked.environmentLit, false);
    assert.equal(blocked.damageScale, 1.4);
    assert.equal(vitals.recordNoise('miner', 'mining', 2), true);
    assert.deepEqual(vitals.heardBy(listener), []);

    time = 4000;
    assert.equal(sample().temperature, .25);
    assert.equal(sample().walkScale, .7);
    assert.equal(sample().strikeSpeedScale, .5);
  } finally {
    sight.dispose();
  }
});

test('U-13 accepted fire checks heal only stationary players with a clear path to a fixed fire', () => {
  const sight = mineReach(true);
  try {
    const fire = { id: 'campfire', at: shoulderFrom, kind: 'campfire' } as const;
    const coldFlame = { id: 'cold-flame', at: point(3.6, -89.4, 44.6), kind: 'cold-flame' } as const;
    const torch = { id: 'torch', at: shoulderTo, kind: 'torch', expiresAt: 5000 } as const;
    let foot = mouthTo;
    let standingStill = false;
    const vitals = createUndergroundVitals({
      now: () => 1000,
      readPlayer: () => ({ at: foot }),
      readLights: () => [torch, coldFlame, fire],
      reaches: sight.reaches,
      climates: { mine: { ambient: .25, degreesPerSecond: .25 } },
      initialTemperature: .5, coldBelow: .5, warmDegreesPerSecond: .5,
      coldWalkScale: .7, coldStrikeScale: .5, darknessDamageScale: 1.4, torchRadius: 5,
      noiseLifetimeMs: 800, noiseRadius: { walk: 1, run: 6, mining: 10, combat: 12 },
    });
    const survival = createUndergroundSurvival({
      maxHealth: 100, reconnectFromZeroHealth: 20, defaultWakePoint: { ...mouthFrom, layer: 'town', height: 2 },
      fires: [coldFlame, fire].map(({ id, at }) => ({ id, point: at, healPerSecond: 20 })),
      readBoundBed: () => undefined, readEntryMode: () => 'survival',
      readAcceptedFoot: playerId => ({ playerId, point: foot, standingStill, fireId: vitals.fireAt(foot) }),
      areTeammates: () => false, canReach: sight.reaches, now: () => 1000,
      readTripOre: () => [], chooseHalf: () => [], save: () => undefined,
    });
    assert.equal(survival.syncDepthMode('miner'), true);
    assert.equal(survival.damage('miner', { sequence: 1, kind: 'monster', amount: 30 }), true);
    assert.equal(sight.reaches(coldFlame.at, foot), true);
    assert.equal(vitals.sample('miner')?.worldLights[0]?.id, torch.id);
    assert.equal(vitals.fireAt(foot), fire.id);
    assert.equal(survival.healAtFire('miner', 2, 500), false);

    standingStill = true;
    foot = shoulderTo;
    assert.ok(Math.hypot(foot.east - fire.at.east, foot.north - fire.at.north) < 8);
    assert.equal(vitals.sample('miner')?.environmentLit, true);
    assert.equal(vitals.fireAt(foot), undefined);
    assert.equal(survival.healAtFire('miner', 2, 500), false);
    assert.equal(survival.status('miner').health, 70);

    foot = mouthTo;
    assert.equal(survival.healAtFire('miner', 2, 500), true);
    assert.equal(survival.status('miner').health, 80);
  } finally {
    sight.dispose();
  }
});
