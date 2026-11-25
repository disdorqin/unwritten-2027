import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  InstancedMesh, Mesh, PointLight, SRGBColorSpace, Texture,
  type BufferGeometry, type Group, type Material, type Object3D,
} from 'three';
import { createMainSummitHutFurnishings } from '../tools/voxel-tavern/town-blockout/main-summit-hut-furnishings';
import { createMainSummitMachineRoom } from '../tools/voxel-tavern/town-blockout/main-summit-machine-room';
import { surveyPlateLines } from '../tools/voxel-tavern/town-blockout/town-survey';

function meshesOf(group: Group) {
  const meshes: Mesh[] = [];
  group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  return meshes;
}

function named(group: Group, name: string) {
  const object = group.getObjectByName(name);
  assert.ok(object, `missing ${name}`);
  return object;
}

function assertTransform(object: Object3D, expected: number[]) {
  assert.deepEqual([...object.position.toArray(), ...object.scale.toArray()], expected);
}

function assertDisposal(group: Group) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const instances: InstancedMesh[] = [];
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      materials.add(material);
      if ('map' in material && material.map instanceof Texture) textures.add(material.map);
    }
    if (object instanceof InstancedMesh) instances.push(object);
  });
  const counts = new Map<string, number>();
  const watch = (resource: BufferGeometry | Material | Texture) => {
    const key = `${resource.type}:${resource.uuid}`;
    resource.addEventListener('dispose', () => counts.set(key, (counts.get(key) ?? 0) + 1));
  };
  for (const resource of [...geometries, ...materials, ...textures]) watch(resource);
  for (const instance of instances) {
    const key = `${instance.type}:${instance.uuid}`;
    instance.addEventListener('dispose', () => counts.set(key, (counts.get(key) ?? 0) + 1));
  }
  const expected = geometries.size + materials.size + textures.size + instances.length;
  assert.ok(expected > 0);
  assert.equal(counts.size, 0);
  return { expected, counts };
}

function finishDisposal(group: Group, result: { expected: number; counts: Map<string, number> }) {
  assert.equal(result.counts.size, result.expected);
  for (const count of result.counts.values()) assert.equal(count, 1, 'resource disposed more than once');
  assert.equal(group.children.length, 0);
  assert.equal(group.parent, null);
}

