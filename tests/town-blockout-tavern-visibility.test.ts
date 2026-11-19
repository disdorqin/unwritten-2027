import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { Mesh, Vector3, type Group } from 'three';
import {
  buildTavernLandmark, tavernInteriorContains, updateTavernInteriorVisibility,
} from '../tools/voxel-tavern/town-blockout/landmark-tavern.ts';
import { layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

const plot = layout.plots.find(({ id }) => id === 'tavern')!;
const [east, north, elevation] = plot.origin;
const attributeNames = ['position', 'normal', 'uv', 'color'] as const;

function buildTavern(t: TestContext) {
  if (!globalThis.document) {
    globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) } as unknown as Document;
    t.after(() => { Reflect.deleteProperty(globalThis, 'document'); });
  }
  const tavern = buildTavernLandmark(plot);
  tavern.position.set(east, elevation, -north);
  return tavern;
}

function visibleTavernMeshes(tavern: Group) {
  const meshes: Mesh[] = [];
  tavern.traverseVisible(object => {
    if (object instanceof Mesh && object.name.startsWith('酒馆 · ')) meshes.push(object);
  });
  return meshes;
}

function nearFaceDigest(meshes: Mesh[]) {
  const triangles: string[] = [];
  for (const { name, geometry } of meshes) {
    assert.equal(geometry.index, null);
    const attributes = attributeNames.map(key => geometry.getAttribute(key));
    for (let triangle = 0; triangle < attributes[0].count / 3; triangle++) {
      const hash = createHash('sha256').update(name);
      for (const { array, itemSize } of attributes) {
        const bytes = itemSize * 3 * Float32Array.BYTES_PER_ELEMENT;
        hash.update(Buffer.from(array.buffer, array.byteOffset + triangle * bytes, bytes));
      }
      triangles.push(hash.digest('hex'));
    }
  }
  return { triangles: triangles.length, digest: createHash('sha256').update(triangles.sort().join('')).digest('hex') };
}

test('the original near tavern faces and gameplay anchors survive the shell split byte for byte', t => {
  const tavern = buildTavern(t);
  const near = visibleTavernMeshes(tavern);
  assert.equal(near.length, 50);
  // Baseline 2f5f999, hashing material name, winding, position, normal, UV and baked vertex color.
  assert.deepEqual(nearFaceDigest(near), {
    triangles: 120_480,
    digest: '44485183551a8e8cb404b7800cfa2c16cdd94bd94ef977e1dc5cec1c9fe70e42',
  });
  const { townWindows, roosterSill, colliders, floors } = tavern.userData;
  assert.equal(createHash('sha256').update(JSON.stringify({ townWindows, roosterSill, colliders, floors })).digest('hex'),
    'cc25971c33f4ab81490b65f4f014d017bc3303551e2b744cf20fcc07aa7b6633');

  updateTavernInteriorVisibility(tavern, new Vector3(east + 53, elevation, -north));
  const shell = visibleTavernMeshes(tavern);
  assert.equal(shell.length, 37);
  assert.equal(shell.reduce((count, { geometry }) => count + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3, 0), 93_240);
  assert.equal(shell.filter(mesh => mesh.geometry.index !== null).length, 19);
  const originals = new Map(near.map(mesh => [mesh.name, mesh]));
  for (const mesh of shell) {
    const original = originals.get(mesh.name)!;
    assert.equal(mesh.material, original.material);
    for (const key of attributeNames) assert.equal(mesh.geometry.getAttribute(key), original.geometry.getAttribute(key));
  }
  updateTavernInteriorVisibility(tavern, new Vector3(east, elevation + 2.5, -north));
  assert.deepEqual(visibleTavernMeshes(tavern), near);
});

test('the tavern restores all faces before approach and keeps them for an occupant viewing from afar', t => {
  const tavern = buildTavern(t);
  const cameraAt = (distance: number, inside = false) => {
    updateTavernInteriorVisibility(tavern, new Vector3(east + distance, elevation, -north), inside);
    return visibleTavernMeshes(tavern).length;
  };
  assert.equal(cameraAt(52), 50);
  assert.equal(cameraAt(53), 37);
  assert.equal(cameraAt(50), 37);
  assert.equal(cameraAt(48), 50);
  assert.equal(cameraAt(50), 50);
  assert.equal(cameraAt(53), 37);
  assert.equal(tavernInteriorContains(tavern, east, north, elevation + .9), true);
  assert.equal(tavernInteriorContains(tavern, east, north, elevation + 5.4), true);
  assert.equal(tavernInteriorContains(tavern, east, north, elevation), false);
  assert.equal(tavernInteriorContains(tavern, east, north - 5, elevation + .9), false);
  assert.equal(cameraAt(80, tavernInteriorContains(tavern, east, north, elevation + .9)), 50);
  assert.equal(cameraAt(80), 37);
});
