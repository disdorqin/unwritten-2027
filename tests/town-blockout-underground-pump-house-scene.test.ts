import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, MeshStandardMaterial, NearestFilter, PointLight } from 'three';
import {
  mountUndergroundPumpHouseScene, pumpHouseStoryText, pumpHouseCanonSwatches, type PumpHouseSceneSite,
} from '../tools/voxel-tavern/town-blockout/underground-pump-house-scene.js';
import type { PumpHouseSnapshot } from '../src/presence/underground-pump-house.js';

const site: PumpHouseSceneSite = { domainId: 'mine/pump', east: 111, north: 219, height: -90, yaw: Math.PI / 6 };
const original: PumpHouseSnapshot = {
  revision: 1, lastAtMs: 1000, water: 1, pumpedMs: 0, stage: 'running',
  repairHits: 0, repairedJams: 0, journalReaders: [],
};
type Host = Parameters<typeof mountUndergroundPumpHouseScene>[0];
function setup() {
  const parent = new Group();
  let snapshot: PumpHouseSnapshot | undefined = { ...original };
  let supported = true;
  let footSupported = true;
  let seeing = true;
  let viewer: ReturnType<Host['readViewer']>;
  let budget = 2;
  let passage = false;
  const intents: Parameters<Host['dispatch']>[0][] = [];
  const sounds: string[] = [];
  const host: Host = {
    parent, site, supportsSite: () => supported, supportsActionFoot: () => footSupported,
    readSnapshot: () => snapshot, readPassageOpen: () => passage,
    readLightBudget: () => budget, readViewer: () => viewer, canSee: () => seeing,
    dispatch: intent => intents.push(intent), onAcceptedSound: kind => sounds.push(kind),
  };
  return { host, parent, sounds, intents,
    setSnapshot(s?: PumpHouseSnapshot) { snapshot = s; },
    setSupported(v: boolean) { supported = v; },
    setFootSupported(v: boolean) { footSupported = v; },
    setSeeing(v: boolean) { seeing = v; },
    setBudget(v: number) { budget = v; },
    setPassage(v: boolean) { passage = v; },
    moveTo(point: { east: number; north: number; height: number }) {
      viewer = { id: 'miner', domainId: site.domainId, foot: point };
    },
    changeDomain(v: string) { if (viewer) viewer = { ...viewer, domainId: v }; },
  };
}

test('round 1 refuses arbitrary or unregistered pump rooms before building colliders and lights', () => {
  const f = setup();
  assert.deepEqual(mountUndergroundPumpHouseScene({ ...f.host, site: undefined }), { kind: 'unregistered' });
  assert.deepEqual(mountUndergroundPumpHouseScene({ ...f.host, site: { ...site, height: NaN } }),
    { kind: 'invalid-site' });
  f.setSupported(false);
  assert.deepEqual(mountUndergroundPumpHouseScene(f.host), { kind: 'unsupported-site' });
  f.setSupported(true);
  f.setFootSupported(false);
  assert.deepEqual(mountUndergroundPumpHouseScene(f.host), { kind: 'unsupported-feet' });
  assert.equal(f.parent.children.length, 0);
});

