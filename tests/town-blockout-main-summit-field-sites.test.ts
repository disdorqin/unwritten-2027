import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, SRGBColorSpace,
  type BufferGeometry, type Group, type Material, Texture } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  buildWindShelter, createSkyWatchRelic, createTrailMarkers, createWishLockPoint,
} from '../tools/voxel-tavern/town-blockout/main-summit-field-sites';
import { createMainSummitMachineRoom } from '../tools/voxel-tavern/town-blockout/main-summit-machine-room';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

function namesOf(group: { traverse: (fn: (object: { name: string }) => void) => void }) {
  const names = new Set<string>();
  group.traverse(object => { if (object.name) names.add(object.name); });
  return names;
}

function meshesOf(group: { traverse: (fn: (object: object) => void) => void }) {
  const meshes: Mesh[] = [];
  group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  return meshes;
}

function expectedBox(east: number, base: number, north: number,
  size: readonly [number, number, number], rotation: readonly [number, number, number] = [0, 0, 0]) {
  const transform = new Object3D();
  transform.position.set(east, base + size[1] / 2, -north);
  transform.rotation.set(...rotation);
  transform.scale.set(...size);
  transform.updateMatrix();
  return transform.matrix.elements;
}

function assertMatrixClose(actual: ArrayLike<number>, expected: ArrayLike<number>,
  message = 'instance matrix preserves its surveyed transform') {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) {
    assert.ok(Math.abs(actual[index]! - expected[index]!) <= 1e-4,
      `${message}: element ${index}`);
  }
}

function assertDisposesOnce(part: { group: Group; dispose(): void }) {
  const resources = new Set<BufferGeometry | Material | Texture>();
  part.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach(material => resources.add(material));
    else {
      resources.add(object.material);
      const map = (object.material as { map?: Texture }).map;
      if (map) resources.add(map);
    }
  });
  let releases = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { releases++; });
  part.dispose();
  part.dispose();
  assert.equal(releases, resources.size, 'each retained geometry/material is released exactly once');
  assert.equal(part.group.children.length, 0);
  assert.equal(part.group.parent, null);
}

test('wish lock point, shelters, sky watch and trail markers build to spec', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const trail = createMainSummitTrail(block.heightAt, 347);

  const wish = createWishLockPoint({ east: 12, north: -19, height: 347 });
  context.after(() => wish.dispose());
  assert.ok(namesOf(wish.group).has('wish-lock-rail'));
  assert.equal(wish.draws, 3);
  assert.ok(meshesOf(wish.group).length <= 3, 'wish locks retain three material/geometry draws');

  const shelter = buildWindShelter('wind-shelter-test', 100, 300, 420);
  context.after(() => shelter.dispose());
  const shelterNames = namesOf(shelter.group);
  for (const expected of ['shelter-fire-ember', 'shelter-static-lambert-boxes', 'shelter-spare-rope']) {
    assert.ok(shelterNames.has(expected), `missing ${expected}`);
  }
  assert.equal(shelter.draws, 3);
  assert.equal(meshesOf(shelter.group).length, 3, 'one Lambert box batch, rope and ember give three draws');
  const shelterBoxes = shelter.group.getObjectByName('shelter-static-lambert-boxes');
  assert.ok(shelterBoxes instanceof InstancedMesh);
  assert.equal(shelterBoxes.count, 26, 'stone, timber and all fourteen tally marks share one batch');
  const shelterMatrix = new Matrix4();
  shelterBoxes.getMatrixAt(10, shelterMatrix);
  assertMatrixClose(shelterMatrix.elements,
    expectedBox(100, 421.78, 300.2, [3.9, .12, 3.9], [.16, 0, 0]),
    'the lean-to roof keeps its surveyed tilt and coordinates');
  shelterBoxes.getMatrixAt(11, shelterMatrix);
  assertMatrixClose(shelterMatrix.elements,
    expectedBox(98.95, 420, 300.95, [.7, .45, .5]), 'the food box keeps its coordinate');
  shelterBoxes.getMatrixAt(12, shelterMatrix);
  assertMatrixClose(shelterMatrix.elements,
    expectedBox(99.4, 420.95, 301.31, [.05, .22, .03]), 'the first duty tally keeps its coordinate');
  const shelterColor = new Color();
  for (const [index, expected] of [[0, '6d7276'], [10, '6d4c33'], [12, '3c4147']] as const) {
    shelterBoxes.getColorAt(index, shelterColor);
    assert.equal(shelterColor.getHexString(), expected, 'instance colours preserve the original materials');
  }

  const anchor = trail.points.reduce((best, point) =>
    Math.abs(point.height - 640) < Math.abs(best.height - 640) ? point : best, trail.points[0]!);
  const heightCalls: { east: number; north: number }[] = [];
  const relic = createSkyWatchRelic(anchor, (east, north) => {
    heightCalls.push({ east, north });
    return block.heightAt(east, north);
  });
  context.after(() => relic.dispose());
  const relicNames = namesOf(relic.group);
  for (const expected of ['watch-brass-frame', 'watch-frame-rust', 'watch-star-slab']) {
    assert.ok(relicNames.has(expected), `missing ${expected}`);
  }
  assert.equal(relic.slabs.length, 3);
  assert.ok(Math.abs(Math.hypot(anchor.east - relic.site.east, anchor.north - relic.site.north) - 80) < 1e-9,
    'the observatory remains exactly 80 m from its surveyed trail anchor');
  assert.deepEqual(heightCalls[0], { east: relic.site.east, north: relic.site.north });
  assert.deepEqual(heightCalls.slice(1), relic.slabs, 'all three slab height samples stay on their original coordinates');
  assert.equal(relic.draws, 3, 'headless stone, rust and brass need only three meshes');
  assert.ok(meshesOf(relic.group).length <= 4, 'stone circle and star charts retain a four-mesh budget');
  const stoneBatch = relic.group.getObjectByName('watch-star-slab');
  const rustBatch = relic.group.getObjectByName('watch-frame-rust');
  assert.ok(stoneBatch instanceof InstancedMesh);
  assert.ok(rustBatch instanceof InstancedMesh);
  assert.equal(stoneBatch.count, 13, 'nine ring stones, one fallen stone and three slabs share one batch');
  assert.equal(rustBatch.count, 5);
  const slabMatrix = new Matrix4();
  for (const [index, slab] of relic.slabs.entries()) {
    const slabBase = block.heightAt(slab.east, slab.north) ?? relic.site.height;
    stoneBatch.getMatrixAt(10 + index, slabMatrix);
    assertMatrixClose(slabMatrix.elements,
      expectedBox(slab.east, slabBase, slab.north, [1.35, .14, 1.8], [-.28, 0, 0]));
  }
  const offTrail = Math.min(...trail.points.map(point =>
    Math.hypot(point.east - relic.site.east, point.north - relic.site.north)));
  assert.ok(offTrail > 40, 'relic stands well off the tread');

  const markers = createTrailMarkers(trail.points, block.heightAt);
  context.after(() => markers.dispose());
  assert.ok(markers.count > 40, 'trail corridor carries markers end to end');
});

