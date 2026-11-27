import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, MeshLambertMaterial, NearestFilter } from 'three';
import {
  buildTownC2R30WaterworksTrace, c2R30WaterworksDrainBankGap,
  c2R30WaterworksPalette, c2R30WaterworksPipePath,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-waterworks-trace.js';
import { c2SecondMineBoxAllowed } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import { secondMineRiver } from '../src/shared/underground-second-mine-layout.js';

test('C2 R30 waterworks trace is an unregistered local-ENY visual leaf', () => {
  const parent = new Group();
  const scene = buildTownC2R30WaterworksTrace(parent);
  try {
    assert.equal(scene.group.parent, parent);
    assert.equal(scene.group.position.length(), 0);
    assert.equal(scene.group.userData.coordinateFrame, 'local-eny');
    assert.equal(scene.group.userData.registered, false);
    assert.equal(scene.group.userData.visualOnly, true);
    assert.equal(scene.group.userData.interactive, false);
    assert.equal(scene.stats.mineDepth, -140);
    assert.equal(scene.stats.realLightCount, 0);
    assert.equal(scene.stats.interactive, false);
    assert.equal(scene.stats.authorityChangeCount, 0);
    assert.equal(scene.stats.inventoryCount, 0);
  } finally {
    scene.dispose();
  }
});

test('C2 R30 every placement and collider passes the shared guard', () => {
  const scene = buildTownC2R30WaterworksTrace();
  try {
    assert.ok(scene.placements.length > 100);
    for (const placement of scene.placements) {
      assert.equal(placement.visualOnly, true);
      assert.equal(c2SecondMineBoxAllowed(placement, .45), true, `${placement.id} failed guard`);
      assert.equal(Object.isFrozen(placement), true);
    }
    for (const collider of scene.colliders) {
      assert.equal(c2SecondMineBoxAllowed(collider.box, .45), true, `${collider.id} failed guard`);
      assert.deepEqual(collider.min, [
        collider.box.x - collider.box.w / 2, collider.box.y, -collider.box.n - collider.box.d / 2,
      ]);
      assert.deepEqual(collider.max, [
        collider.box.x + collider.box.w / 2, collider.box.y + collider.box.h, -collider.box.n + collider.box.d / 2,
      ]);
    }
    assert.equal(scene.stats.colliderCount, scene.colliders.length);
  } finally {
    scene.dispose();
  }
});

test('C2 R30 pipe run is axis-aligned, coupled and its drain stays outside river authority', () => {
  const scene = buildTownC2R30WaterworksTrace();
  try {
    assert.ok(c2R30WaterworksPipePath.length >= 8);
    for (let index = 1; index < c2R30WaterworksPipePath.length; index++) {
      const a = c2R30WaterworksPipePath[index - 1]!, b = c2R30WaterworksPipePath[index]!;
      assert.ok(a.x === b.x || a.n === b.n, 'pipe path must be axis aligned');
    }
    assert.equal(scene.stats.pipeSegmentCount, c2R30WaterworksPipePath.length - 1);
    assert.equal(scene.stats.valveCount, 3);
    assert.equal(scene.stats.drainCount, 1);
    assert.equal(scene.stats.cabinetCount, 3);
    const gap = c2R30WaterworksDrainBankGap(scene.placements);
    assert.ok(gap > 0, `drain entered the river (gap=${gap})`);
    assert.ok(gap <= secondMineRiver.n0 - 124, 'drain must still reach the bank');
  } finally {
    scene.dispose();
  }
});

test('C2 R30 uses the nine-colour 16px Nearest Lambert palette in instanced batches', () => {
  const scene = buildTownC2R30WaterworksTrace();
  try {
    const stats = scene.stats;
    assert.equal(stats.paletteSize, 9);
    assert.equal(c2R30WaterworksPalette.length, 9);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.filtering, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.instanced, true);
    assert.equal(stats.materialFamilies, stats.meshCount);
    assert.equal(stats.drawCalls, stats.meshCount);
    assert.ok(stats.drawCalls <= 8);
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.length, stats.meshCount);
    const seen = new Set<number>();
    for (const mesh of meshes) {
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      const map = mesh.material.map;
      assert.ok(map instanceof DataTexture);
      assert.equal(map.image.width, 16);
      assert.equal(map.minFilter, NearestFilter);
      assert.equal(map.magFilter, NearestFilter);
      assert.equal(map.generateMipmaps, false);
      const pixels = map.image.data as Uint8Array;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] === 0) continue;
        const color = (pixels[index]! << 16) | (pixels[index + 1]! << 8) | pixels[index + 2]!;
        assert.ok((c2R30WaterworksPalette as readonly number[]).includes(color), `unexpected colour ${color.toString(16)}`);
        seen.add(color);
      }
    }
    assert.deepEqual([...seen].sort((a, b) => a - b),
      [...c2R30WaterworksPalette].sort((a, b) => a - b));
    assert.ok(stats.triangles > 0);
    assert.equal(stats.triangles, stats.visiblePieceCount * 12);
  } finally {
    scene.dispose();
  }
});

test('C2 R30 water state changes only wet instance counts, never colliders or authority', () => {
  const scene = buildTownC2R30WaterworksTrace();
  try {
    const low = scene.setWaterState('low');
    const mid = scene.setWaterState('middle');
    const high = scene.setWaterState('high');
    assert.equal(low.waterPresentationState, 'low');
    assert.equal(mid.waterPresentationState, 'middle');
    assert.equal(high.waterPresentationState, 'high');
    assert.ok(low.visibleWetPieceCount < mid.visibleWetPieceCount);
    assert.ok(mid.visibleWetPieceCount < high.visibleWetPieceCount);
    assert.equal(low.colliderCount, high.colliderCount);
    assert.equal(low.pieceCount, high.pieceCount);
    assert.equal(high.authorityChangeCount, 0);
    assert.equal(high.inventoryCount, 0);
    assert.throws(() => scene.setWaterState('dry' as 'low'), RangeError);
    assert.equal(scene.stats.waterPresentationState, 'high');
  } finally {
    scene.dispose();
  }
});

test('C2 R30 dispose is idempotent and releases every owned GPU resource once', () => {
  const parent = new Group();
  const scene = buildTownC2R30WaterworksTrace(parent);
  const meshes: InstancedMesh[] = [];
  scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  scene.dispose();
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(scene.group.children.length, 0);
  assert.equal(scene.stats.disposed, true);
  assert.equal(scene.stats.drawCalls, 0);
  assert.equal(counts.geometry, 1);
  assert.ok(counts.mesh >= 1);
  assert.ok(counts.material >= 1);
  assert.ok(counts.texture >= 1);
});
