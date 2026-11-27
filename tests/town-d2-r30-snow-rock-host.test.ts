import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Group, InstancedMesh, Mesh, type BufferGeometry, type Material } from 'three';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  createTownD2R30SnowRockHost, townD2R30DefaultSnowRockExclusions,
  townD2R30LowRockSpec, townD2R30SnowRockBudget,
  type TownD2R30LowRockInstance,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-snow-rock-host';
import {
  townD2MainSummitSnowRidgeSpec, type TownD2SnowRidgeExclusion, type TownD2SnowRidgePlacement,
} from '../tools/voxel-tavern/town-blockout/town-d2-main-summit-snow-ridges';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

const bounds = mainSummitBounds;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const outside = (value: number, minimum: number, maximum: number) => Math.max(minimum - value, value - maximum, 0);

function segmentDistance(east: number, north: number, a: { east: number; north: number }, b: { east: number; north: number }) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn;
  const fraction = lengthSquared === 0 ? 0 : clamp(((east - a.east) * dx + (north - a.north) * dn) / lengthSquared, 0, 1);
  return Math.hypot(east - a.east - fraction * dx, north - a.north - fraction * dn);
}
function routeDistance(east: number, north: number, points: readonly { east: number; north: number }[]) {
  if (points.length === 1) return Math.hypot(east - points[0]!.east, north - points[0]!.north);
  let distance = Infinity;
  for (let index = 1; index < points.length; index++) {
    distance = Math.min(distance, segmentDistance(east, north, points[index - 1]!, points[index]!));
  }
  return distance;
}
function zoneDistance(zone: TownD2SnowRidgeExclusion, east: number, north: number) {
  if (zone.kind === 'polyline') return routeDistance(east, north, zone.points) - zone.radius;
  if ('west' in zone) {
    return Math.hypot(outside(east, zone.west, zone.east), outside(north, zone.south, zone.north));
  }
  return Math.hypot(east - zone.east, north - zone.north) - zone.radius;
}
function meshesOf(host: ReturnType<typeof createTownD2R30SnowRockHost>) {
  const meshes: Mesh[] = [];
  host.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  return meshes;
}
function actualTriangles(host: ReturnType<typeof createTownD2R30SnowRockHost>) {
  return meshesOf(host).reduce((sum, mesh) => {
    const geometry = mesh.geometry;
    const triangles = (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
    return sum + triangles * (mesh instanceof InstancedMesh ? mesh.count : 1);
  }, 0);
}
function geometrySignature(host: ReturnType<typeof createTownD2R30SnowRockHost>) {
  return meshesOf(host).map(mesh => {
    const positions = mesh.geometry.getAttribute('position');
    return { name: mesh.name, length: positions.array.length,
      hash: [...positions.array].reduce((sum, value, index) => (sum + Math.imul(Math.round(value * 1000), index + 1)) | 0, 0) };
  });
}
function materialSignature(host: ReturnType<typeof createTownD2R30SnowRockHost>) {
  return meshesOf(host).map(mesh => {
    const material = mesh.material as Material & { color: { getHex(): number }; emissive: { getHex(): number }; emissiveIntensity: number };
    return { color: material.color.getHex(), emissive: material.emissive.getHex(), intensity: material.emissiveIntensity };
  });
}
function assertNonNegativeStats(stats: ReturnType<ReturnType<typeof createTownD2R30SnowRockHost>['stats']>) {
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value !== 'number') continue;
    assert.ok(Number.isFinite(value) && value >= 0, `${key}: ${value}`);
  }
  for (const [key, value] of Object.entries(stats.rejections)) assert.ok(Number.isFinite(value) && value >= 0, `rejections.${key}`);
  for (const [key, value] of Object.entries(stats.lowRockRejections)) assert.ok(Number.isFinite(value) && value >= 0, `lowRockRejections.${key}`);
}
function cleanup(context: TestContext, host: ReturnType<typeof createTownD2R30SnowRockHost>) {
  context.after(() => host.dispose());
  return host;
}

test('D2-R30 snow/rock host mounts by default on the complete height field with surveyed keep-clear zones', context => {
  const parent = new Group();
  const host = cleanup(context, createTownD2R30SnowRockHost());
  parent.add(host.group);
  assert.equal(host.group.parent, parent);
  assert.equal(host.group.userData.modifiesHeightAt, false);
  assert.equal(host.group.userData.includesWorldCollision, false);
  const stats = host.stats();
  assert.ok(stats.placements > 0, JSON.stringify(stats));
  assert.ok(stats.trailPoints > 0);
  assert.ok(stats.defaultExclusions >= 3);
  assertNonNegativeStats(stats);
  assert.ok(stats.drawCalls <= townD2R30SnowRockBudget.drawCalls, JSON.stringify(stats));
  assert.ok(stats.triangles <= townD2R30SnowRockBudget.triangles, JSON.stringify(stats));
  assert.equal(stats.drawCalls, meshesOf(host).length);
  assert.equal(stats.triangles, actualTriangles(host));

  const placements = host.group.userData.placements as readonly TownD2SnowRidgePlacement[];
  for (const placement of placements) {
    assert.equal(placement.base, sampleTownD2R30Height(placement.east, placement.north), placement.id);
    assert.ok(placement.base >= townD2MainSummitSnowRidgeSpec.minimumHeight, placement.id);
    assert.ok(placement.top > placement.base && placement.top <= townD2MainSummitSnowRidgeSpec.maximumHeight, placement.id);
    for (const zone of townD2R30DefaultSnowRockExclusions) {
      assert.ok(zoneDistance(zone, placement.east, placement.north) - placement.radius >=
        (zone.clearance ?? townD2MainSummitSnowRidgeSpec.routeClearance) - 1e-9, `${placement.id}/${zone.id}`);
    }
  }
  const lowInstances = host.group.userData.lowRockInstances as readonly TownD2R30LowRockInstance[];
  for (const instance of lowInstances) {
    assert.equal(instance.base, sampleTownD2R30Height(instance.east, instance.north), instance.cluster);
    assert.ok(instance.base >= townD2R30LowRockSpec.minimumHeight && instance.base <= townD2R30LowRockSpec.maximumHeight);
    for (const zone of townD2R30DefaultSnowRockExclusions) {
      assert.ok(zoneDistance(zone, instance.east, instance.north) - instance.radius >=
        (zone.clearance ?? townD2MainSummitSnowRidgeSpec.routeClearance) - 1e-9, `${instance.cluster}/${zone.id}`);
    }
  }
});