test('round 2 builds a fully enclosed three-material pump room with clear entry, service aisles and a long covered passage', () => {
  const f = setup();
  const mounted = mountUndergroundPumpHouseScene(f.host);
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(f.parent.children.length, 1);
  assert.ok(mounted.voxels >= 370, 'the scene is detailed, not a single primitive placeholder');
  assert.ok(mounted.materialFamilies.length >= 8, 'stone, wood, iron, copper, rust and glass families');
  assert.ok(mounted.colliders.length > 30);
  for (const role of ['journal', 'pump', 'open-cover', 'strike-blockage', 'reset-lever', 'cross', 'ore'] as const) {
    assert.ok(mounted.feet[role], 'missing ' + role);
    assert.ok(Object.values(mounted.feet[role]).every(Number.isFinite));
  }
  for (const [x, z] of [[0, -.5], [0, -4], [0, -9.8], [0, -12], [0, -17], [0, -23]]) {
    assert.equal(mounted.canStandLocal(x, z), true, 'walkable corridor at ' + x + ',' + z);
  }
  assert.equal(mounted.canStandLocal(6, -5), false);
  assert.equal(mounted.canStandLocal(0, -28), false);
  assert.ok(mounted.group.getObjectByName('pump-mechanical-hand-crank'));
  assert.ok(mounted.group.getObjectByName('pump-physical-water-ruler'));
  assert.ok(mounted.group.getObjectByName('pump-removable-maintenance-lid'));
  assert.ok(mounted.group.getObjectByName('pump-physical-pressure-gauge'));
  assert.ok(mounted.group.getObjectByName('pump-gallery-live-water-surface'));
  mounted.dispose();
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('round 3 retains all story text and keeps light within host budget and real source lanterns', () => {
  const f = setup();
  const mounted = mountUndergroundPumpHouseScene(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.deepEqual(mounted.story.logbook, pumpHouseStoryText.logbook);
  assert.equal(mounted.story.logbook.length, 4);
  assert.ok(mounted.story.logbook[3].includes('墨还没干'));
  assert.ok(mounted.story.header.includes('第六班'));
  assert.ok(mounted.story.warning.includes('拆盖'));
  assert.ok(mounted.story.gauge.includes('通'));
  const light = mounted.group.getObjectsByProperty('name', 'pump-host-budgeted-source') as PointLight[];
  assert.equal(light.length, 3);
  mounted.sync();
  assert.equal(light.filter(lamp => lamp.visible).length, 2);
  f.setBudget(0);
  mounted.sync();
  assert.equal(light.filter(lamp => lamp.visible).length, 0);
  f.setBudget(10);
  mounted.sync();
  assert.equal(light.filter(lamp => lamp.visible).length, 3);
  mounted.dispose();
});

test('round 3 texture polish strictly uses 16x16 nearest-neighbor clay-factory canon swatches', () => {
  const f = setup();
  const mounted = mountUndergroundPumpHouseScene(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  const palette = new Set<number>(Object.values(pumpHouseCanonSwatches));
  let checked = 0;
  for (const object of mounted.group.children) {
    if (!('isInstancedMesh' in object && object.isInstancedMesh === true) ||
        !object.name.startsWith('pump-house/')) continue;
    const material = (object as InstancedMesh).material as MeshStandardMaterial;
    if (Array.isArray(material)) assert.fail('one batched family must have one material');
    const map = material.map as DataTexture;
    assert.ok(map && 'isDataTexture' in map && map.isDataTexture === true);
    assert.equal(map.image.width, 16);
    assert.equal(map.image.height, 16);
    assert.equal(map.minFilter, NearestFilter);
    assert.equal(map.magFilter, NearestFilter);
    const pixels = map.image.data as Uint8Array;
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2];
      assert.ok(palette.has(rgb), 'off-canon material pixel ' + rgb.toString(16));
    }
    checked++;
  }
  assert.equal(checked, mounted.materialFamilies.length);
  mounted.dispose();
});

test('round 4 shows pump, log, jam repair and crossing prompts only at accepted viewer feet and server stages', () => {
  const f = setup();
  const mounted = mountUndergroundPumpHouseScene(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(mounted.prompt(), undefined);
  assert.equal(mounted.press('pump', true), false);
  f.moveTo(mounted.feet.pump);
  assert.equal(mounted.prompt()?.role, 'pump');
  assert.equal(mounted.press('pump', true), true);
  assert.deepEqual(f.intents, [{ playerId: 'miner', role: 'pump', revision: 1, hold: true }]);
  assert.equal(mounted.press('cross'), false);
  f.changeDomain('town');
  assert.equal(mounted.prompt(), undefined);
  f.changeDomain(site.domainId);
  f.setSeeing(false);
  assert.equal(mounted.prompt(), undefined);
  f.setSeeing(true);
  f.moveTo(mounted.feet.journal);
  assert.equal(mounted.prompt()?.role, 'journal');
  assert.equal(mounted.press('journal'), true);
  f.setSnapshot({ ...original, revision: 2, stage: 'jammed' });
  f.moveTo(mounted.feet['open-cover']);
  assert.equal(mounted.prompt()?.role, 'open-cover');
  assert.equal(mounted.press('open-cover'), true);
  f.setSnapshot({ ...original, revision: 3, stage: 'cover-open' });
  assert.equal(mounted.prompt()?.role, 'strike-blockage');
  f.setSnapshot({ ...original, revision: 4, stage: 'blockage-cleared' });
  f.moveTo(mounted.feet['reset-lever']);
  assert.equal(mounted.prompt()?.role, 'reset-lever');
  f.moveTo(mounted.feet.cross);
  assert.equal(mounted.prompt(), undefined, 'no passage before U-17 host authorizes waterline');
  f.setPassage(true);
  assert.equal(mounted.prompt()?.role, 'cross');
  assert.equal(mounted.press('cross'), true);
  f.moveTo(mounted.feet.ore);
  assert.equal(mounted.prompt()?.role, 'ore');
  mounted.dispose();
});

test('water visibly lowers only after a newer authoritative revision, crack/jam pieces animate, and no snapshot is fail-closed', () => {
  const f = setup();
  const mounted = mountUndergroundPumpHouseScene(f.host);
  if (mounted.kind !== 'ready') assert.fail();
  const water = mounted.waterSurface;
  assert.equal(water.position.y, 1.48);
  const a = mounted.pressureNeedle.rotation.z;
  f.setSnapshot({ ...original, revision: 2, water: .3, pumpedMs: 3800 });
  assert.equal(mounted.sync(), true);
  assert.ok(water.position.y < .35);
  assert.notEqual(mounted.pressureNeedle.rotation.z, a);
  assert.ok(Math.abs(mounted.physicalCrank.rotation.z) > 0);
  assert.deepEqual(f.sounds, ['pump']);
  f.setSnapshot({ ...original, revision: 3, water: .25, pumpedMs: 5000, stage: 'jammed' });
  mounted.sync();
  assert.ok(f.sounds.includes('jam'));
  f.setSnapshot({ ...original, revision: 4, water: .25, pumpedMs: 5000, stage: 'cover-open' });
  mounted.sync();
  assert.equal(mounted.group.getObjectByName('pump-removable-maintenance-lid')?.visible, false);
  assert.equal(mounted.group.getObjectByName('pump-blockage-stones')?.visible, true);
  f.setSnapshot({ ...original, revision: 5, stage: 'blockage-cleared', water: .25, pumpedMs: 5000 });
  mounted.sync();
  assert.equal(mounted.group.getObjectByName('pump-blockage-stones')?.visible, false);
  assert.ok(f.sounds.includes('clear'));
  f.setSnapshot(undefined);
  assert.equal(mounted.sync(), false);
  assert.equal(water.position.y, 1.48);
  assert.equal(mounted.prompt(), undefined);
  mounted.dispose();
});
