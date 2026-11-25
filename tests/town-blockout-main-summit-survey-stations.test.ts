import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, type BufferGeometry, type Material, type Texture } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitIcefall } from '../tools/voxel-tavern/town-blockout/main-summit-icefall';
import { createMainSummitSurveyStations } from '../tools/voxel-tavern/town-blockout/main-summit-survey-stations';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { surveyPlateLines } from '../tools/voxel-tavern/town-blockout/town-survey';

test('survey stations M4-M6 stand built, M7 registered unbuilt for alignment', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const trail = createMainSummitTrail(block.heightAt, 347);
  const icefall = createMainSummitIcefall(block.heightAt);
  context.after(() => icefall.dispose());
  const survey = createMainSummitSurveyStations({
    cloudTerrace: { east: 30, north: -30, height: 347 },
    trailPoints: trail.points,
    icefallTop: icefall.topAnchor,
    heightAt: block.heightAt,
  });
  context.after(() => survey.dispose());
  assert.deepEqual(survey.stations.map(station => station.id), ['M4', 'M5', 'M6', 'M7']);
  const [m4, m5, m6, m7] = survey.stations;
  assert.equal(m4!.built, true);
  assert.equal(m4!.height, 347);
  assert.equal(m5!.built, true);
  assert.ok(m5!.height >= 555, 'M5 stands where the trail leaves the cloud band');
  assert.equal(m6!.built, true);
  assert.equal(m6!.north, icefall.topAnchor.north);
  assert.equal(m7!.built, false);
  assert.equal(m7!.height, 800);
  for (const station of survey.stations) assert.equal(station.rubRadius, 1.6);
  assert.ok(survey.blocked(m4!.east, m4!.north, 347, .27, 1.8), 'pillar bases collide');
  assert.equal(survey.blocked(m4!.east, m4!.north, 348.4, 0, 1.8), false, 'pillar collision height remains 1.4');
  assert.equal(survey.blocked(m4!.east + .449, m4!.north, 347, 0, 1.8), true);
  assert.equal(survey.blocked(m4!.east + .451, m4!.north, 347, 0, 1.8), false, 'pillar collision radius remains .45');

  const meshes: Mesh[] = [];
  survey.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  assert.equal(meshes.length, 3, 'Node has three structural draws and no Canvas face');
  assert.ok(meshes.every(mesh => mesh instanceof InstancedMesh));
  const base = survey.group.getObjectByName('survey-station-base');
  const pillar = survey.group.getObjectByName('survey-station-pillar');
  const plate = survey.group.getObjectByName('survey-station-plate');
  assert.ok(base instanceof InstancedMesh);
  assert.ok(pillar instanceof InstancedMesh);
  assert.ok(plate instanceof InstancedMesh);
  assert.deepEqual([base.count, pillar.count, plate.count], [3, 3, 3], 'only M4-M6 are instantiated');
  const box = (east: number, center: number, north: number, w: number, h: number, d: number) =>
    new Matrix4().makeScale(w, h, d).setPosition(east, center, -north);
  const assertMatrix = (actual: Matrix4, expected: Matrix4) => {
    actual.elements.forEach((value, index) => assert.ok(Math.abs(value - expected.elements[index]!) < 1e-4));
  };
  const actual = new Matrix4();
  for (const [index, station] of [m4!, m5!, m6!].entries()) {
    base.getMatrixAt(index, actual);
    assertMatrix(actual, box(station.east, station.height + .09, station.north, .8, .18, .8));
    pillar.getMatrixAt(index, actual);
    assertMatrix(actual, box(station.east, station.height + .18 + 1.05 / 2, station.north, .42, 1.05, .42));
    const plateTransform = new Object3D();
    plateTransform.position.set(station.east, station.height + .18 + 1.05 + .1, -station.north);
    plateTransform.rotation.set(-.5, 0, Math.PI);
    plateTransform.updateMatrix();
    plate.getMatrixAt(index, actual);
    assertMatrix(actual, plateTransform.matrix);
  }

  const resources = new Set<BufferGeometry | Material | Texture>();
  for (const mesh of meshes) {
    resources.add(mesh.geometry);
    if (!Array.isArray(mesh.material)) resources.add(mesh.material);
  }
  let releases = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { releases++; });
  survey.dispose();
  survey.dispose();
  assert.equal(survey.group.children.length, 0);
  assert.equal(survey.group.parent, null);
  assert.equal(releases, resources.size, 'shared geometries and materials are released exactly once');
});

test('survey Canvas readings share one atlas without moving the three face planes', context => {
  const calls: { text: string; east: number; baseline: number }[] = [];
  const fills: number[][] = [];
  const canvas = {
    width: 0, height: 0,
    getContext() {
      return {
        fillStyle: '', textAlign: '', font: '',
        fillRect(...values: number[]) { fills.push(values); },
        fillText(text: string, east: number, baseline: number) { calls.push({ text, east, baseline }); },
      };
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => canvas },
  });
  let survey!: ReturnType<typeof createMainSummitSurveyStations>;
  try {
    const block = createMainSummitBlock(mainSummitLayout, 347, 100);
    const trail = createMainSummitTrail(block.heightAt, 347);
    const icefall = createMainSummitIcefall(block.heightAt);
    survey = createMainSummitSurveyStations({
      cloudTerrace: { east: 30, north: -30, height: 347 },
      trailPoints: trail.points,
      icefallTop: icefall.topAnchor,
      heightAt: block.heightAt,
    });
    context.after(() => { survey.dispose(); icefall.dispose(); block.dispose(); });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  assert.equal(canvas.width, 768);
  assert.equal(canvas.height, 256);
  assert.deepEqual(fills, [[0, 0, 256, 256], [256, 0, 256, 256], [512, 0, 256, 256]]);
  const built = survey.stations.slice(0, 3);
  assert.deepEqual(calls, built.flatMap((station, index) => {
    const lines = surveyPlateLines(station.id);
    return [
      { text: lines[0], east: index * 256 + 128, baseline: 78 },
      { text: lines[1], east: index * 256 + 128, baseline: 148 },
      { text: lines[2], east: index * 256 + 128, baseline: 208 },
    ];
  }));
  const meshes: Mesh[] = [];
  survey.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  assert.equal(meshes.length, 4, 'three structural batches plus one atlas face');
  const faces = survey.group.getObjectByName('survey-station-canvas-faces');
  assert.ok(faces instanceof Mesh);
  const positions = faces.geometry.getAttribute('position');
  const uvs = faces.geometry.getAttribute('uv');
  assert.equal(positions.count, 12);
  built.forEach((station, index) => {
    const start = index * 4;
    const center = [0, 0, 0];
    for (let vertex = start; vertex < start + 4; vertex++) {
      center[0]! += positions.getX(vertex) / 4;
      center[1]! += positions.getY(vertex) / 4;
      center[2]! += positions.getZ(vertex) / 4;
      assert.ok(uvs.getX(vertex) >= index / 3 - 1e-6 && uvs.getX(vertex) <= (index + 1) / 3 + 1e-6);
    }
    const expected = [station.east, station.height + 1.39, -station.north + .1];
    center.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]!) < 1e-4));
  });
  const material = faces.material as MeshBasicMaterial;
  assert.equal(material.transparent, true);
  assert.equal(material.map!.image.width, 768);
  const resources = new Set<BufferGeometry | Material | Texture>([faces.geometry, material, material.map!]);
  let releases = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { releases++; });
  survey.dispose();
  survey.dispose();
  assert.equal(releases, resources.size, 'atlas geometry, material and texture are released exactly once');
});
