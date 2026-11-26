import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  disposeAssetGroup,
} from '../tools/voxel-tavern/town-blockout/town-friend-materials.js';
import {
  FR03_SHOWCASE_META,
  FR03_SOUVENIRS_CATALOG,
  buildShowcaseCabinet,
} from '../tools/voxel-tavern/town-blockout/town-friend-souvenirs.js';

test('FR-03 catalog exposes showcase cabinet and 6 original souvenirs with clear license', () => {
  assert.equal(FR03_SOUVENIRS_CATALOG.length, 6);
  assert.equal(FR03_SHOWCASE_META.pack, 'FR-03');
  assert.equal(FR03_SHOWCASE_META.license, 'Original-Procedural-MIT');

  const libs = new FriendMaterialLibrary();
  const cabinet = buildShowcaseCabinet(libs);
  assert.ok(cabinet.children.length >= 6);
  disposeAssetGroup(cabinet);

  const ids = new Set<string>();
  for (const entry of FR03_SOUVENIRS_CATALOG) {
    assert.ok(entry.meta.id.startsWith('fr03-'));
    assert.ok(!ids.has(entry.meta.id));
    ids.add(entry.meta.id);
    assert.equal(entry.meta.pack, 'FR-03');
    assert.equal(entry.meta.license, 'Original-Procedural-MIT');

    const group = entry.build(libs);
    assert.ok(group.children.length >= 2);
    applyAssetLod(group, 'low');
    applyAssetLod(group, 'high');
    disposeAssetGroup(group);
  }

  libs.dispose();
});
