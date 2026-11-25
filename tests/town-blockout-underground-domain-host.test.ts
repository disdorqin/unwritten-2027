import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PointLight } from 'three';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface.js';
import {
  buildUndergroundShaftSurvey, mountUndergroundDomainHost, undergroundMineLanding,
} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import type { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';

type Road = ReturnType<typeof mountWestCraterRoad>;

// The certified B-01 live anchor: crater centre E-120 / N185 on the town datum.
const liveAnchor = { east: -120, north: 185, rimHeight: 10.7773, yaw: 0 };

function fakeRoad(anchorOverrides: Partial<typeof liveAnchor> = {}, heightAnchor = liveAnchor): Road {
  const surface = mountMeteorCraterSurface(heightAnchor);
  return {
    anchor: { ...liveAnchor, ...anchorOverrides },
    heightAt: (east: number, north: number) => surface.heightAt(east, north),
  } as unknown as Road;
}

test('the host builds the certified survey from the mounted west route', () => {
  const survey = buildUndergroundShaftSurvey(fakeRoad());
  assert.ok(survey);
  assert.equal(survey.crater.domainId, 'west');
  assert.deepEqual(survey.crater.liveRim, liveAnchor);
  assert.equal(survey.fixtureShaftFoot.height, -35);
  assert.equal(survey.liveWinchFoot.domainId, 'west');
  assert.equal(survey.liveWinchFoot.horizontalReach, .7);
  assert.equal(survey.liveWinchFoot.verticalReach, .3);
  assert.ok(Math.abs(survey.liveWinchFoot.height - (liveAnchor.rimHeight - 35)) < 1e-6);
  assert.deepEqual(survey.mineLanding, undergroundMineLanding);
  assert.equal(survey.depthLine, -73);
});

test('the host resolves the registration and mounts the mine domain', () => {
  const parent = new Group();
  const result = mountUndergroundDomainHost({ parent, road: fakeRoad() });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') assert.fail('expected a mounted mine domain');
  assert.equal(result.registration.kind, 'ready');
  assert.deepEqual(result.mounted.poolWorld, {
    east: undergroundMineLanding.east,
    north: undergroundMineLanding.north,
    height: undergroundMineLanding.height,
  });
  const domain = parent.children.find(child => child.name.startsWith('underground-mine-domain:'));
  assert.ok(domain, 'mine domain group is mounted under the host parent');
  // No light is granted from render state: sync reads the host's empty
  // receipts and every camp lamp stays dark.
  result.mounted.sync();
  const lamps: PointLight[] = [];
  domain.traverse(object => {
    if ('isPointLight' in object && object.isPointLight === true) lamps.push(object as PointLight);
  });
  assert.ok(lamps.every(light => light.visible === false));
  result.mounted.dispose();
});

test('batch 104: the water bridge feeds the accepted snapshot and host visual anchors', () => {
  const parent = new Group();
  let snapshot: { nightOrdinal: number; phase: 'rise' | 'level' | 'fall'; baseLevel: 'low' | 'mid' | 'high'; pumpOffset: number; level: 'low' | 'mid' | 'high' } | undefined = {
    nightOrdinal: 0, phase: 'rise', baseLevel: 'high', pumpOffset: 0, level: 'high',
  };
  const result = mountUndergroundDomainHost({
    parent, road: fakeRoad(),
    waterBridge: {
      readWaterSnapshot: () => snapshot,
      highWaterOffsetM: .8,
      oreVisuals: [
        { id: 'fixture/underwater', kind: 'underwater', at: [0, -91, 2] },
        { id: 'fixture/riverbed', kind: 'riverbed', at: [0, -90.2, 10], normal: [0, 1, 0] },
      ],
    },
  });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  const water = result.mounted.waterOverlay;
  assert.ok(water);
  result.mounted.sync();
  assert.equal(water.stats().configuration, 'host');
  assert.equal(water.stats().level, 'high');
  assert.equal(water.stats().surfaceRiseM, .8);
  assert.equal(water.stats().underwaterOreMarkers, 1);
  snapshot = { nightOrdinal: 2, phase: 'fall', baseLevel: 'low', pumpOffset: 0, level: 'low' };
  result.mounted.sync();
  assert.equal(water.stats().level, 'low');
  assert.equal(water.stats().riverbedOreMarkers, 1);
  snapshot = undefined;
  result.mounted.sync();
  assert.equal(water.stats().configuration, 'unconfigured');
  assert.equal(water.stats().baselineWaterVisible, true);
  result.mounted.dispose();
  assert.equal(parent.children.length, 0);
});

test('a route whose surveyed heights disagree with its anchor cannot register or mount', () => {
  const parent = new Group();
  const road = fakeRoad({ rimHeight: liveAnchor.rimHeight + 5 });
  const result = mountUndergroundDomainHost({ parent, road });
  assert.equal(result.kind, 'unregistered');
  assert.equal(parent.children.length, 0);
});

test('a route with no surveyed winch foot stays unregistered', () => {
  const parent = new Group();
  const road = {
    anchor: liveAnchor,
    heightAt: () => undefined,
  } as unknown as Road;
  const result = mountUndergroundDomainHost({ parent, road });
  assert.deepEqual(result, { kind: 'unregistered', reason: 'winch-survey' });
  assert.equal(parent.children.length, 0);
});

test('batch 3: with a camp bridge the interactive camp serves prompts and the pickaxe grant', async () => {
  const { resolveUndergroundCampPickaxeSite } = await import('../src/shared/underground-camp-pickaxe.js');
  const { createUndergroundMineLayout } = await import('../tools/voxel-tavern/town-blockout/underground-mine-layout.js');
  const { undergroundMineSpec } = await import('../tools/voxel-tavern/town-blockout/underground-domain-host.js');
  const mine = createUndergroundMineLayout(undergroundMineSpec);
  const site = resolveUndergroundCampPickaxeSite(mine, undergroundMineSpec.camp);
  assert.ok(site);
  let worldFoot: { east: number; north: number; height: number } | undefined;
  const sat: string[] = [];
  let notices = 0;
  const result = mountUndergroundDomainHost({
    parent: new Group(), road: fakeRoad(),
    campBridge: {
      now: () => 5_000,
      readWorldFoot: () => worldFoot,
      sit: (roomId) => { sat.push(roomId); return true; },
      stand: () => true,
      onSeatedChange: () => undefined,
      isAimingAt: () => true,
      showPickupNotice: () => { notices++; },
      onRested: () => undefined,
    },
  });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  const world = result.mounted.toWorld(site.approach);
  assert.ok(world);
  worldFoot = world;
  result.mounted.sync();
  const prompt = result.mounted.campPrompt();
  assert.equal(prompt?.id, 'mine-camp-old-pickaxe');
  assert.equal(await result.mounted.pressCamp('mine-camp-old-pickaxe'), 'granted');
  assert.equal(notices, 1);
  result.mounted.sync();
  assert.equal(result.mounted.campPrompt()?.id, undefined);
  // Offerings: no lamp authority yet, so nothing is lit and the reader agrees.
  assert.deepEqual(result.offeringsSnapshot(), { litNicheIds: [], extraCampLightCount: 0 });
  void sat;
});

test('batch 4: the crystal gate mounts shut and the camp recovery ring sits on the certified anchor', async () => {
  const { createUndergroundMineLayout } = await import('../tools/voxel-tavern/town-blockout/underground-mine-layout.js');
  const { undergroundMineSpec } = await import('../tools/voxel-tavern/town-blockout/underground-domain-host.js');
  const mine = createUndergroundMineLayout(undergroundMineSpec);
  const result = mountUndergroundDomainHost({ parent: new Group(), road: fakeRoad() });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  assert.ok(result.mounted.group.getObjectByName('mine-crystal-gate'));
  assert.ok(result.mounted.group.getObjectByName('recovery-fire/fire/camp-recovery'));
  // The pre-mount world transform must agree with the mounted scene's own.
  const viaScene = result.mounted.toWorld(mine.anchors.campRecovery.position);
  assert.ok(viaScene);
  assert.ok(Math.abs(viaScene.east - result.campFireWorld.east) < 1e-9);
  assert.ok(Math.abs(viaScene.north - result.campFireWorld.north) < 1e-9);
  assert.ok(Math.abs(viaScene.height - result.campFireWorld.height) < 1e-9);
});

test('lamp authority: an issued lamp offers at an empty niche and is placed on the ledger', async () => {
  const { createLampLedger } = await import('../src/presence/lamp-ledger.js');
  const { createUndergroundCampRemains } = await import('../tools/voxel-tavern/town-blockout/underground-camp-remains.js');
  const { createUndergroundMineLayout } = await import('../tools/voxel-tavern/town-blockout/underground-mine-layout.js');
  const { undergroundMineSpec } = await import('../tools/voxel-tavern/town-blockout/underground-domain-host.js');
  const mine = createUndergroundMineLayout(undergroundMineSpec);
  const data = createUndergroundCampRemains({
    mine, camp: undergroundMineSpec.camp, walker: undergroundMineSpec.walker,
  });
  const niche = data.memorial.niches.find((entry) => !entry.hasSpentLamp);
  assert.ok(niche);
  // The offering approach stands at the memorial approach, at the niche's x.
  const approach: readonly [number, number, number] = [
    niche.position[0], data.memorial.approach[1], data.memorial.approach[2]];
  data.dispose();

  const ledger = createLampLedger();
  let placedCalls = 0;
  let worldFoot: { east: number; north: number; height: number } | undefined;
  const result = mountUndergroundDomainHost({
    parent: new Group(), road: fakeRoad(),
    campBridge: {
      now: () => 5_000,
      readWorldFoot: () => worldFoot,
      sit: () => true,
      stand: () => true,
      onSeatedChange: () => undefined,
      isAimingAt: () => true,
      showPickupNotice: () => undefined,
      onRested: () => undefined,
      readLampHeld: () => ledger.holdsLamp('p1'),
      onLampPlaced: () => { placedCalls++; ledger.placeAtNiche('p1'); },
    },
  });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') return;
  const ready = result as Extract<typeof result, { kind: 'ready' }>;
  const world = ready.mounted.toWorld(approach);
  assert.ok(world);
  worldFoot = world;
  ready.mounted.sync();
  const prompt = ready.mounted.campPrompt();
  assert.equal(prompt?.id, `offer-lamp:${niche.id}`);

  // Registered but not yet issued: the lamp room has given nothing, so the
  // offering is refused and the niche stays dark.
  assert.equal(ledger.register('p1'), true);
  assert.equal(await ready.mounted.pressCamp(prompt!.id), 'rejected');
  assert.deepEqual(ready.offeringsSnapshot()?.litNicheIds, []);
  assert.equal(placedCalls, 0);

  // Issued against the registration: the offering lands, the niche lights,
  // and the ledger records the lamp as placed — the camp keeps no book.
  assert.equal(ledger.issue('p1'), true);
  assert.equal(await ready.mounted.pressCamp(prompt!.id), 'lamp-offered');
  assert.deepEqual(ready.offeringsSnapshot()?.litNicheIds, [niche.id]);
  assert.equal(placedCalls, 1);
  assert.equal(ledger.record('p1')?.stage, 'placed');
  assert.equal(ledger.holdsLamp('p1'), false);
});