test('summit hut furnishings preserve the §3.9 checklist with batched static boxes', context => {
  const furnishings = createMainSummitHutFurnishings();
  context.after(() => furnishings.dispose());
  const names = new Set<string>();
  furnishings.group.traverse(object => { if (object.name) names.add(object.name); });
  for (const expected of [
    'hut-bed-frame', 'hut-bed-mattress', 'hut-bed-blanket', 'hut-bed-pillow',
    'stove-firebox', 'stove-ember-glow', 'stove-wood-pile',
    'hut-shelf-board', 'hut-shelf-board-upper', 'shelf-food-sack', 'shelf-food-sack-2',
    'shelf-rope-coil', 'shelf-lamp-base', 'shelf-lamp-glow', 'logbook-cover', 'summit-logbook',
    'hut-window-landmark-light', 'hut-window-frame', 'hut-window-sill', 'hut-interior-lamp',
    'summit-stone-circle', 'survey-station-m7-marker',
  ]) assert.ok(names.has(expected), `missing ${expected}`);

  const staticTransforms: [string, number[]][] = [
    ['hut-bed-frame', [57.02, 800.35, -1009.4, 1.05, .3, 2.1]],
    ['hut-bed-mattress', [57.02, 800.59, -1009.4, .98, .18, 2]],
    ['hut-bed-blanket', [57.02, 800.66, -1009.85, .98, .1, 1.25]],
    ['hut-bed-pillow', [57.02, 800.7, -1008.6, .7, .14, .4]],
    ['stove-firebox', [57.53, 800.62, -1016.42, .5, .42, .06]],
    ['hut-shelf-board', [68.35, 801.5, -1016.2, .5, .06, 2.2]],
    ['hut-shelf-board-upper', [68.35, 802.05, -1016.2, .5, .06, 2.2]],
    ['shelf-food-sack', [68.35, 801.73, -1015.5, .34, .4, .34]],
    ['shelf-food-sack-2', [68.35, 801.7, -1016.05, .3, .34, .3]],
    ['shelf-lamp-base', [68.35, 802.18, -1015.7, .16, .2, .16]],
    ['logbook-cover', [62.5, 801.1, -1016.14, .62, .04, .44]],
    ['hut-window-frame', [59.2, 802.52, -1006.82, 1.1, .09, .1]],
    ['hut-window-sill', [59.2, 801.38, -1006.82, 1.1, .09, .1]],
  ];
  for (const [name, expected] of staticTransforms) assertTransform(named(furnishings.group, name), expected);
  const anchors = furnishings.group.children.filter(object => typeof object.userData.renderBatch === 'string');
  assert.equal(anchors.length, staticTransforms.length + 1, 'thirteen boxes plus the rope retain anchors');
  const staticMeshes = meshesOf(furnishings.group).filter(mesh => mesh.name.startsWith('hut-static-'));
  assert.equal(staticMeshes.length, 5, 'static boxes/rope collapse to one draw per used material');
  for (const anchor of anchors) assert.ok(named(furnishings.group, anchor.userData.renderBatch));

  // Headless stays under 13 drawables: five material batches plus seven
  // retained textured/glowing/instanced/interaction surfaces.
  assert.ok(meshesOf(furnishings.group).length <= 13, 'hut Mesh draw-call ceiling');
  assert.equal((named(furnishings.group, 'stove-wood-pile') as InstancedMesh).count, 5);
  assert.equal((named(furnishings.group, 'summit-stone-circle') as InstancedMesh).count, 9);
  assertTransform(named(furnishings.group, 'summit-logbook'), [62.5, 801.13, -1016.14, 1, 1, 1]);
  assertTransform(named(furnishings.group, 'stove-ember-glow'), [57.53, 800.6, -1016.38, 1, 1, 1]);
  assertTransform(named(furnishings.group, 'shelf-lamp-glow'), [68.35, 802.3, -1015.7, 1, 1, 1]);
  assert.equal(furnishings.windowLight, named(furnishings.group, 'hut-window-landmark-light'));
  assertTransform(furnishings.windowLight, [59.2, 801.95, -1006.78, 1, 1, 1]);
  assertTransform(named(furnishings.group, 'hut-interior-lamp'), [60.5, 802, -1013, 1, 1, 1]);
  assert.ok(named(furnishings.group, 'hut-interior-lamp') instanceof PointLight);
  assert.deepEqual(furnishings.circle, { east: 62.5, north: 1003.6, radius: 1.7 });
  assertTransform(named(furnishings.group, 'survey-station-m7-marker'), [62.5, 800.03, -1003.6, 1, 1, 1]);

  // The door-to-desk corridor stays walkable; bed and shelf collide.
  assert.equal(furnishings.blocked(62.5, 1011, 800, .27, 1.8), false);
  assert.equal(furnishings.blocked(62.5, 1014, 800, .27, 1.8), false);
  assert.equal(furnishings.blocked(57.02, 1009.4, 800, .27, 1.8), true);
  assert.equal(furnishings.blocked(68.35, 1016.2, 800, .27, 1.8), true);
  assert.equal(furnishings.blocked(57.02, 1009.4, 798, .27, 1.8), false);
  assert.equal(furnishings.blocked(57.02, 1009.4, 801.2, .27, 1.8), false);
});

