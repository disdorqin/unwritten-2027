import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FriendMaterialLibrary,
  applyAssetLod,
  disposeAssetGroup,
} from '../tools/voxel-tavern/town-blockout/town-friend-materials.js';
import {
  FR02_WINTER_PROPS_CATALOG,
  buildInstancedPropProxies,
} from '../tools/voxel-tavern/town-blockout/town-friend-winter-props.js';

test('FR-02 catalog exposes 10 winter street props with clearance separation and instancing support', () => {
  assert.equal(FR02_WINTER_PROPS_CATALOG.length, 10);

  const libs = new FriendMaterialLibrary();
  const ids = new Set<string>();

  for (const entry of FR02_WINTER_PROPS_CATALOG) {
    assert.ok(entry.meta.id.startsWith('fr02-'));
    assert.ok(!ids.has(entry.meta.id));
    ids.add(entry.meta.id);
    assert.equal(entry.meta.pack, 'FR-02');
    assert.equal(entry.meta.lod.instancingReady, true);

    const group = entry.build(libs);
    assert.ok(group.children.length >= 2);
    applyAssetLod(group, 'low');
    applyAssetLod(group, 'high');
    disposeAssetGroup(group);
  }

  // Verify snow drift is non-blocking (solid: false) and festive arch leaves center walkway open
  const drift = FR02_WINTER_PROPS_CATALOG.find((e) => e.meta.id === 'fr02-snow-drift')!;
  assert.equal(drift.meta.colliders[0]!.solid, false);

  const arch = FR02_WINTER_PROPS_CATALOG.find((e) => e.meta.id === 'fr02-festive-arch')!;
  assert.equal(arch.meta.colliders.length, 2);

  // Verify instanced batching helper
  const instanced = buildInstancedPropProxies(
    [
      { position: [0, 0, 0] },
      { position: [3, 0, 0], scale: [1.2, 1, 1.2] },
    ],
    [1.4, 0.4, 1.0],
    libs,
  );
  assert.equal(instanced.count, 2);
  instanced.geometry.dispose();

  libs.dispose();
});