test('D2-R30 snow/rock host clears caller exclusions, stays finite and reversible, and disposes resources exactly once', context => {
  function heightAt(east: number, north: number) {
    if (east < bounds.west || east > bounds.east || north < bounds.south || north > bounds.north) return undefined;
    const radial = Math.hypot((east - 50) / 1200, (north - 1000) / 1100);
    return 560 + 240 * Math.max(0, 1 - radial) + 7 * Math.sin(east * .009) * Math.cos(north * .007);
  }
  const trailPoints = Array.from({ length: 181 }, (_, index) => {
    const fraction = index / 180;
    const east = -900 + fraction * 950, north = 100 + fraction * 900;
    return { east, north, height: heightAt(east, north)! };
  });
  const exclusion = { east: -700, north: 700, radius: 30 };
  const host = createTownD2R30SnowRockHost({ heightAt, trailPoints, exclusions: [exclusion] });
  const parent = new Group();
  parent.add(host.group);
  const stats = host.stats();
  assertNonNegativeStats(stats);
  assert.equal(stats.suppliedExclusions, 1);
  assert.ok(stats.drawCalls <= 8 && stats.triangles <= 8_000, JSON.stringify(stats));
  assert.equal(stats.triangles, actualTriangles(host));
  for (const placement of host.group.userData.placements as readonly TownD2SnowRidgePlacement[]) {
    assert.equal(placement.base, heightAt(placement.east, placement.north), placement.id);
    assert.ok(Math.hypot(placement.east - exclusion.east, placement.north - exclusion.north) -
      placement.radius - exclusion.radius >= 20 - 1e-9, placement.id);
  }
  for (const instance of host.group.userData.lowRockInstances as readonly TownD2R30LowRockInstance[]) {
    assert.ok(Math.hypot(instance.east - exclusion.east, instance.north - exclusion.north) -
      instance.radius - exclusion.radius >= 20 - 1e-9, instance.cluster);
  }

  const geometryBefore = geometrySignature(host);
  const day = materialSignature(host);
  host.setNight(true);
  assert.equal(host.group.userData.night, true);
  assert.deepEqual(geometrySignature(host), geometryBefore);
  assert.notDeepEqual(materialSignature(host), day);
  assert.deepEqual(host.stats(), stats);
  host.setNight(false);
  assert.equal(host.group.userData.night, false);
  assert.deepEqual(geometrySignature(host), geometryBefore);
  assert.deepEqual(materialSignature(host), day);
  assert.throws(() => host.setNight('night' as never), /boolean/);

  const resources = new Set<BufferGeometry | Material>();
  host.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => resources.add(material));
  });
  let disposals = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { disposals++; });
  host.dispose();
  host.dispose();
  assert.equal(disposals, resources.size);
  assert.equal(parent.children.length, 0);
  assert.equal(host.group.children.length, 0);
  assert.equal(host.group.userData.disposed, true);
  assert.throws(() => host.setNight(true), /disposed/);
});

test('D2-R30 snow/rock host reports zero distant peaks when their complete footprints miss H560', context => {
  function heightAt(east: number, north: number) {
    if (east < bounds.west || east > bounds.east || north < bounds.south || north > bounds.north) return undefined;
    return Math.hypot(east - 50, north - 1000) <= 450 ? 650 : 540;
  }
  const host = cleanup(context, createTownD2R30SnowRockHost({ heightAt, trailPoints: [
    { east: -900, north: 100 }, { east: -850, north: 300 }, { east: -700, north: 600 },
    { east: -450, north: 900 }, { east: 30, north: 982 },
  ] }));
  assert.equal(host.stats().distantPeaks, 0);
  assert.ok(host.stats().rejections.height > 0);
  assert.ok(host.stats().snowRidges > 0 && host.stats().iceTowers > 0 && host.stats().rockClusters > 0);
  assert.ok(!(host.group.userData.placements as readonly TownD2SnowRidgePlacement[]).some(item => item.kind === 'distant-peak'));
  assert.ok(host.stats().triangles <= townD2R30SnowRockBudget.triangles);
});
