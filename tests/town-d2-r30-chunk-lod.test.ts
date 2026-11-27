import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  townD2R30Anchors, townD2R30ChunkList, townD2R30Spec,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import type { TownD2R30Chunk } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import { createTownD2R30ChunkLod } from '../tools/voxel-tavern/town-blockout/town-d2-r30-chunk-lod';
import { createTownD2R30Collision } from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';

type GeometryCall = {
  chunk: TownD2R30Chunk;
  spacing: number;
  arrivalHeight: number;
  geometry: BufferGeometry;
};

function createFixture() {
  const calls: GeometryCall[] = [];
  const disposals = new Map<BufferGeometry, number>();
  const buildGeometry = (
    chunk: TownD2R30Chunk,
    spacing: number = townD2R30Spec.middleSpacing,
    arrivalHeight: number = townD2R30Anchors.gate.height,
  ) => {
    const triangles = spacing / townD2R30Spec.nearSpacing;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(triangles * 9), 3));
    geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(triangles * 9).fill(1), 3));
    geometry.setIndex(Array.from({ length: triangles * 3 }, (_, index) => index));
    disposals.set(geometry, 0);
    const dispose = geometry.dispose.bind(geometry);
    geometry.dispose = () => {
      disposals.set(geometry, disposals.get(geometry)! + 1);
      dispose();
    };
    calls.push({ chunk, spacing, arrivalHeight, geometry });
    return geometry;
  };
  return { calls, disposals, buildGeometry };
}

function chunkDistance(chunk: TownD2R30Chunk, east: number, north: number) {
  return Math.hypot(
    Math.max(chunk.west - east, east - chunk.east, 0),
    Math.max(chunk.south - north, north - chunk.north, 0),
  );
}

function residentKeys(east: number, north: number) {
  const radius = townD2R30Spec.residentRadius + townD2R30Spec.unloadHysteresis;
  return townD2R30ChunkList.filter(chunk => chunkDistance(chunk, east, north) <= radius).map(chunk => chunk.key);
}

function simulatedCount(east: number, north: number) {
  return townD2R30ChunkList.filter(chunk =>
    chunkDistance(chunk, east, north) <= townD2R30Spec.simulationRadius).length;
}

test('D2-R30 chunk LOD is lazy and streams gate, summit and edge views with one shared material', () => {
  const fixture = createFixture();
  const lod = createTownD2R30ChunkLod({ arrivalHeight: 412, buildGeometry: fixture.buildGeometry });
  assert.equal(lod.group.children.length, 0);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(lod.stats(), {
    visibleChunks: 0, cachedChunks: 0, simulatedChunks: 0, draws: 0, triangles: 0, rebuilds: 0,
  });

  const views = [
    townD2R30Anchors.gate,
    townD2R30Anchors.summit,
    { east: mainSummitBounds.east + 900, north: 900 },
  ];
  const visibleCounts: number[] = [];
  for (const view of views) {
    lod.update(view.east, view.north);
    const stats = lod.stats();
    const expectedKeys = residentKeys(view.east, view.north);
    assert.equal(stats.cachedChunks, expectedKeys.length);
    assert.equal(stats.visibleChunks, expectedKeys.length);
    assert.equal(stats.draws, stats.visibleChunks);
    assert.equal(stats.simulatedChunks, simulatedCount(view.east, view.north));
    assert.ok(stats.visibleChunks > 0 && stats.visibleChunks <= townD2R30ChunkList.length);
    assert.deepEqual(
      lod.group.children.map(child => child.userData.chunkKey).sort(),
      [...expectedKeys].sort(),
    );
    const material = (lod.group.children[0] as Mesh<BufferGeometry, MeshLambertMaterial>).material;
    assert.equal(material.vertexColors, true);
    assert.ok(material.isMeshLambertMaterial);
    for (const child of lod.group.children) {
      const mesh = child as Mesh<BufferGeometry, MeshLambertMaterial>;
      assert.equal(mesh.material, material);
      assert.ok(mesh.name.includes(mesh.userData.chunkKey));
      assert.ok(mesh.name.includes(`spacing-${mesh.userData.spacing}`));
      assert.ok(chunkDistance(
        townD2R30ChunkList.find(chunk => chunk.key === mesh.userData.chunkKey)!,
        view.east, view.north,
      ) <= townD2R30Spec.visibleRadius);
    }
    visibleCounts.push(stats.visibleChunks);
  }
  assert.ok(visibleCounts[0]! > 0 && visibleCounts[0]! < townD2R30ChunkList.length,
    'gate view must build only the resident part of the compact massif');
  assert.equal(visibleCounts[1], townD2R30ChunkList.length, 'summit view covers the compact massif');
  assert.notEqual(visibleCounts[1], visibleCounts[2]);
  assert.ok(fixture.calls.length < townD2R30ChunkList.length * views.length);
  assert.ok(fixture.calls.every(call => call.arrivalHeight === 412));
  lod.dispose();
});

