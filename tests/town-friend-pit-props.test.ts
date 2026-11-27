import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh } from 'three';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  disposeAssetGroup,
} from '../tools/voxel-tavern/town-blockout/town-friend-materials.js';
import {
  FR11_PIT_PROPS_CATALOG,
  buildInstancedPitProxies,
} from '../tools/voxel-tavern/town-blockout/town-friend-pit-props.js';

test('FR-11 pit props catalog provides 8 reusable classes with valid metadata & colliders', () => {
  assert.equal(FR11_PIT_PROPS_CATALOG.length, 8);
  const ids = new Set<string>();
  const libs = new FriendMaterialLibrary();

  for (const entry of FR11_PIT_PROPS_CATALOG) {
    assert.equal(entry.meta.pack, 'FR-11');
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

  assert.ok(libs.size >= 8, 'shared material library reused across pit props');
  libs.dispose();
});

test('FR-11 instanced pit proxies batch distant props cleanly', () => {
  const inst = buildInstancedPitProxies([
    [0, 0, -10],
    [2, 0, -10],
    [4, 0, -10],
  ]);
  assert.equal(inst.count, 3);
  inst.geometry.dispose();
  if (Array.isArray(inst.material)) inst.material.forEach((m) => m.dispose());
  else inst.material.dispose();
});