test('hut book/M7 text survives batching and disposal is idempotent', () => {
  const previousDocument = globalThis.document;
  const textCalls: string[] = [];
  const context2d = {
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillText(text: string) { textCalls.push(text); },
  };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context2d }),
  } as unknown as Document;
  const furnishings = createMainSummitHutFurnishings();
  try {
    assert.deepEqual(textCalls, [
      '除夕前五日 · 雪 · 登顶', '除夕前二日 · 晴 · 登顶', '昨夜 · 风大 · 宿绝顶',
      ...surveyPlateLines('M7'),
    ]);
    const pages = named(furnishings.group, 'summit-logbook-pages');
    const m7 = named(furnishings.group, 'survey-station-m7-face');
    assertTransform(pages, [62.5, 801.147, -1016.14, 1, 1, 1]);
    assertTransform(m7, [62.5, 800.062, -1003.6, 1, 1, 1]);
    assert.equal(pages.rotation.x, -Math.PI / 2);
    assert.equal(m7.rotation.x, -Math.PI / 2);
    assert.equal(m7.rotation.z, Math.PI / 3);
    for (const face of [pages, m7]) {
      const material = face instanceof Mesh ? face.material : undefined;
      assert.ok(material && 'map' in material && material.map instanceof Texture);
      assert.equal(material.map.colorSpace, SRGBColorSpace);
    }
    // Both CanvasTexture faces remain independent in the browser path.
    assert.ok(meshesOf(furnishings.group).length <= 15, 'browser hut Mesh draw-call ceiling');
    const disposal = assertDisposal(furnishings.group);
    furnishings.dispose();
    furnishings.dispose();
    finishDisposal(furnishings.group, disposal);
  } finally {
    furnishings.dispose();
    if (previousDocument) globalThis.document = previousDocument;
    else delete (globalThis as { document?: Document }).document;
  }
});

test('machine room keeps three fault surfaces and reaches seven drawables', context => {
  const room = createMainSummitMachineRoom(347);
  context.after(() => room.dispose());
  assert.deepEqual(room.faultPoints, [
    { id: 'rust-gate', east: -15.85, north: 6, height: 347.78 },
    { id: 'derail', east: -14.75, north: 4.85, height: 348.55 },
    { id: 'counterweight', east: -14.2, north: 7.9, height: 347.9 },
  ]);
  for (const name of ['fault-rust-gate-wheel', 'fault-derailed-pulley', 'fault-counterweight-fallen']) {
    assert.ok(named(room.group, name) instanceof Mesh);
  }
  assertTransform(named(room.group, 'fault-rust-gate-wheel'), [-15.85, 347.78, -6, 1, 1, 1]);
  assertTransform(named(room.group, 'fault-derailed-pulley'), [-14.75, 348.55, -4.85, 1, 1, 1]);
  assertTransform(named(room.group, 'fault-counterweight-fallen'), [-15.05, 347.2, -8.5, 1, 1, 1]);
  assert.equal(named(room.group, 'fault-rust-gate-wheel').rotation.y, Math.PI / 2);
  assert.equal(named(room.group, 'fault-derailed-pulley').rotation.x, .5);
  assert.equal(named(room.group, 'fault-derailed-pulley').rotation.z, .35);
  assert.equal(named(room.group, 'fault-counterweight-fallen').rotation.z, .18);

  const anchors = room.group.children.filter(object => typeof object.userData.renderBatch === 'string');
  assert.equal(anchors.length, 14, 'thirteen boxes plus the drum retain anchors');
  const staticMeshes = meshesOf(room.group).filter(mesh => mesh.name.startsWith('machine-room-static-'));
  assert.equal(staticMeshes.length, 4, 'shell/winch/frame solids collapse to four material batches');
  for (const anchor of anchors) assert.ok(named(room.group, anchor.userData.renderBatch));
  assert.ok(meshesOf(room.group).length <= 7, 'machine room must stay at seven drawables or fewer');

  assert.equal(room.blocked(-16.7, 6, 347, .27, 1.8), true);
  assert.equal(room.blocked(-14.2, 7.9, 347, .27, 1.8), true);
  assert.equal(room.blocked(-15.85, 6, 347, .27, 1.8), true, 'gate point remains inside the drum collider');
  assert.equal(room.blocked(-14.75, 4.85, 347, .27, 1.8), false);
  assert.equal(room.blocked(-15.5, 6, 347, .27, 1.8), false);
  assert.equal(room.blocked(-16.7, 6, 345, .27, 1.8), false);
  assert.equal(room.blocked(-16.7, 6, 349.9, .27, 1.8), false);

  const disposal = assertDisposal(room.group);
  room.dispose();
  room.dispose();
  finishDisposal(room.group, disposal);
});