test('D2-R30 chunk LOD uses AABB distance and only rebuilds a chunk when its spacing changes', () => {
  const fixture = createFixture();
  const lod = createTownD2R30ChunkLod({ buildGeometry: fixture.buildGeometry });
  const target = townD2R30ChunkList.find(chunk =>
    chunk.west <= townD2R30Anchors.gate.east && chunk.east >= townD2R30Anchors.gate.east &&
    chunk.south <= townD2R30Anchors.gate.north && chunk.north >= townD2R30Anchors.gate.north)!;
  const targetCalls = () => fixture.calls.filter(call => call.chunk.key === target.key);

  lod.update(target.centreEast, target.centreNorth);
  assert.equal(targetCalls().at(-1)!.spacing, townD2R30Spec.nearSpacing);
  lod.update(target.east + townD2R30Spec.nearRadius, target.south);
  assert.equal(targetCalls().length, 1, 'AABB edge at 320 m remains near LOD');
  assert.equal(targetCalls().at(-1)!.spacing, townD2R30Spec.nearSpacing);

  lod.update(target.east + townD2R30Spec.nearRadius + .01, target.south);
  assert.equal(targetCalls().at(-1)!.spacing, townD2R30Spec.middleSpacing);
  lod.update(target.east + 720, target.south);
  assert.equal(targetCalls().at(-1)!.spacing, townD2R30Spec.farSpacing);
  lod.update(target.east + 1_220, target.south);
  assert.equal(targetCalls().at(-1)!.spacing, townD2R30Spec.horizonSpacing);
  lod.update(target.east + 720, target.south);
  assert.equal(targetCalls().at(-1)!.spacing, townD2R30Spec.farSpacing);
  assert.deepEqual(targetCalls().map(call => call.spacing), [8, 16, 32, 64, 32]);

  const rebuilds = lod.stats().rebuilds;
  const calls = fixture.calls.length;
  lod.update(target.east + 720, target.south);
  assert.equal(lod.stats().rebuilds, rebuilds);
  assert.equal(fixture.calls.length, calls);
  assert.equal(lod.stats().draws, lod.stats().visibleChunks);
  lod.dispose();
});

