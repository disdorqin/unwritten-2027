import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  disposeAssetGroup,
} from '../tools/voxel-tavern/town-blockout/town-friend-materials.js';
import { FR01_WOOD_STONE_CATALOG } from '../tools/voxel-tavern/town-blockout/town-friend-wood-stone-kit.js';

test('FR-01 catalog exposes 12 human-scale wood-stone assets with valid colliders and LOD', () => {
  assert.equal(FR01_WOOD_STONE_CATALOG.length, 12);

  const libs = new FriendMaterialLibrary();
  const ids = new Set<string>();

  for (const entry of FR01_WOOD_STONE_CATALOG) {
    assert.ok(entry.meta.id.startsWith('fr01-'));
    assert.ok(!ids.has(entry.meta.id), `duplicate id ${entry.meta.id}`);
    ids.add(entry.meta.id);
    assert.equal(entry.meta.pack, 'FR-01');
    assert.equal(entry.meta.license, 'Original-Procedural-MIT');

    const [w, h, d] = entry.meta.dimensions;
    assert.ok(w > 0.2 && w <= 2.5, `${entry.meta.id} width out of human scale: ${w}`);
    assert.ok(h > 0.3 && h <= 3.0, `${entry.meta.id} height out of human scale: ${h}`);
    assert.ok(d > 0.1 && d <= 1.5, `${entry.meta.id} depth out of human scale: ${d}`);

    assert.ok(entry.meta.colliders.length >= 1, `${entry.meta.id} must have at least 1 collider`);
    for (const col of entry.meta.colliders) {
      assert.ok(col.size[0] > 0 && col.size[1] > 0 && col.size[2] > 0);
    }

    const group = entry.build(libs);
    assert.ok(group.children.length >= 2, `${entry.meta.id} must contain multiple meshes + proxy`);

    // Verify LOD switching toggles detail vs proxy visibility
    applyAssetLod(group, 'low');
    const proxies = group.children.filter((c) => c.userData?.lodRole === 'proxy');
    assert.equal(proxies.length, 1, `${entry.meta.id} should have 1 proxy`);
    assert.equal(proxies[0]!.visible, true);

    applyAssetLod(group, 'high');
    assert.equal(proxies[0]!.visible, false);

    disposeAssetGroup(group);
  }

  libs.dispose();
});
