import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundSurvival, type UndergroundSurvivalOptions } from '../src/presence/underground-survival.ts';
import {
  createUndergroundRecoveryFirePresentation, readUndergroundRecoveryFireReferences,
  type UndergroundRecoveryFireSite,
} from '../tools/voxel-tavern/town-blockout/underground-recovery-fires.ts';

const camp: UndergroundRecoveryFireSite = {
  fire: { id: 'test-camp', point: { layer: 'mine', east: -2.5, north: 40, height: -91 },
    healPerSecond: 7, recovery: true },
  radius: 2.5, tone: 'warm',
};
const cold: UndergroundRecoveryFireSite = {
  fire: { id: 'test-cold', point: { layer: 'city', east: 7, north: 9, height: -165 }, healPerSecond: 5 },
  radius: 3, tone: 'cold',
};
const toScene = ({ east, north, height }: typeof camp.fire.point) => [east + 5, height + 100, -north] as const;

test('the mine, cave and palace reserves retain their original frames and city still exposes its missing centre', () => {
  const mineRecovery = [-2.5, -91, 40] as const;
  const fireReserve = { east: -2.6, north: 100.8, height: -2.4 };
  const references = readUndergroundRecoveryFireReferences({
    camp: { recovery: mineRecovery }, palace: { fireReserve }, cave: {
      hallFirePad: [-9.8, 37.5], poolFirePad: [6.6, 62.4],
      floorAt: (east, north) => east === -9.8 && north === 37.5 ? -1.152 : undefined,
    },
  });
  assert.deepEqual(references.mineCamp, { depth: -90, tone: 'warm', frame: 'mine-local-xyz', position: mineRecovery });
  assert.deepEqual(references.crystalHall.position, { east: -9.8, north: 37.5, height: -1.152 });
  assert.equal(references.crystalPool.position, undefined);
  assert.deepEqual(references.warriorSquare, { depth: -165, tone: 'cold', missing: 'statue-base-fire-reserve' });
  assert.deepEqual(references.palaceForecourt.position, fireReserve);
  assert.equal(readUndergroundRecoveryFireReferences().mineCamp.position, undefined);
});

test('rings use the registered radii and only highlight a confirmed fire in its own layer', t => {
  const view = createUndergroundRecoveryFirePresentation([camp, cold], toScene);
  t.after(view.dispose);
  assert.deepEqual(view.fires, [camp.fire, cold.fire]);
  const [warmRing, coldRing] = view.group.children as Array<typeof view.group.children[number] & {
    material: { color: { getHexString(): string }; opacity: number; addEventListener(type: 'dispose', listener: () => void): void };
    geometry: { parameters: { outerRadius: number }; addEventListener(type: 'dispose', listener: () => void): void };
  }>;
  assert.equal(warmRing.name, 'recovery-fire/test-camp');
  assert.equal(warmRing.geometry.parameters.outerRadius * warmRing.scale.x, camp.radius);
  assert.equal(coldRing.geometry.parameters.outerRadius * coldRing.scale.x, cold.radius);
  assert.deepEqual(warmRing.position.toArray(), [2.5, 9.02, -40]);
  assert.ok(warmRing.material.color.getHexString() !== coldRing.material.color.getHexString());
  view.sync({ fireId: camp.fire.id, layer: cold.fire.point.layer });
  assert.deepEqual([warmRing.material.opacity, coldRing.material.opacity], [.2, .2]);
  view.sync({ fireId: camp.fire.id, layer: camp.fire.point.layer });
  assert.deepEqual([warmRing.material.opacity, coldRing.material.opacity], [.8, .2]);
  view.sync({ fireId: cold.fire.id, layer: cold.fire.point.layer });
  assert.deepEqual([warmRing.material.opacity, coldRing.material.opacity], [.2, .8]);
  view.sync();
  assert.deepEqual([warmRing.material.opacity, coldRing.material.opacity], [.2, .2]);
  let disposed = 0;
  warmRing.geometry.addEventListener('dispose', () => disposed++);
  for (const ring of [warmRing, coldRing]) ring.material.addEventListener('dispose', () => disposed++);
  view.dispose();
  view.dispose();
  assert.equal(disposed, 3);
  assert.equal(view.group.children.length, 0);
});

test('the displayed entry and exit share the host’s radius while U-6 controls standing and healing', t => {
  const view = createUndergroundRecoveryFirePresentation([camp], toScene);
  t.after(view.dispose);
  const fire = camp.fire;
  let foot: ReturnType<UndergroundSurvivalOptions['readAcceptedFoot']>;
  const withinRange: UndergroundSurvivalOptions['canReach'] = (from, to) =>
    from.layer === to.layer && Math.hypot(from.east - to.east, from.north - to.north, from.height - to.height) <= camp.radius;
  const survival = createUndergroundSurvival({
    maxHealth: 100, reconnectFromZeroHealth: 10, defaultWakePoint: fire.point, fires: view.fires,
    readBoundBed: () => undefined, readEntryMode: () => 'survival', readAcceptedFoot: () => foot,
    canReach: withinRange, areTeammates: () => false, now: () => 0,
    readTripOre: () => [], chooseHalf: () => [], save: () => undefined,
  });
  const ring = view.group.children[0] as typeof view.group.children[number] & { material: { opacity: number } };
  function accept(distance: number, standingStill: boolean) {
    const point = { ...fire.point, east: fire.point.east + distance };
    const fireId = withinRange(point, fire.point, 'fire') ? fire.id : undefined;
    foot = { playerId: 'miner', point, standingStill, fireId };
    view.sync(fireId ? { fireId, layer: point.layer } : undefined);
  }
  accept(camp.radius + .01, true);
  assert.equal(survival.syncDepthMode('miner'), true);
  assert.equal(survival.damage('miner', { sequence: 1, kind: 'monster', amount: 30 }), true);
  assert.equal(survival.healAtFire('miner', 2, 1000), false);
  assert.equal(ring.material.opacity, .2);
  accept(camp.radius, false);
  assert.equal(ring.material.opacity, .8);
  assert.equal(survival.healAtFire('miner', 2, 1000), false);
  accept(camp.radius, true);
  assert.equal(survival.healAtFire('miner', 2, 1000), true);
  assert.equal(survival.status('miner').health, 77);
  accept(camp.radius + .01, true);
  assert.equal(ring.material.opacity, .2);
  assert.equal(survival.healAtFire('miner', 3, 1000), false);
});

test('the host must supply distinct fires, positive radii and finite scene coordinates', () => {
  assert.throws(() => createUndergroundRecoveryFirePresentation([camp, camp], toScene), /Invalid recovery fire/);
  assert.throws(() => createUndergroundRecoveryFirePresentation([{ ...camp, radius: 0 }], toScene), /Invalid recovery fire/);
  assert.throws(() => createUndergroundRecoveryFirePresentation([camp], () => [0, NaN, 0]), /Invalid recovery fire scene/);
});
