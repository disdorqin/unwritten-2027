import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh } from 'three';
import {
  FriendMaterialLibrary,
  disposeAssetGroup,
} from '../tools/voxel-tavern/town-blockout/town-friend-materials.js';
import { FR01_WOOD_STONE_CATALOG } from '../tools/voxel-tavern/town-blockout/town-friend-wood-stone-kit.js';

test('FriendMaterialLibrary shared resources survive single asset disposal and disposeAssetGroup is idempotent', () => {
  const libs = new FriendMaterialLibrary();
  // Two assets that both share wood_dark / wood_warm / iron from libs, plus own edged-panel materials
  const doorEntry = FR01_WOOD_STONE_CATALOG[1]!;
  const tableEntry = FR01_WOOD_STONE_CATALOG[3]!;

  const door = doorEntry.build(libs);
  const table = tableEntry.build(libs);

  const sharedMat = libs.get('wood_dark');
  let sharedMatDisposeCalls = 0;
  const origMatDispose = sharedMat.dispose.bind(sharedMat);
  sharedMat.dispose = () => {
    sharedMatDisposeCalls += 1;
    origMatDispose();
  };

  const sharedTex = sharedMat.map!;
  let sharedTexDisposeCalls = 0;
  const origTexDispose = sharedTex.dispose.bind(sharedTex);
  sharedTex.dispose = () => {
    sharedTexDisposeCalls += 1;
    origTexDispose();
  };

  // Dispose first asset (door)
  const firstStats = disposeAssetGroup(door);
  assert.ok(firstStats.geometriesDisposed > 0, 'door geometries should be disposed');
  assert.ok(firstStats.materialsDisposed > 0, 'door should dispose its own edged-panel/proxy materials');
  assert.equal(sharedMatDisposeCalls, 0, 'shared library material must NOT be disposed by asset');
  assert.equal(sharedTexDisposeCalls, 0, 'shared library texture must NOT be disposed by asset');

  // Second disposal of same asset must be idempotent
  const secondStats = disposeAssetGroup(door);
  assert.equal(secondStats.geometriesDisposed, 0);
  assert.equal(secondStats.materialsDisposed, 0);
  assert.equal(secondStats.texturesDisposed, 0);

  // Second asset (table) still references valid shared materials
  let tableSharedMeshes = 0;
  table.traverse((obj) => {
    if (obj instanceof Mesh && !Array.isArray(obj.material) && libs.ownsMaterial(obj.material)) {
      tableSharedMeshes += 1;
    }
  });
  assert.ok(tableSharedMeshes > 0, 'table should still hold shared library materials');

  disposeAssetGroup(table);
  assert.equal(sharedMatDisposeCalls, 0);

  // Library dispose releases all shared materials & textures once
  const expectedCount = libs.size;
  const libStats = libs.dispose();
  assert.equal(libStats.materialsDisposed, expectedCount);
  assert.equal(libStats.texturesDisposed, expectedCount);
  assert.equal(sharedMatDisposeCalls, 1);
  assert.equal(sharedTexDisposeCalls, 1);

  // Idempotent library dispose
  const libStats2 = libs.dispose();
  assert.equal(libStats2.materialsDisposed, 0);
  assert.equal(libStats2.texturesDisposed, 0);
});
