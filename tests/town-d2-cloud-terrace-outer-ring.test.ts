import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Group, InstancedMesh, Light, Matrix4, Mesh, type BufferGeometry, type Material, type Texture,
} from 'three';
import {
  createTownD2CloudTerraceOuterRing,
  TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS,
  TOWN_D2_CLOUD_TERRACE_OUTER_RING_SEED,
  TOWN_D2_CLOUD_TERRACE_ROAD_CLEARANCE,
  type TownD2CloudTerraceOuterRingPlacement,
} from '../tools/voxel-tavern/town-blockout/town-d2-cloud-terrace-outer-ring';
import { buildSwitchbackCenterline } from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import { sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

const PLATFORM = { west: 288, east: 352, south: 618, north: 682 };
const RUNWAY = { west: 310.5, east: 351.5, south: 659.8, north: 664.2 };
const NORTH_WALL = { west: 290, east: 350, south: 690, north: 770 };

type Rect = { west: number; east: number; south: number; north: number };

function areaOf(placement: TownD2CloudTerraceOuterRingPlacement) {
  const cosine = Math.abs(Math.cos(placement.yaw));
  const sine = Math.abs(Math.sin(placement.yaw));
  const halfEast = (cosine * placement.width + sine * placement.depth) / 2;
  const halfNorth = (sine * placement.width + cosine * placement.depth) / 2;
  return {
    west: placement.east - halfEast, east: placement.east + halfEast,
    south: placement.north - halfNorth, north: placement.north + halfNorth,
  };
}

function overlaps(a: Rect, b: Rect) {
  return a.east > b.west && a.west < b.east && a.north > b.south && a.south < b.north;
}

function pointSegmentDistance(east: number, north: number, a: { east: number; north: number }, b: { east: number; north: number }) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn || 1;
  const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared));
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function collectMeshes(group: Group) {
  const meshes: Mesh[] = [];
  group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  return meshes;
}

function resourcesOf(meshes: Mesh[]) {
  const resources = new Set<BufferGeometry | Material | Texture>();
  for (const mesh of meshes) {
    resources.add(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      resources.add(material);
      const map = (material as Material & { map?: Texture }).map;
      if (map) resources.add(map);
    }
  }
  return resources;
}

test('D2 outer ring: every footprint clears the terrace, runway, north wall and switchback corridor', () => {
  const ring = createTownD2CloudTerraceOuterRing();
  try {
    const line = buildSwitchbackCenterline(() => 0, () => 0);
    assert.ok(line.length > 100, 'test must use the real surveyed switchback plan');
    assert.ok(ring.placements.length > 250, 'outer ring must contain substantial landscape geometry');
    for (const placement of ring.placements) {
      const area = areaOf(placement);
      assert.ok(area.west >= TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS.west, placement.id);
      assert.ok(area.east <= TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS.east, placement.id);
      assert.ok(area.south >= TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS.south, placement.id);
      assert.ok(area.north <= TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS.north, placement.id);
      assert.equal(overlaps(area, PLATFORM), false, `${placement.id} intersects the 64 m terrace`);
      assert.equal(overlaps(area, RUNWAY), false, `${placement.id} intersects the terminal runway`);
      assert.equal(overlaps(area, NORTH_WALL), false, `${placement.id} intersects the reserved north wall`);
      for (const east of [area.west, area.east]) {
        for (const north of [area.south, area.north]) {
          let roadDistance = Infinity;
          for (let i = 1; i < line.length; i++) {
            roadDistance = Math.min(roadDistance, pointSegmentDistance(east, north, line[i - 1]!, line[i]!));
          }
          assert.ok(roadDistance >= TOWN_D2_CLOUD_TERRACE_ROAD_CLEARANCE - 1e-7,
            `${placement.id} footprint enters the road reserve: ${roadDistance.toFixed(3)} m`);
        }
      }
    }
    for (const kind of ['terrace-rock-step', 'viewing-niche', 'transition-pine', 'transition-shrub', 'snowdrift', 'lantern-remnant'] as const) {
      assert.ok(ring.stats.byKind[kind] > 0, `missing required landscape family ${kind}`);
    }
  } finally { ring.dispose(); }
});

