import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Object3D, Vector3,
  type BufferGeometry, type Material, type Texture,
} from 'three';
import { mainSummitBounds, mainSummitLayout, mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  createTownD2R30CloudTerraceHost, TOWN_D2_R30_CLOUD_TERRACE_HOST_MAX_DRAWS,
  TOWN_D2_R30_LOWLAND_FOREST_MAX_HEIGHT,
  type TownD2R30CloudTerraceHostOptions,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-cloud-terrace-host';
import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30Spec,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import { TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS } from '../tools/voxel-tavern/town-blockout/town-d2-cloud-terrace-outer-ring';
import { townD2MainSummitCloudSpec } from '../tools/voxel-tavern/town-blockout/town-d2-main-summit-cloud-wall';

type Host = ReturnType<typeof createTownD2R30CloudTerraceHost>;
type Point = Readonly<{ east: number; north: number }>;
type Rect = Readonly<{ west: number; east: number; south: number; north: number }>;

const ARRIVAL: Rect = { west: -30, east: 30, south: -10, north: 40 };
const SUMMIT: Rect = {
  west: mainSummitLayout.summit.east - mainSummitSpec.summitPlateau[0] / 2,
  east: mainSummitLayout.summit.east + mainSummitSpec.summitPlateau[0] / 2,
  south: mainSummitLayout.summit.north - mainSummitSpec.summitPlateau[1] / 2,
  north: mainSummitLayout.summit.north + mainSummitSpec.summitPlateau[1] / 2,
};

function meshesOf(host: Host) {
  const meshes: Mesh[] = [];
  host.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  return meshes;
}

function forestMeshes(host: Host) {
  return meshesOf(host).filter(mesh => mesh.name.startsWith('town-d2-r30-lowland-')) as InstancedMesh[];
}

function cloudMesh(host: Host) {
  const mesh = meshesOf(host).find(candidate => candidate.name === 'town-d2-main-summit-cloud-lobes');
  assert.ok(mesh instanceof InstancedMesh);
  return mesh;
}

function mistMesh(host: Host) {
  const mesh = meshesOf(host).find(candidate => candidate.name === 'town-d2-r30-cloud-mist-contour');
  assert.ok(mesh instanceof InstancedMesh);
  return mesh;
}

function eachInstance(mesh: InstancedMesh, visit: (position: Vector3, scale: Vector3, index: number) => void) {
  const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(), rotation = new Object3D();
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    assert.ok([...matrix.elements].every(Number.isFinite), `${mesh.name} matrix ${index}`);
    matrix.decompose(position, rotation.quaternion, scale);
    visit(position, scale, index);
  }
}

function distanceToRect(east: number, north: number, rect: Rect) {
  const dx = Math.max(rect.west - east, east - rect.east, 0);
  const dn = Math.max(rect.south - north, north - rect.north, 0);
  return Math.hypot(dx, dn);
}

function distanceToSegment(east: number, north: number, a: Point, b: Point) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared)) : 0;
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function distanceToValley(east: number, north: number,
  valley: Readonly<{ east: number; north: number; heading: number }>) {
  const dx = east - valley.east, dn = north - valley.north;
  const along = dx * Math.cos(valley.heading) + dn * Math.sin(valley.heading);
  const across = -dx * Math.sin(valley.heading) + dn * Math.cos(valley.heading);
  return Math.hypot(across + Math.sin(along * .011) * 24, Math.max(0, Math.abs(along) - 460) * .22);
}

function resourcesOf(host: Host) {
  const resources = new Set<BufferGeometry | Material | Texture>();
  for (const mesh of meshesOf(host)) {
    resources.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      resources.add(material);
      const map = (material as Material & { map?: Texture }).map;
      if (map) resources.add(map);
    }
  }
  return resources;
}

function instanceColors(meshes: InstancedMesh[]) {
  return meshes.map(mesh => {
    assert.ok(mesh.instanceColor, mesh.name);
    return new Float32Array(mesh.instanceColor.array);
  });
}

