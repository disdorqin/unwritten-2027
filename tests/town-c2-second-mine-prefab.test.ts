import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PointLight } from 'three';
import { buildTownC2SecondMinePrefab } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-prefab.js';

test('C2 -140 prefab assembles eight disjoint visual modules without world or passage authority', () => {
  const owner = new Group();
  const prefab = buildTownC2SecondMinePrefab(owner);
  assert.equal(prefab.group.parent, owner);
  assert.equal(prefab.group.position.length(), 0);
  assert.equal(prefab.group.rotation.y, 0);
  assert.equal(prefab.stats().moduleCount, 8);
  assert.ok(prefab.stats().pieceCount > 3000);
  assert.equal(prefab.stats().realLightCount, 3);
  assert.equal(prefab.stats().visualOnly, true);
  assert.equal(prefab.stats().domainRegistered, false);
  assert.equal('canStand' in prefab, false);
  assert.equal('floor' in prefab, false);
  assert.equal('setRiverState' in prefab, false);
  for (const module of Object.values(prefab.modules)) {
    assert.equal(module.group.parent, prefab.group);
  }
  prefab.dispose();
  assert.equal(prefab.group.parent, null);
  assert.equal(owner.children.length, 0);
});

test('C2 -140 prefab forwards night state only to its own emissive modules and real lights', () => {
  const prefab = buildTownC2SecondMinePrefab();
  assert.equal(prefab.modules.lightSources.isNightLit, false);
  assert.equal(prefab.modules.lightSources.lights.filter(light => light instanceof PointLight && light.visible).length, 0);
  prefab.setNight(true);
  assert.equal(prefab.modules.lightSources.isNightLit, true);
  assert.equal(prefab.modules.lightSources.lights.filter(light => light instanceof PointLight && light.visible).length, 3);
  prefab.setNight(false);
  assert.equal(prefab.modules.lightSources.isNightLit, false);
  prefab.dispose();
  prefab.dispose();
});