test('D2 outer ring: placement order, counts and instance matrices are deterministic per seed', () => {
  const first = createTownD2CloudTerraceOuterRing({ seed: 20271121 });
  const second = createTownD2CloudTerraceOuterRing({ seed: 20271121 });
  const different = createTownD2CloudTerraceOuterRing({ seed: 20271122 });
  try {
    assert.deepEqual(first.placements, second.placements);
    assert.deepEqual(first.stats, second.stats);
    assert.notDeepEqual(first.placements, different.placements, 'a different seed must change the deterministic scatter');
    assert.equal(first.stats.seed, 20271121);
    assert.equal(createTownD2CloudTerraceOuterRing().stats.seed, TOWN_D2_CLOUD_TERRACE_OUTER_RING_SEED);

    const firstMeshes = collectMeshes(first.group);
    const secondMeshes = collectMeshes(second.group);
    assert.equal(firstMeshes.length, secondMeshes.length);
    const actual = new Matrix4(), expected = new Matrix4();
    for (let meshIndex = 0; meshIndex < firstMeshes.length; meshIndex++) {
      const a = firstMeshes[meshIndex] as InstancedMesh;
      const b = secondMeshes[meshIndex] as InstancedMesh;
      assert.equal(a.count, b.count);
      for (let i = 0; i < a.count; i++) {
        a.getMatrixAt(i, actual);
        b.getMatrixAt(i, expected);
        assert.deepEqual(actual.elements, expected.elements);
      }
    }
    assert.throws(() => createTownD2CloudTerraceOuterRing({ seed: -1 }), RangeError);
  } finally {
    first.dispose();
    second.dispose();
    different.dispose();
  }
});

test('D2 outer ring: all elevations derive from sampleNorthRidge350 and matrices use x=east, z=-north', () => {
  const ring = createTownD2CloudTerraceOuterRing();
  try {
    const meshes = collectMeshes(ring.group);
    const matrix = new Matrix4();
    let instanceIndex = 0;
    for (const placement of ring.placements) {
      assert.equal(placement.height, sampleNorthRidge350(placement.east, placement.north), placement.id);
      assert.equal(placement.anchorHeight, sampleNorthRidge350(placement.anchorEast, placement.anchorNorth), placement.id);
      assert.equal(placement.x, placement.east, placement.id);
      assert.equal(placement.z, -placement.north, placement.id);
      assert.ok(Math.abs(placement.y - (placement.base + placement.tall / 2)) < 1e-10, placement.id);
      if (placement.grounded) {
        assert.ok(placement.base <= placement.height + 1e-7,
          `${placement.id} grounded base must meet or sink into the canonical surface`);
        assert.ok(placement.height - placement.base < 12,
          `${placement.id} support must remain attached to sampled terrain`);
      }
      if (!placement.grounded) {
        assert.ok(placement.base >= placement.anchorHeight - 12,
          `${placement.id} must not float free of its terrain-anchored structure`);
      }

      const mesh = meshes.find(candidate => candidate.name.endsWith(`-${placement.material}`)) as InstancedMesh;
      assert.ok(mesh instanceof InstancedMesh, placement.material);
      const localIndex = ring.placements.slice(0, instanceIndex + 1).filter(item => item.material === placement.material).length - 1;
      mesh.getMatrixAt(localIndex, matrix);
      assert.ok(Math.abs(matrix.elements[12]! - placement.x) < 2e-4, placement.id);
      assert.ok(Math.abs(matrix.elements[13]! - placement.y) < 2e-4, placement.id);
      assert.ok(Math.abs(matrix.elements[14]! - placement.z) < 2e-4, placement.id);
      instanceIndex++;
    }
  } finally { ring.dispose(); }
});