test('D2 R30 host composes cloud wall, existing outer ring and two instanced lowland batches within 12 draws', () => {
  const host = createTownD2R30CloudTerraceHost();
  try {
    assert.equal(host.group.name, 'town-d2-r30-cloud-terrace-host');
    assert.deepEqual(host.group.children.map(child => child.name), [
      'town-d2-main-summit-cloud-wall', 'town-d2-cloud-terrace-outer-ring', 'town-d2-r30-lowland-forest',
      'town-d2-r30-cloud-mist-contour',
    ]);
    const stats = host.stats();
    assert.equal(host.stats(), stats);
    assert.equal(stats.groups.length, 4);
    assert.equal(stats.cloud.meshes, 1);
    assert.equal(stats.outerRing.meshes, 5);
    assert.equal(stats.outerRing.instances, 716, 'the reviewed outer ring must remain unchanged');
    assert.equal(stats.forest.meshes, 2);
    assert.ok(stats.forest.pines > 0 && stats.forest.rocks > 0);
    assert.ok(stats.forest.clusters > 0);
    assert.equal(stats.mist.meshes, 1);
    assert.equal(stats.meshes, 9);
    assert.equal(stats.draws, 9);
    assert.equal(stats.drawCalls, stats.draws);
    assert.ok(stats.draws <= TOWN_D2_R30_CLOUD_TERRACE_HOST_MAX_DRAWS);
    assert.equal(stats.instances, stats.cloud.instances + stats.outerRing.instances +
      stats.forest.instances + stats.mist.instances);
    const meshes = meshesOf(host);
    assert.equal(meshes.length, stats.meshes);
    assert.ok(meshes.every(mesh => mesh instanceof InstancedMesh));
    assert.equal(new Set(forestMeshes(host).map(mesh => mesh.geometry)).size, 2);
    assert.equal(new Set(forestMeshes(host).map(mesh => mesh.material)).size, 1);
    const cloudMaterial = cloudMesh(host).material as MeshLambertMaterial;
    assert.ok(cloudMaterial instanceof MeshLambertMaterial);
    assert.equal(cloudMaterial.transparent, false);
    assert.equal(cloudMaterial.opacity, 1);
    assert.equal(cloudMaterial.depthWrite, true);
    assert.equal(host.group.userData.coordinateConvention, 'x=east,y=height,z=-north');
    assert.equal(host.group.userData.includesWorldCollision, false);
    assert.equal(host.group.userData.modifiesHeightAt, false);
  } finally { host.dispose(); }
});

test('cloud vertices stay in 380–560 m and every forest instance is low, slope-limited and terrain-grounded', () => {
  const host = createTownD2R30CloudTerraceHost();
  try {
    const cloud = cloudMesh(host);
    const source = cloud.geometry.getAttribute('position');
    const matrix = new Matrix4(), vertex = new Vector3();
    for (let instance = 0; instance < cloud.count; instance++) {
      cloud.getMatrixAt(instance, matrix);
      for (let index = 0; index < source.count; index++) {
        vertex.fromBufferAttribute(source, index).applyMatrix4(matrix);
        assert.ok(vertex.y >= townD2MainSummitCloudSpec.bottom - 1e-6);
        assert.ok(vertex.y <= townD2MainSummitCloudSpec.top + 1e-6);
      }
    }
    const stats = host.stats();
    assert.ok(stats.cloud.minHeight >= 380 && stats.cloud.maxHeight <= 560);
    assert.ok(stats.forest.minGroundHeight >= townD2R30Spec.baseHeight);
    assert.ok(stats.forest.maxGroundHeight < TOWN_D2_R30_LOWLAND_FOREST_MAX_HEIGHT);
    assert.ok(stats.forest.maxSlope <= .72 + 1e-9);
    for (const mesh of forestMeshes(host)) {
      assert.ok(Math.abs(mesh.geometry.boundingBox!.min.y + .5) < 1e-6, mesh.name);
      eachInstance(mesh, (position, scale) => {
        const east = position.x, north = -position.z;
        const ground = sampleTownD2R30Height(east, north)!;
        const base = position.y - scale.y * .5;
        assert.ok(ground < TOWN_D2_R30_LOWLAND_FOREST_MAX_HEIGHT, mesh.name);
        assert.ok(base <= ground + 1e-4, `${mesh.name} floats at ${east},${north}`);
        assert.ok(ground - base <= stats.forest.maxGroundSink + 1e-4);
        assert.ok(ground - base < 1.9, `${mesh.name} is buried at ${east},${north}`);
        assert.ok(east >= mainSummitBounds.west && east <= mainSummitBounds.east);
        assert.ok(north >= mainSummitBounds.south && north <= mainSummitBounds.north);
      });
    }
  } finally { host.dispose(); }
});