test('D2-R30 chunk LOD retains through unload hysteresis, then releases geometry exactly once', () => {
  const fixture = createFixture();
  const lod = createTownD2R30ChunkLod({ buildGeometry: fixture.buildGeometry });
  const target = townD2R30ChunkList.find(chunk =>
    chunk.west <= townD2R30Anchors.gate.east && chunk.east >= townD2R30Anchors.gate.east &&
    chunk.south <= townD2R30Anchors.gate.north && chunk.north >= townD2R30Anchors.gate.north)!;
  const radius = townD2R30Spec.residentRadius + townD2R30Spec.unloadHysteresis;

  lod.update(target.east + townD2R30Spec.residentRadius - 1, target.south);
  const targetMesh = lod.group.children.find(child => child.userData.chunkKey === target.key)!;
  const targetGeometry = (targetMesh as Mesh<BufferGeometry, MeshLambertMaterial>).geometry;
  lod.update(target.east + radius, target.south);
  assert.ok(lod.group.children.some(child => child.userData.chunkKey === target.key));
  assert.equal(fixture.disposals.get(targetGeometry), 0);

  lod.update(target.east + radius + .01, target.south);
  assert.ok(!lod.group.children.some(child => child.userData.chunkKey === target.key));
  assert.equal(fixture.disposals.get(targetGeometry), 1);
  assert.equal(lod.stats().cachedChunks, residentKeys(target.east + radius + .01, target.south).length);
  assert.equal(lod.stats().draws, lod.stats().visibleChunks);
  lod.dispose();
});

test('D2-R30 streaming near chunk uses the same canonical vertices as collision', () => {
  const target = townD2R30ChunkList.find(chunk =>
    chunk.west <= townD2R30Anchors.summit.east && chunk.east >= townD2R30Anchors.summit.east &&
    chunk.south <= townD2R30Anchors.summit.north && chunk.north >= townD2R30Anchors.summit.north)!;
  const lod = createTownD2R30ChunkLod();
  const collision = createTownD2R30Collision();
  try {
    lod.update(target.centreEast, target.centreNorth);
    const mesh = lod.group.children.find(child => child.userData.chunkKey === target.key) as Mesh<BufferGeometry, MeshLambertMaterial>;
    assert.equal(mesh.userData.spacing, 8);
    assert.equal(collision.stats().spacing, 8);
    const position = mesh.geometry.getAttribute('position');
    assert.equal(position.count, (256 / 8 + 1) ** 2);
    assert.equal(mesh.geometry.getIndex()!.count, (256 / 8) * (256 / 8) * 6);
    let maxDifference = 0;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const support = collision.surfaceAt(position.getX(vertex), -position.getZ(vertex));
      assert.ok(support !== undefined);
      maxDifference = Math.max(maxDifference, Math.abs(position.getY(vertex) - support!));
    }
    assert.ok(maxDifference <= 1e-6);
    console.log(`D2-R30 streamingNear maxDifference=${maxDifference.toFixed(12)}m triangles=2048 vertices=${position.count}`);
  } finally {
    collision.dispose();
    lod.dispose();
  }
});

test('D2-R30 chunk LOD reports fixture triangles and disposes every geometry and material once', () => {
  const fixture = createFixture();
  const lod = createTownD2R30ChunkLod({ buildGeometry: fixture.buildGeometry });
  lod.update(townD2R30Anchors.gate.east, townD2R30Anchors.gate.north);
  const expectedTriangles = fixture.calls.reduce((sum, call) =>
    sum + (call.geometry.index?.count ?? call.geometry.getAttribute('position').count) / 3, 0);
  assert.equal(lod.stats().triangles, expectedTriangles);
  assert.equal(lod.stats().draws, lod.stats().visibleChunks);

  const material = (lod.group.children[0] as Mesh<BufferGeometry, MeshLambertMaterial>).material;
  let materialDisposals = 0;
  const disposeMaterial = material.dispose.bind(material);
  material.dispose = () => {
    materialDisposals++;
    disposeMaterial();
  };
  const geometries = fixture.calls.map(call => call.geometry);
  lod.dispose();
  lod.dispose();
  assert.equal(lod.group.children.length, 0);
  assert.equal(materialDisposals, 1);
  for (const geometry of geometries) assert.equal(fixture.disposals.get(geometry), 1);
  assert.deepEqual(lod.stats(), {
    visibleChunks: 0, cachedChunks: 0, simulatedChunks: 0, draws: 0, triangles: 0,
    rebuilds: lod.stats().rebuilds,
  });
  assert.throws(() => lod.update(0, 0), /disposed/);
});
