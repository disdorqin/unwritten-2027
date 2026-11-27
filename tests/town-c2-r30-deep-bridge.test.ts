import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createTownC2R30DeepBridge, type C2R30BridgeRoom } from '../tools/voxel-tavern/town-blockout/town-c2-r30-deep-bridge.js';
import { c2R30DeepMouths } from '../tools/voxel-tavern/town-blockout/town-c2-r30-deep-mouths.js';
import { createSecondMineScene } from '../tools/voxel-tavern/town-blockout/underground-second-mine.js';
import { c2R30RingPlan } from '../tools/voxel-tavern/town-blockout/town-c2-r30-remnant-ring.js';
import type { C2CertifiedLayerFrame } from '../tools/voxel-tavern/town-blockout/town-c2-r30-layer-seams.js';

const frame = (layer: 'minus165' | 'minus190'): C2CertifiedLayerFrame => ({
  layer, status: 'c-certified', worldOffset: { east: 0, north: 0, height: layer === 'minus165' ? -165 : -187.6 },
  yaw: 0, certifiedBy: 'C2-bridge-test',
});
const room: C2R30BridgeRoom = {
  origin: { east: -500, north: -500, height: -250 },
  bounds: { width: 1_000, depth: 1_000, height: 500 },
};

test('C2 deep bridge mounts the complete warrior city and certifies both real mouths', () => {
  const bridge = createTownC2R30DeepBridge({ readNight: () => false });
  const host = new Group();
  try {
    const cityFrame = frame('minus165');
    assert.equal(bridge.acceptsLayer('minus165', cityFrame, room), true);
    assert.equal(bridge.acceptsLayer('minus165', cityFrame, {
      origin: { east: 1_000, north: 1_000, height: 0 }, bounds: { width: 1, depth: 1, height: 1 },
    }), false);
    const city = bridge.mountLayer('minus165', cityFrame)!;
    assert.ok(city);
    assert.equal(city.group.parent, null);
    assert.equal(city.group.position.lengthSq(), 0);
    assert.equal(city.group.rotation.y, 0);
    assert.equal(city.group.scale.x, 1);
    for (const name of ['town-c2-r30-tavern-dressing', 'town-c2-r30-warrior-domestic',
      'town-c2-r30-rooster-star-stone', 'town-c2-r30-city-vault', 'town-c2-r30-forge-exterior']) {
      const object = city.group.getObjectByName(name);
      assert.ok(object, `${name} missing from production bridge`);
      assert.equal(object.userData.siteCertified, true);
      assert.equal(object.visible, true);
    }
    assert.equal(bridge.mountLayer('minus165', cityFrame), city, 'mount must reuse one lifecycle owner');
    for (const mouth of [c2R30DeepMouths['minus140-to-minus165'].to,
      c2R30DeepMouths['minus165-to-minus190'].from]) {
      assert.equal(city.acceptsMouth(mouth), true);
      const passage = city.passageLocal(mouth.at === 0 ? .5 : 179.5, 0, .27, mouth.height);
      assert.ok(passage);
      assert.equal(passage.floor, 0);
      assert.ok(passage.clearance >= mouth.height);
    }
    assert.equal(city.passageLocal(90, 0)!.floor, 0);
    assert.equal(city.passageLocal(90, 0)!.clearance > 3.24, true);
    assert.equal(city.passageLocal(181, 0), undefined);
    host.add(city.group);
    assert.equal(city.group.parent, host);
  } finally {
    bridge.dispose();
    bridge.dispose();
  }
  assert.deepEqual(bridge.stats(), { mountedLayers: [], colliderCount: 0, disposed: true });
});

test('C2 deep bridge mounts the pinned palace shell and C2 forecourt art with floor-relative collision', () => {
  const bridge = createTownC2R30DeepBridge();
  try {
    const palaceFrame = frame('minus190');
    assert.equal(bridge.acceptsLayer('minus190', palaceFrame, room), true);
    const palace = bridge.mountLayer('minus190', palaceFrame)!;
    assert.ok(palace);
    assert.equal(palace.group.userData.sourceBlob, '9ab161e8691ea32662f389527ebb57f1d3fe0947');
    for (const name of ['u11-palace-dressing-reviewable', 'town-c2-r30-remnant-ring', 'town-c2-r30-vault-approach']) {
      const object = palace.group.getObjectByName(name);
      assert.ok(object, `${name} missing from production bridge`);
      assert.equal(object.visible, true);
    }
    assert.equal(palace.acceptsMouth(c2R30DeepMouths['minus165-to-minus190'].to), true);
    assert.equal(palace.acceptsMouth(c2R30DeepMouths['minus165-to-minus190'].from), false);
    const entry = palace.passageLocal(0, .5)!;
    assert.equal(entry.floor, 0);
    assert.ok(Math.abs(entry.clearance - 3.24) < 1e-9);
    assert.equal(palace.passageLocal(0, 105.7)!.floor, -2.4);
    assert.equal(palace.passageLocal(0, 125.4)!.floor, -2.4);
    const monolith = c2R30RingPlan().find(piece => piece.solid && piece.role === 'stele' && piece.h > 3)!;
    assert.ok(monolith);
    assert.equal(palace.passageLocal(monolith.e, monolith.n, .1, 1.8), undefined,
      'C2 ring collision must participate in the host passage query');
  } finally {
    bridge.dispose();
  }
  assert.equal(bridge.mountLayer('minus190', frame('minus190')), undefined);
});

test('C2 deep bridge delegates the existing second-mine mouth and rejects invalid links and frames', () => {
  const mine = createSecondMineScene();
  const bridge = createTownC2R30DeepBridge({ secondMine: mine });
  try {
    const mouth = c2R30DeepMouths['minus140-to-minus165'].from;
    assert.equal(bridge.acceptsSecondMineMouth(mouth), true);
    assert.equal(bridge.acceptsSecondMineMouth({ ...mouth, width: 4 }), false);
    const link = {
      id: 'minus140-to-minus165', from: 'minus140' as const, to: 'minus165' as const,
      start: { east: 0, north: 0, height: -140 }, end: { east: 134, north: 0, height: -165 },
      length: 134, width: 3.4, clearance: 3.5,
    };
    assert.equal(bridge.acceptsLink(link, room), true);
    assert.equal(bridge.acceptsLink({ ...link, to: 'minus190' }, room), false);
    assert.equal(bridge.acceptsLink({ ...link, length: NaN }, room), false);
    assert.equal(bridge.acceptsLink(link, {
      origin: { east: 500, north: 500, height: 0 }, bounds: { width: 1, depth: 1, height: 1 },
    }), false);
    assert.equal(bridge.mountLayer('minus165', { ...frame('minus165'), certifiedBy: ' ' }), undefined);
    assert.equal(bridge.mountLayer('minus190', { ...frame('minus190'), layer: 'minus165' } as never), undefined);
  } finally {
    bridge.dispose();
    mine.dispose();
  }
  assert.equal(bridge.acceptsSecondMineMouth(c2R30DeepMouths['minus140-to-minus165'].from), false);
});