test('gate, plaza, summit, gullies, trail, terrace and east/north circles keep their full footprints clear', () => {
  const trail = [
    { east: -700, north: 100, height: 450 },
    { east: -700, north: 1_500, height: 450 },
  ];
  const exclusion = { east: -900, north: 300, radius: 90 };
  const host = createTownD2R30CloudTerraceHost({
    heightAt: () => 200,
    trailPoints: trail,
    exclusions: [exclusion],
  });
  try {
    const stats = host.stats();
    assert.ok(stats.cloud.familyCounts['cloud-wall'] > 0, 'fixture must exercise actual trail wall lobes');
    assert.ok(stats.forest.instances > 0);
    for (const mesh of forestMeshes(host)) {
      eachInstance(mesh, (position, scale) => {
        const east = position.x, north = -position.z;
        const radius = Math.hypot(scale.x, scale.z) * .5;
        assert.ok(distanceToRect(east, north, ARRIVAL) - radius >= 3 - 1e-7, 'arrival clearance');
        assert.ok(distanceToRect(east, north, SUMMIT) - radius >= 4 - 1e-7, 'summit clearance');
        assert.ok(distanceToRect(east, north, TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS) - radius >= 4 - 1e-7,
          'terrace/runway/road reserve');
        assert.ok(distanceToSegment(east, north, trail[0]!, trail[1]!) - radius >= 15 - 1e-7,
          'main trail clearance');
        assert.ok(Math.hypot(east - exclusion.east, north - exclusion.north) - radius >= exclusion.radius - 1e-7,
          'forest exclusion uses north, not reflected z');
        for (const valley of townD2R30Anchors.valleys) {
          assert.ok(distanceToValley(east, north, valley) - radius >= 28 - 1e-7, `${valley.id} mainline`);
        }
      });
    }
    eachInstance(cloudMesh(host), (position, scale) => {
      const radius = Math.max(scale.x, scale.z);
      assert.ok(Math.hypot(position.x - exclusion.east, -position.z - exclusion.north) - radius >=
        exclusion.radius + townD2MainSummitCloudSpec.exclusionMargin - 1e-6,
      'cloud exclusion must use x=east,z=-north without reflecting the circle');
    });
  } finally { host.dispose(); }
});

test('arrivalHeight reaches both samplers and steep or high ground rejects forest candidates', () => {
  const observed: number[] = [];
  const host = createTownD2R30CloudTerraceHost({
    arrivalHeight: 349,
    heightAt(east, north, arrivalHeight) {
      observed.push(arrivalHeight!);
      if (Math.abs(east + 900) < 80) return 200 + Math.abs(east + 900) * 4;
      return east > 700 ? 400 : 200;
    },
  });
  try {
    assert.ok(observed.length > 0 && observed.every(value => value === 349));
    assert.ok(host.stats().forest.rejected.slope > 0);
    assert.ok(host.stats().forest.rejected.height > 0);
    for (const mesh of forestMeshes(host)) {
      eachInstance(mesh, (position, scale) => {
        const radius = Math.hypot(scale.x, scale.z) * .5;
        assert.ok(position.x < -980 + radius || position.x > -820 - radius, 'steep bank must remain clear');
        assert.ok(position.x + radius <= 700, 'high band must contain no forest');
      });
    }
  } finally { host.dispose(); }
});