test('D2 outer ring: five instanced material families stay below twelve draws without text, lights or colliders', () => {
  const ring = createTownD2CloudTerraceOuterRing();
  try {
    const meshes = collectMeshes(ring.group);
    assert.ok(ring.stats.materialFamilies.length >= 3);
    assert.deepEqual(ring.stats.materialFamilies, ['stone', 'timber', 'pine', 'shrub', 'snow']);
    assert.ok(ring.stats.draws <= 12);
    assert.ok(ring.stats.meshes <= 12);
    assert.equal(ring.stats.draws, meshes.length);
    assert.equal(ring.stats.instances, ring.placements.length);
    assert.equal(meshes.reduce((sum, mesh) => sum + (mesh instanceof InstancedMesh ? mesh.count : 1), 0), ring.placements.length);
    assert.ok(meshes.every(mesh => mesh instanceof InstancedMesh));
    assert.equal(new Set(meshes.map(mesh => mesh.geometry)).size, 1, 'all voxel pieces share one unit cube');
    for (const family of ring.stats.materialFamilies) {
      assert.ok(ring.stats.byMaterial[family] > 0, family);
      assert.ok(meshes.some(mesh => mesh.name === `town-d2-cloud-terrace-outer-${family}`), family);
    }
    ring.group.traverse(object => {
      assert.equal(object instanceof Light, false, 'scenery must not add light authority');
      assert.equal(Array.isArray(object.userData.authoredCopy), false, 'scenery must not add rendered copy');
      assert.equal(object.userData.colliders, undefined, 'scenery must not add collision authority');
      assert.equal(object.userData.blocked, undefined, 'scenery must not add collision authority');
    });
    assert.equal(ring.group.userData.includesWorldCollision, false);
    assert.equal(ring.group.userData.includesLights, false);
    assert.equal(ring.group.userData.includesText, false);
    assert.equal(ring.group.userData.visualOnly, true);
    assert.ok(resourcesOf(meshes).size < 12, 'only shared geometry and five materials are owned');
  } finally { ring.dispose(); }
});

test('D2 outer ring: transforms, placement numbers, vertices and instance matrices contain no NaN', () => {
  const ring = createTownD2CloudTerraceOuterRing();
  try {
    ring.group.updateMatrixWorld(true);
    ring.group.traverse(object => {
      assert.ok([object.position.x, object.position.y, object.position.z,
        object.rotation.x, object.rotation.y, object.rotation.z,
        object.scale.x, object.scale.y, object.scale.z].every(Number.isFinite), object.name);
      assert.ok([...object.matrixWorld.elements].every(Number.isFinite), object.name);
      if (!(object instanceof InstancedMesh)) return;
      for (const value of object.instanceMatrix.array) assert.ok(Number.isFinite(value), object.name);
      if (object.instanceColor) {
        for (const value of object.instanceColor.array) assert.ok(Number.isFinite(value), object.name);
      }
      const positions = object.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) &&
          Number.isFinite(positions.getZ(i)), `${object.name} vertex ${i}`);
      }
    });
    for (const placement of ring.placements) {
      assert.ok(Object.values(placement).every(value => typeof value !== 'number' || Number.isFinite(value)), placement.id);
      assert.ok(placement.width > 0 && placement.tall > 0 && placement.depth > 0, placement.id);
    }
  } finally { ring.dispose(); }
});

test('D2 outer ring: dispose detaches the group and releases every unique resource exactly once', () => {
  const parent = new Group();
  const ring = createTownD2CloudTerraceOuterRing();
  parent.add(ring.group);
  const resources = resourcesOf(collectMeshes(ring.group));
  let disposed = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { disposed++; });
  ring.dispose();
  ring.dispose();
  assert.equal(disposed, resources.size);
  assert.equal(parent.children.length, 0);
  assert.equal(ring.group.parent, null);
  assert.equal(ring.group.children.length, 0);
  assert.equal(ring.group.userData.disposed, true);
});
