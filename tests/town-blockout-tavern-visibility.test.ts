import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { Mesh, Vector3, type Group } from 'three';
import {
  buildTavernLandmark, tavernInteriorContains, tavernModelToPlot, updateTavernInteriorVisibility,
} from '../tools/voxel-tavern/town-blockout/landmark-tavern.ts';
import {
  tavernCraftBenchBox, tavernCraftCaskBoxes, tavernCraftMaterials, type TavernCraftBench,
} from '../tools/voxel-tavern/town-blockout/tavern-craft-bench.ts';
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

test('the near tavern faces and existing gameplay anchors survive the shell split', t => {
  const tavern = buildTavern(t);
  const near = visibleTavernMeshes(tavern);
  assert.equal(near.length, 50);
  // Includes the rear bench and both relocated casks; hash geometry, UVs and baked lighting together.
  assert.deepEqual(nearFaceDigest(near), {
    triangles: 121_152,
    digest: '885d42093e5e4214acf77688a84d362bcbe22d01528584f6e1f9b538ae016305',
  });
  const { townWindows, roosterSill, colliders: allColliders, floors } = tavern.userData;
  const transform = tavernModelToPlot(plot);
  const additions = [tavernCraftBenchBox, ...tavernCraftCaskBoxes].map(([x0, y0, z0, x1, y1, z1]) =>
    JSON.stringify({ min: transform(x0, y0, z0), max: transform(x1, y1, z1) }));
  const colliders = allColliders.filter((box: { min: number[]; max: number[] }) =>
    !additions.includes(JSON.stringify(box)));
  assert.equal(allColliders.length - colliders.length, 3);
  assert.equal(createHash('sha256').update(JSON.stringify({ townWindows, roosterSill, colliders, floors })).digest('hex'),
    'cc25971c33f4ab81490b65f4f014d017bc3303551e2b744cf20fcc07aa7b6633');

  updateTavernInteriorVisibility(tavern, new Vector3(east + 53, elevation, -north));
  const shell = visibleTavernMeshes(tavern);
  assert.equal(shell.length, 37);
  assert.equal(shell.reduce((count, { geometry }) => count + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3, 0), 93_552);
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

test('the rear workbench projects counts into its material wells and culls those props with the room', t => {
  const tavern = buildTavern(t);
  const { craftBench } = tavern.userData as { craftBench: TavernCraftBench };
  const visibleMaterials = () => {
    const visible: string[] = [];
    tavern.traverseVisible(object => {
      if (object.name.startsWith('酒馆案台 · ')) visible.push(object.name.slice('酒馆案台 · '.length));
    });
    return visible;
  };
  assert.deepEqual(visibleMaterials(), []);
  craftBench.setCounts({ paper: 2, bamboo: 1, wood: 0, cloth: -1, wire: Infinity });
  assert.deepEqual(visibleMaterials(), ['paper', 'bamboo']);
  updateTavernInteriorVisibility(tavern, new Vector3(east + 53, elevation, -north));
  assert.deepEqual(visibleMaterials(), []);
  updateTavernInteriorVisibility(tavern, new Vector3(east, elevation, -north));
  assert.deepEqual(visibleMaterials(), ['paper', 'bamboo']);
  craftBench.setCounts(Object.fromEntries(tavernCraftMaterials.map(slot => [slot, 1])));
  assert.deepEqual(visibleMaterials(), tavernCraftMaterials);
  craftBench.setCounts({});
  assert.deepEqual(visibleMaterials(), []);
});

test('the tavern floor and 0.27 m player radius permit a continuous walk to the rear bench', t => {
  const tavern = buildTavern(t);
  const transform = tavernModelToPlot(plot);
  const route = [[0, 7], [0, 1.95], [-.9, 1.95], [-.9, -.22], [-5.5, -.22], [-5.5, -3.56], [-2.125, -3.56]];
  const { colliders, floors, craftBench } = tavern.userData as {
    colliders: { min: number[]; max: number[] }[];
    floors: { min: number[]; max: number[] }[];
    craftBench: TavernCraftBench;
  };
  assert.deepEqual(craftBench.stand, transform(-2.125, 3, -3.56));
  for (let i = 1; i < route.length; i++) {
    const [[fromX, fromZ], [toX, toZ]] = route.slice(i - 1, i + 1);
    const steps = Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / .04);
    for (let step = 0; step <= steps; step++) {
      const [x, feet, z] = transform(fromX + (toX - fromX) * step / steps, 3, fromZ + (toZ - fromZ) * step / steps);
      assert.ok(floors.some(({ min, max }) =>
        max[1] === feet && min[0] <= x && x <= max[0] && min[2] <= z && z <= max[2]), `floor at ${x}, ${z}`);
      const blocked = colliders.some(({ min, max }) => {
        const dx = Math.max(min[0] - x, x - max[0], 0);
        const dz = Math.max(min[2] - z, z - max[2], 0);
        return dx * dx + dz * dz < .27 ** 2 && feet + .025 < max[1] && feet + 1.78 - .025 > min[1];
      });
      assert.equal(blocked, false, `player capsule at ${x}, ${z}`);
    }
  }
});
