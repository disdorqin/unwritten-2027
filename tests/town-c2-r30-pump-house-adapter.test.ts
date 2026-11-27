import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, NearestFilter, PointLight } from 'three';
import {
  c2PumpHouseFixtureDatum, c2PumpHouseFixtureSceneSite, c2PumpHouseNineColorPalette,
  mountTownC2PumpHouseAdapter, type C2PumpHouseActionRole, type C2PumpHouseAdapterHost,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-pump-house-adapter.js';
import type { PumpHouseSnapshot } from '../src/presence/underground-pump-house.js';
import type { AcceptedUndergroundWaterSnapshot } from '../src/shared/town-c-water-snapshot-port.js';
import type { PumpHouseSceneSite } from '../tools/voxel-tavern/town-blockout/underground-pump-house-scene.js';

const roles: readonly C2PumpHouseActionRole[] = [
  'journal', 'pump', 'open-cover', 'strike-blockage', 'reset-lever', 'cross', 'ore',
];
const running: PumpHouseSnapshot = {
  revision: 7, lastAtMs: 1000, water: .2, pumpedMs: 1800, stage: 'running',
  repairHits: 0, repairedJams: 0, journalReaders: [],
};
const water = (level: AcceptedUndergroundWaterSnapshot['level']): AcceptedUndergroundWaterSnapshot => ({
  nightOrdinal: 1, phase: 'level', baseLevel: level, pumpOffset: 0, level,
});
type Foot = { role: C2PumpHouseActionRole; point: { east: number; north: number; height: number } };
type Intent = Parameters<NonNullable<C2PumpHouseAdapterHost['dispatch']>>[0];

function fixtureHost() {
  const parent = new Group();
  let snapshot: PumpHouseSnapshot | undefined = { ...running };
  let accepted: AcceptedUndergroundWaterSnapshot | undefined = water('low');
  let passage = false;
  let ferry: boolean | undefined = false;
  let budget = 2;
  let supported = true;
  let feetSupported = true;
  let night = true;
  let viewer: ReturnType<NonNullable<C2PumpHouseAdapterHost['readViewer']>>;
  const certifiedSites: PumpHouseSceneSite[] = [];
  const feet: Foot[] = [];
  const intents: Intent[] = [];
  let snapshotReads = 0;
  const host: C2PumpHouseAdapterHost = {
    supportsSite(site) {
      certifiedSites.push(site);
      return supported && site.east === c2PumpHouseFixtureSceneSite.east &&
        site.north === c2PumpHouseFixtureSceneSite.north &&
        site.height === c2PumpHouseFixtureSceneSite.height &&
        site.yaw === c2PumpHouseFixtureSceneSite.yaw &&
        site.domainId === c2PumpHouseFixtureSceneSite.domainId;
    },
    supportsActionFoot(role, point) {
      feet.push({ role, point });
      return feetSupported;
    },
    readPumpSnapshot() { snapshotReads++; return snapshot; },
    readPassageOpen(value) {
      assert.equal(value.stage, snapshot?.stage, 'passage reader receives the forwarded host stage');
      return passage;
    },
    readFerryRunning(value) {
      assert.equal(value.revision, snapshot?.revision, 'ferry reader receives the forwarded host revision');
      return ferry;
    },
    readLightBudget: () => budget,
    readViewer: () => viewer,
    canSee: () => true,
    dispatch: intent => intents.push(intent),
    readNight: () => night,
  };
  const adapter = mountTownC2PumpHouseAdapter({
    parent, host, readAcceptedWater: () => accepted,
  });
  return { adapter, parent, certifiedSites, feet, intents,
    get snapshotReads() { return snapshotReads; },
    setSnapshot(value?: PumpHouseSnapshot) { snapshot = value; },
    setWater(value?: AcceptedUndergroundWaterSnapshot) { accepted = value; },
    setPassage(value: boolean) { passage = value; },
    setFerry(value: boolean | undefined) { ferry = value; },
    setBudget(value: number) { budget = value; },
    setSupported(value: boolean) { supported = value; },
    setFeetSupported(value: boolean) { feetSupported = value; },
    setNight(value: boolean) { night = value; },
    moveTo(role: C2PumpHouseActionRole) {
      const foot = feet.find(item => item.role === role)?.point;
      assert.ok(foot, 'fixture host did not survey ' + role);
      viewer = { id: 'fixture-miner', domainId: c2PumpHouseFixtureSceneSite.domainId, foot };
    },
  };
}

test('C2-R01 marks an explicit -140 near-bank ENY fixture, reuses the pump model and certifies seven feet', () => {
  assert.equal(c2PumpHouseFixtureDatum.placementKind, 'visual/fixture datum');
  assert.equal(c2PumpHouseFixtureDatum.worldAnchor, false);
  assert.match(c2PumpHouseFixtureDatum.registration, /not-a-C-world-anchor/);
  assert.deepEqual({
    east: c2PumpHouseFixtureDatum.east, north: c2PumpHouseFixtureDatum.north,
    height: c2PumpHouseFixtureDatum.height, yaw: c2PumpHouseFixtureDatum.yaw,
  }, { east: -32, north: 123, height: 0, yaw: Math.PI });
  assert.equal(c2PumpHouseFixtureDatum.bank.riverNorthMin - c2PumpHouseFixtureDatum.north, 5);
  assert.equal(c2PumpHouseFixtureDatum.bank.floorAboveLowRiverBedM, .7);

  const f = fixtureHost();
  assert.equal(f.adapter.stats().mountKind, 'ready');
  assert.deepEqual(f.certifiedSites, [c2PumpHouseFixtureSceneSite]);
  assert.deepEqual(f.feet.map(item => item.role), roles);
  assert.equal(new Set(f.feet.map(item => item.role)).size, 7);
  assert.deepEqual(f.feet.find(item => item.role === 'journal')?.point,
    { east: -35.25, north: 120.9, height: 0 });
  assert.deepEqual(f.feet.find(item => item.role === 'pump')?.point,
    { east: -29.75, north: 119.45, height: 0 });
  assert.deepEqual(f.feet.find(item => item.role === 'cross')?.point,
    { east: -32, north: 101.2, height: 0 });
  assert.ok(f.feet.every(item => item.point.north >= 96 && item.point.north <= 128,
    'all seven feet remain on the near bank, before the river'));

  const model = f.adapter.group.getObjectByName('u17-old-mine-pump-house');
  assert.ok(model, 'the read-only pump scene is mounted rather than rebuilt');
  assert.equal(model?.position.toArray().join(','), '-32,0,-123');
  for (const name of ['pump-mechanical-hand-crank', 'pump-physical-pressure-gauge',
    'pump-removable-maintenance-lid', 'pump-blockage-stones', 'pump-gallery-live-water-surface']) {
    assert.ok(f.adapter.group.getObjectByName(name), 'missing reused model part ' + name);
  }
  const stats = f.adapter.stats();
  assert.equal(stats.actionFootCount, 7);
  assert.ok(stats.colliderCount > 30, 'stats count the pump scene real solids');
  assert.equal(stats.realLightCount, 3, 'only the three reused source lanterns are real lights');
  assert.equal(stats.visibleLightCount, 2, 'dark-scene warm pool obeys the host budget');
  assert.equal(stats.visualOnlyPieceCount, 40);
  f.adapter.dispose();
});

test('adapter-owned bank dressing uses exactly the nine-color board on 16px Nearest textures', () => {
  const f = fixtureHost();
  const allowed = new Set<number>(Object.values(c2PumpHouseNineColorPalette));
  assert.equal(allowed.size, 9);
  const used = new Set<number>();
  let textureCount = 0;
  f.adapter.group.traverse(object => {
    if (!(object instanceof InstancedMesh) ||
        !object.name.startsWith('town-c2-r30-pump-house-adapter/')) return;
    assert.equal(object.userData.visualOnly, true);
    const material = object.material;
    assert.ok(material.map instanceof DataTexture);
    const map = material.map;
    assert.equal(map.image.width, 16);
    assert.equal(map.image.height, 16);
    assert.equal(map.minFilter, NearestFilter);
    assert.equal(map.magFilter, NearestFilter);
    assert.equal(map.generateMipmaps, false);
    const pixels = map.image.data as Uint8Array;
    for (let index = 0; index < pixels.length; index += 4) {
      const rgb = pixels[index]! * 65536 + pixels[index + 1]! * 256 + pixels[index + 2]!;
      assert.ok(allowed.has(rgb), 'off-palette adapter pixel ' + rgb.toString(16));
      used.add(rgb);
    }
    textureCount++;
  });
  assert.equal(textureCount, 4);
  assert.deepEqual([...used].sort((a, b) => a - b), [...allowed].sort((a, b) => a - b));
  assert.equal(f.adapter.stats().pixelTextureCount, 4);
  f.adapter.dispose();
});

test('missing or malformed host snapshots fail closed for permissions, water and real lights', () => {
  const f = fixtureHost();
  f.setSnapshot(undefined);
  let stats = f.adapter.sync();
  assert.equal(stats.waterConfigured, true);
  assert.equal(stats.snapshot, undefined);
  assert.equal(stats.runtimeAuthorized, false);
  assert.equal(stats.permissionVisible, false);
  assert.equal(stats.visibleLightCount, 0);
  assert.equal(f.adapter.prompt(), undefined);
  assert.equal(f.adapter.press('pump', true), false);
  assert.equal(f.adapter.group.getObjectByName('pump-gallery-live-water-surface')?.position.y, 1.48);

  f.setSnapshot({ ...running, water: Number.NaN });
  stats = f.adapter.sync();
  assert.equal(stats.snapshot, undefined);
  assert.equal(stats.permissionVisible, false);
  assert.equal(stats.visibleLightCount, 0);

  f.setSnapshot({ ...running });
  f.moveTo('pump');
  f.setWater(undefined);
  stats = f.adapter.sync();
  assert.equal(stats.waterConfigured, false);
  assert.equal(stats.waterLevel, undefined);
  assert.equal(stats.snapshot, undefined, 'river snapshot loss also withholds pump runtime permission');
  assert.equal(stats.permissionVisible, false);
  assert.equal(f.adapter.prompt(), undefined);

  f.setWater({ ...water('low'), pumpOffset: 9 });
  assert.equal(f.adapter.sync().snapshot, undefined, 'malformed accepted water is not guessed');
  f.adapter.dispose();
});

test('pump, jam, repair, passage and ferry state are forwarded from the explicit host only', () => {
  const f = fixtureHost();
  f.moveTo('pump');
  let stats = f.adapter.sync();
  assert.equal(stats.snapshot?.stage, 'running');
  assert.equal(stats.runtimeAuthorized, true);
  assert.equal(stats.permissionVisible, true);
  assert.equal(f.adapter.prompt()?.role, 'pump');
  assert.equal(f.adapter.press('pump', true), true);
  assert.deepEqual(f.intents, [{ playerId: 'fixture-miner', revision: 7, role: 'pump', hold: true }]);

  f.setSnapshot({ ...running, revision: 8, stage: 'jammed' });
  f.moveTo('open-cover');
  f.adapter.sync();
  assert.equal(f.adapter.prompt()?.role, 'open-cover');
  assert.equal(f.adapter.press('pump'), false, 'jammed host stage removes pump permission');

  f.setSnapshot({ ...running, revision: 9, stage: 'cover-open', repairHits: 1 });
  stats = f.adapter.sync();
  assert.equal(stats.snapshot?.repairHits, 1);
  assert.equal(f.adapter.prompt()?.role, 'strike-blockage');

  f.setSnapshot({ ...running, revision: 10, stage: 'blockage-cleared', repairHits: 2 });
  f.moveTo('reset-lever');
  f.adapter.sync();
  assert.equal(f.adapter.prompt()?.role, 'reset-lever');

  f.moveTo('cross');
  f.adapter.sync();
  assert.equal(f.adapter.prompt(), undefined, 'low visual water alone does not open the crossing');
  f.setPassage(true);
  assert.equal(f.adapter.prompt()?.role, 'cross');

  for (const level of ['high', 'mid', 'low'] as const) {
    f.setWater(water(level));
    f.setFerry(level === 'mid');
    stats = f.adapter.sync();
    assert.equal(stats.waterLevel, level);
    assert.equal(stats.ferryRunning, level === 'mid');
  }
  f.setFerry(undefined);
  assert.equal(f.adapter.sync().ferryRunning, undefined, 'missing ferry authority is not displayed as running');
  f.adapter.dispose();
});

test('host light budget controls only the reused warm pool and dispose is idempotent', () => {
  const f = fixtureHost();
  f.moveTo('pump');
  f.setBudget(0);
  assert.equal(f.adapter.sync().visibleLightCount, 0);
  f.setBudget(99);
  const stats = f.adapter.sync();
  assert.equal(stats.realLightCount, 3);
  assert.equal(stats.visibleLightCount, 3, 'the scene clamps the host budget to its three real sources');
  assert.ok(stats.colliderCount > 30);
  const lights = f.adapter.group.getObjectsByProperty('isPointLight', true) as PointLight[];
  assert.equal(lights.length, 3);
  assert.ok(lights.every(light => light.color.getHex() === 0xe08a3c));

  f.adapter.dispose();
  f.adapter.dispose();
  assert.equal(f.parent.children.length, 0);
  const disposed = f.adapter.stats();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.realLightCount, 0);
  assert.equal(disposed.visibleLightCount, 0);
  assert.equal(disposed.colliderCount, 0);
  assert.equal(disposed.snapshot, undefined);
  const reads = f.snapshotReads;
  assert.equal(f.adapter.sync().disposed, true);
  assert.equal(f.adapter.prompt(), undefined);
  assert.equal(f.adapter.press('pump'), false);
  assert.equal(f.snapshotReads, reads, 'disposed adapter performs no further host reads');
});

test('without explicit site/foot certification the adapter stays empty and unregistered', () => {
  const parent = new Group();
  const adapter = mountTownC2PumpHouseAdapter({
    parent, readAcceptedWater: () => water('mid'), host: { readPumpSnapshot: () => running },
  });
  assert.equal(adapter.stats().mountKind, 'unsupported-site');
  assert.equal(adapter.stats().siteCertified, false);
  assert.equal(adapter.stats().realLightCount, 0);
  assert.equal(adapter.stats().colliderCount, 0);
  assert.equal(adapter.group.visible, false);
  assert.equal(adapter.group.children.length, 1, 'only hidden adapter-owned dressing exists');
  assert.equal(adapter.prompt(), undefined);
  adapter.dispose();
  assert.equal(parent.children.length, 0);
});