test('three star charts share one guarded Canvas atlas without losing their textured faces', () => {
  let arcs = 0, atlasDraws = 0;
  const canvas = {
    width: 0, height: 0,
    getContext() {
      return {
        fillStyle: '', strokeStyle: '', lineWidth: 0,
        fillRect() {}, beginPath() {}, arc() { arcs++; }, fill() {},
        moveTo() {}, lineTo() {}, stroke() {}, drawImage() { atlasDraws++; },
      };
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } });
  let relic!: ReturnType<typeof createSkyWatchRelic>;
  try {
    relic = createSkyWatchRelic({ east: 400, north: 600, height: 500 }, () => 500);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  assert.equal(arcs, 42, 'all fourteen stars on each of the three charts are still drawn');
  assert.equal(atlasDraws, 3);
  assert.equal(relic.draws, 4, 'stone, rust, brass and one chart atlas give four draws');
  assert.equal(meshesOf(relic.group).length, 4);
  const charts = relic.group.getObjectByName('watch-star-slab-chart');
  assert.ok(charts instanceof Mesh);
  assert.ok(!(charts instanceof InstancedMesh), 'the textured chart remains a readable face');
  assert.equal(charts.geometry.getAttribute('position').count, 12, 'three chart planes survive the merge');
  assert.ok(charts.material instanceof MeshBasicMaterial);
  assert.ok(charts.material.map instanceof Texture);
  assert.equal(charts.material.map.colorSpace, SRGBColorSpace);
  assert.equal(charts.material.map.image.width, 784);
  assert.equal(charts.material.map.image.height, 344);
  assertDisposesOnce(relic);
});

test('field-site shared batch resources dispose exactly once', () => {
  assertDisposesOnce(createWishLockPoint({ east: 12, north: -19, height: 347 }));
  assertDisposesOnce(buildWindShelter('wind-shelter-dispose-test', 100, 300, 420));
  const anchor = { east: 400, north: 600, height: 500 };
  assertDisposesOnce(createSkyWatchRelic(anchor, () => 500));
});

test('machine room registers the three cable fault points', context => {
  const room = createMainSummitMachineRoom(347);
  context.after(() => room.dispose());
  assert.deepEqual(room.faultPoints.map(point => point.id), ['rust-gate', 'derail', 'counterweight']);
  const names = namesOf(room.group);
  for (const expected of ['fault-rust-gate-wheel', 'fault-derailed-pulley', 'fault-counterweight-fallen']) {
    assert.ok(names.has(expected), `missing ${expected}`);
  }
});