test('night tinting is reversible for cloud and forest without changing opacity or instance transforms', () => {
  const host = createTownD2R30CloudTerraceHost();
  try {
    const tinted = [cloudMesh(host), ...forestMeshes(host), mistMesh(host)];
    const day = instanceColors(tinted);
    const matrices = tinted.map(mesh => new Float32Array(mesh.instanceMatrix.array));
    host.setNight(true);
    const night = instanceColors(tinted);
    tinted.forEach((mesh, index) => {
      assert.notDeepEqual(night[index], day[index], mesh.name);
      assert.ok([...night[index]!].every(Number.isFinite));
      const material = mesh.material as MeshLambertMaterial;
      assert.equal(material.transparent, false);
      assert.equal(material.opacity, 1);
      assert.ok(material.emissiveIntensity > 0);
    });
    for (let index = 0; index < night[0]!.length; index += 3) {
      assert.ok(night[0]![index + 2]! > night[0]![index]!, 'night cloud remains blue');
    }
    const once = night.map(colors => new Float32Array(colors));
    host.setNight(true);
    assert.deepEqual(instanceColors(tinted), once);
    host.setNight(false);
    assert.deepEqual(instanceColors(tinted), day);
    tinted.forEach((mesh, index) => {
      assert.deepEqual([...mesh.instanceMatrix.array], [...matrices[index]!]);
      assert.equal((mesh.material as MeshLambertMaterial).emissiveIntensity, 0);
    });
  } finally { host.dispose(); }
});

test('an empty forest still toggles night safely and invalid host inputs fail early', () => {
  const empty = createTownD2R30CloudTerraceHost({ heightAt: () => 800 });
  try {
    assert.equal(empty.stats().forest.instances, 0);
    empty.setNight(true);
    empty.setNight(false);
  } finally { empty.dispose(); }
  assert.throws(() => createTownD2R30CloudTerraceHost({ arrivalHeight: NaN }), /arrivalHeight/);
  assert.throws(() => createTownD2R30CloudTerraceHost({ trailPoints: [{ east: NaN, north: 0 }] }), /trailPoints/);
  assert.throws(() => createTownD2R30CloudTerraceHost({ exclusions: [{ east: 0, north: 0, radius: 0 }] }), /exclusions/);
  assert.throws(() => createTownD2R30CloudTerraceHost({ heightAt: null } as unknown as
    TownD2R30CloudTerraceHostOptions), /heightAt/);
});

test('dispose detaches all three groups and releases every unique resource and mesh exactly once', () => {
  const parent = new Group();
  const host = createTownD2R30CloudTerraceHost();
  parent.add(host.group);
  const meshes = meshesOf(host), resources = resourcesOf(host);
  const resourceEvents = new Map<object, number>(), meshEvents = new Map<object, number>();
  for (const resource of resources) resource.addEventListener('dispose', () => {
    resourceEvents.set(resource, (resourceEvents.get(resource) ?? 0) + 1);
  });
  for (const mesh of meshes) (mesh as Object3D).addEventListener('dispose' as 'removed', () => {
    meshEvents.set(mesh, (meshEvents.get(mesh) ?? 0) + 1);
  });
  host.dispose();
  host.dispose();
  assert.equal(resourceEvents.size, resources.size);
  assert.ok([...resourceEvents.values()].every(count => count === 1));
  assert.equal(meshEvents.size, meshes.length);
  assert.ok([...meshEvents.values()].every(count => count === 1));
  assert.equal(parent.children.length, 0);
  assert.equal(host.group.parent, null);
  assert.equal(host.group.children.length, 0);
  assert.equal(host.group.userData.disposed, true);
  assert.throws(() => host.setNight(true), /disposed/);
});
