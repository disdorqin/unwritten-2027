import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh } from 'three';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  disposeAssetGroup,
} from '../tools/voxel-tavern/town-blockout/town-friend-materials.js';
import {
  FR12_ALPINE_PROPS_CATALOG,
  buildInstancedAlpineProxies,
} from '../tools/voxel-tavern/town-blockout/town-friend-alpine-props.js';

test('FR-12 alpine props catalog provides 8 snow-capped props with valid colliders & LOD', () => {
  assert.equal(FR12_ALPINE_PROPS_CATALOG.length, 8);
  const ids = new Set<string>();
  const libs = new FriendMaterialLibrary();

  for (const entry of FR12_ALPINE_PROPS_CATALOG) {
    assert.equal(entry.meta.pack, 'FR-12');
    assert.equal(entry.meta.license, 'Original-Procedural-MIT');
    assert.ok(!ids.has(entry.meta.id), `duplicate id ${entry.meta.id}`);
    ids.add(entry.meta.id);
    assert.ok(entry.meta.colliders.length >= 1);
    assert.ok(entry.meta.lod.nearDistance < entry.meta.lod.farDistance);
    assert.ok(entry.meta.lod.farDistance < entry.meta.lod.cullDistance);

    const group = entry.build(libs);
    let meshCount = 0;
    let hasProxy = false;
    group.traverse((obj) => {
      if (obj instanceof Mesh) meshCount += 1;
      if (obj.userData?.lodRole === 'proxy') hasProxy = true;
    });
    assert.ok(meshCount >= 4, `${entry.meta.id} should have >=4 meshes`);
    assert.ok(hasProxy, `${entry.meta.id} should have LOD proxy`);

    applyAssetLod(group, 'low');
    applyAssetLod(group, 'high');
    disposeAssetGroup(group);
  }

  assert.ok(libs.size >= 7, 'shared material library reused across alpine props');
  libs.dispose();
});

test('FR-12 instanced alpine proxies batch distant mountain props', () => {
  const inst = buildInstancedAlpineProxies([
    [-2, 0, -12],
    [0, 0, -12],
    [2, 0, -12],
  ]);
  assert.equal(inst.count, 3);
  inst.geometry.dispose();
  if (Array.isArray(inst.material)) inst.material.forEach((m) => m.dispose());
  else inst.material.dispose();
});
