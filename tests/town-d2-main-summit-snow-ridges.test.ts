import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshPhongMaterial, type BufferGeometry, type Material } from 'three';
import {
  createTownD2MainSummitSnowRidges, townD2MainSummitSnowRidgeSpec,
  type TownD2SnowRidgeExclusion, type TownD2SnowRidgePlacement,
} from '../tools/voxel-tavern/town-blockout/town-d2-main-summit-snow-ridges';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitRockTowers } from '../tools/voxel-tavern/town-blockout/main-summit-rock-towers';

const bounds = mainSummitBounds;
function heightAt(east: number, north: number) {
  if (east < bounds.west || east > bounds.east || north < bounds.south || north > bounds.north) return undefined;
  const radial = Math.hypot((east - 50) / 1200, (north - 1000) / 1100);
  return 560 + 240 * Math.max(0, 1 - radial) + 7 * Math.sin(east * .009) * Math.cos(north * .007);
}
const trailPoints = Array.from({ length: 181 }, (_, index) => {
  const fraction = index / 180;
  const east = -900 + fraction * 950;
  const north = 100 + fraction * 900;
  return { east, north, height: heightAt(east, north)! };
});
const exclusions: readonly TownD2SnowRidgeExclusion[] = [
  { id: 'cable-two', kind: 'polyline', radius: 0, points: [
    { east: -850, north: 250 }, { east: -520, north: 650 }, { east: -120, north: 900 }, { east: 24, north: 999 },
  ] },
  { id: 'glide-line', kind: 'polyline', radius: 0, points: [
    { east: 50, north: 1000 }, { east: -80, north: 800 }, { east: -350, north: 300 }, { east: -700, north: -50 },
  ] },
  { id: 'watch-ruins', kind: 'circle', east: 390, north: 1120, radius: 18 },
  { id: 'machine-hall', kind: 'circle', east: -80, north: 920, radius: 22 },
  { id: 'summit-buildings', kind: 'rectangle', west: 35, east: 90, south: 955, north: 1045 },
];
function create(seed?: number | string) {
  return createTownD2MainSummitSnowRidges({ heightAt, trailPoints, exclusions, seed });
}
function cleanup(context: TestContext, result: ReturnType<typeof create>) {
  context.after(() => result.dispose());
  return result;
}
function segmentDistance(east: number, north: number, a: { east: number; north: number }, b: { east: number; north: number }) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn || 1;
  const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared));
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}
function routeDistance(placement: TownD2SnowRidgePlacement, points: readonly { east: number; north: number }[]) {
  let best = Infinity;
  for (let index = 1; index < points.length; index++) {
    best = Math.min(best, segmentDistance(placement.east, placement.north, points[index - 1]!, points[index]!));
  }
  return best;
}
function geometrySignature(result: ReturnType<typeof create>) {
  return result.group.children.map(child => {
    const positions = (child as Mesh).geometry.getAttribute('position').array;
    return { name: child.name, length: positions.length,
      hash: [...positions].reduce((sum, value, index) => (sum + Math.imul(Math.round(value * 1000), index + 1)) | 0, 0) };
  });
}

test('D2 snow ridges: large, varied formations occupy only the H560–775 band and touch heightAt', context => {
  const result = cleanup(context, create());
  assert.ok(result.stats.snowRidges >= 3, JSON.stringify(result.stats));
  assert.ok(result.stats.iceTowers >= 15, JSON.stringify(result.stats));
  assert.ok(result.stats.rockClusters >= 20, JSON.stringify(result.stats));
  assert.ok(result.stats.distantPeaks >= 6, JSON.stringify(result.stats));
  assert.ok(result.stats.parts >= 180);
  assert.equal(result.placements.length, result.stats.placements);
  for (const placement of result.placements) {
    assert.ok(placement.east >= bounds.west && placement.east <= bounds.east, placement.id);
    assert.ok(placement.north >= bounds.south && placement.north <= bounds.north, placement.id);
    assert.equal(placement.base, heightAt(placement.east, placement.north), `${placement.id} must touch the supplied terrain`);
    assert.ok(placement.top > placement.base && placement.top <= townD2MainSummitSnowRidgeSpec.maximumHeight, placement.id);
    if (placement.kind !== 'distant-peak') {
      assert.ok(placement.base >= townD2MainSummitSnowRidgeSpec.minimumHeight, placement.id);
    } else assert.ok(placement.top >= 610, placement.id);
    assert.deepEqual(placement.position, [placement.east, placement.base, -placement.north],
      'model coordinates are x=east, y=height, z=-north');
  }
  assert.equal(result.group.userData.modifiesHeightAt, false);
  assert.equal(result.group.userData.includesWorldCollision, false);
});

test('D2 snow ridges: full footprints clear trails, cable, towers, watch ruins, facilities and glide line', context => {
  const result = cleanup(context, create());
  const towers = createMainSummitRockTowers(trailPoints, heightAt);
  context.after(() => towers.dispose());
  assert.equal(towers.clusters.length, 12);
  assert.equal(result.stats.protectedRockTowerClusters, 12);
  for (const placement of result.placements) {
    assert.ok(routeDistance(placement, trailPoints) - placement.radius >= 15 - 1e-9, placement.id);
    for (const route of exclusions) {
      if (route.kind !== 'polyline') continue;
      assert.ok(routeDistance(placement, route.points) - placement.radius >= 20 - 1e-9, `${placement.id} / ${route.id}`);
    }
    for (const tower of towers.clusters) {
      assert.ok(Math.hypot(placement.east - tower.east, placement.north - tower.north) -
        placement.radius - tower.radius >= 20 - 1e-9, `${placement.id} / ${tower.name}`);
    }
    for (const zone of exclusions) {
      if (zone.kind === 'circle') {
        assert.ok(Math.hypot(placement.east - zone.east, placement.north - zone.north) -
          placement.radius - zone.radius >= 20 - 1e-9, `${placement.id} / ${zone.id}`);
      } else if (zone.kind === 'rectangle') {
        const distance = Math.hypot(Math.max(zone.west - placement.east, placement.east - zone.east, 0),
          Math.max(zone.south - placement.north, placement.north - zone.north, 0));
        assert.ok(distance - placement.radius >= 20 - 1e-9, `${placement.id} / ${zone.id}`);
      }
    }
    const summit = townD2MainSummitSnowRidgeSpec.summitFacilities;
    const distance = Math.hypot(Math.max(summit.west - placement.east, placement.east - summit.east, 0),
      Math.max(summit.south - placement.north, placement.north - summit.north, 0));
    assert.ok(distance - placement.radius >= 20 - 1e-9, `${placement.id} / built-in summit facilities`);
  }
});

test('D2 snow ridges: seeded output is deterministic and a different seed changes the layout', context => {
  const first = cleanup(context, create('north-wind'));
  const second = cleanup(context, create('north-wind'));
  const other = cleanup(context, create('south-wind'));
  assert.deepEqual(first.placements, second.placements);
  assert.deepEqual(first.stats, second.stats);
  assert.deepEqual(geometrySignature(first), geometrySignature(second));
  assert.notDeepEqual(first.placements, other.placements);
  assert.notDeepEqual(geometrySignature(first), geometrySignature(other));
});

test('D2 snow ridges: four faceted material batches stay within four draws and 8k triangles across seeds', context => {
  for (const seed of [undefined, 0, 1, 'north-wind', 'south-wind']) {
    const result = cleanup(context, create(seed));
    const meshes: Mesh[] = [];
    result.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    const materialFamilies = new Set(meshes.map(mesh => mesh.userData.materialFamily));
    assert.deepEqual([...materialFamilies].sort(), ['darkRock', 'ice', 'snow', 'yellowRock']);
    assert.equal(meshes.length, 4);
    assert.equal(result.stats.meshes, 4);
    assert.equal(result.stats.drawCalls, 4);
    assert.equal(result.stats.materialFamilies, 4);
    assert.ok(result.stats.triangles > 5000, 'large formations must contain real faceted surface area');
    assert.ok(result.stats.triangles <= 8000, `${String(seed)} exceeds the triangle budget: ${result.stats.triangles}`);
    for (const mesh of meshes) {
      assert.ok(!(mesh.geometry instanceof BoxGeometry), `${mesh.name} must not be a placeholder box`);
      assert.ok(mesh.material instanceof MeshPhongMaterial);
      assert.ok(mesh.geometry.getAttribute('position').count > 100);
      assert.ok(mesh.geometry.getAttribute('color'));
      assert.ok(mesh.geometry.getAttribute('normal'));
    }
  }
});

test('D2 snow ridges: richer snow/ice/rock colour steps and peak heights retain crown-to-base hierarchy', context => {
  const result = cleanup(context, create());
  for (const family of ['snow', 'ice', 'darkRock', 'yellowRock']) {
    const mesh = result.group.children.find(child => child.userData.materialFamily === family) as Mesh;
    const colors = mesh.geometry.getAttribute('color');
    const positions = mesh.geometry.getAttribute('position');
    const unique = new Set<string>();
    let lower = 0, lowerCount = 0, upper = 0, upperCount = 0;
    let minimum = Infinity, maximum = -Infinity;
    for (let index = 0; index < positions.count; index++) {
      minimum = Math.min(minimum, positions.getY(index));
      maximum = Math.max(maximum, positions.getY(index));
    }
    for (let index = 0; index < colors.count; index++) {
      unique.add(`${colors.getX(index).toFixed(3)},${colors.getY(index).toFixed(3)},${colors.getZ(index).toFixed(3)}`);
      const fraction = (positions.getY(index) - minimum) / (maximum - minimum);
      const luminance = colors.getX(index) * .2126 + colors.getY(index) * .7152 + colors.getZ(index) * .0722;
      if (fraction < .35) { lower += luminance; lowerCount++; }
      if (fraction > .65) { upper += luminance; upperCount++; }
    }
    assert.ok(unique.size >= 4, `${family} needs at least four readable colour steps`);
    assert.ok(lowerCount > 0 && upperCount > 0, `${family} needs both base and crown faces`);
    assert.ok(upper / upperCount > lower / lowerCount,
      `${family} crowns must read brighter than their bases: ${upper / upperCount} <= ${lower / lowerCount}`);
  }
  const peaks = result.placements.filter(item => item.kind === 'distant-peak');
  const tops = [...new Set(peaks.map(item => item.top))];
  assert.ok(tops.length >= 4, 'distant peaks need several skyline tiers');
  assert.ok(Math.max(...tops) - Math.min(...tops) >= 80, 'main peaks need a dominant skyline tier');
});

test('D2 snow ridges: setNight changes only material response, is reversible and adds no light authority', context => {
  const result = cleanup(context, create());
  const meshes = result.group.children as Mesh[];
  const materials = meshes.map(mesh => mesh.material as MeshPhongMaterial);
  const geometryBefore = geometrySignature(result);
  const day = materials.map(material => ({ color: material.color.getHex(), emissive: material.emissive.getHex(),
    intensity: material.emissiveIntensity, specular: material.specular.getHex(), shininess: material.shininess }));
  result.setNight(false);
  result.setNight(true);
  assert.equal(result.group.userData.night, true);
  assert.deepEqual(geometrySignature(result), geometryBefore);
  materials.forEach((material, index) => {
    assert.notEqual(material.color.getHex(), day[index]!.color);
    assert.notEqual(material.emissive.getHex(), 0);
    assert.ok(material.emissiveIntensity > 0);
  });
  const ice = materials[materials.findIndex(material => material.name.endsWith('-ice'))]!;
  assert.ok(ice.shininess > day[materials.indexOf(ice)]!.shininess, 'ice crystals catch more moonlight');
  assert.equal(result.group.children.length, 4, 'night mode must not add lights or meshes');
  result.setNight(true);
  result.setNight(false);
  assert.equal(result.group.userData.night, false);
  assert.deepEqual(geometrySignature(result), geometryBefore);
  assert.deepEqual(materials.map(material => ({ color: material.color.getHex(), emissive: material.emissive.getHex(),
    intensity: material.emissiveIntensity, specular: material.specular.getHex(), shininess: material.shininess })), day);
  assert.throws(() => result.setNight('night' as never), /boolean/);
});

test('D2 snow ridges: all transforms and vertices are finite, with no NaN instance or world data', context => {
  const result = cleanup(context, create());
  result.group.updateMatrixWorld(true);
  result.group.traverse(object => {
    assert.ok([...object.matrixWorld.elements].every(Number.isFinite), object.name);
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    const normals = object.geometry.getAttribute('normal');
    assert.ok([...positions.array].every(Number.isFinite), object.name);
    assert.ok([...normals.array].every(Number.isFinite), object.name);
    for (let index = 0; index < positions.count; index++) {
      assert.ok(positions.getX(index) >= bounds.west - 1e-6 && positions.getX(index) <= bounds.east + 1e-6,
        `${object.name} vertex ${index} leaves the main summit bounds`);
      assert.ok(positions.getZ(index) <= -bounds.south + 1e-6 && positions.getZ(index) >= -bounds.north - 1e-6,
        `${object.name} vertex ${index} leaves the main summit bounds`);
      assert.ok(positions.getY(index) <= townD2MainSummitSnowRidgeSpec.maximumHeight + 1e-6,
        `${object.name} vertex ${index} exceeds H775`);
    }
  });
});

test('D2 snow ridges: dispose detaches the group and releases every geometry/material exactly once', context => {
  const parent = new Group();
  const result = create();
  parent.add(result.group);
  const resources = new Set<BufferGeometry | Material>();
  result.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => resources.add(material));
  });
  let disposals = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { disposals++; });
  result.dispose();
  result.dispose();
  assert.equal(disposals, resources.size);
  assert.equal(parent.children.length, 0);
  assert.equal(result.group.children.length, 0);
  assert.equal(result.group.userData.disposed, true);
  assert.throws(() => result.setNight(true), /disposed/);
});

test('D2 snow ridges: invalid terrain/exclusion inputs fail rather than emitting NaN geometry', () => {
  assert.throws(() => createTownD2MainSummitSnowRidges({ heightAt, trailPoints }), /exclusions/);
  assert.throws(() => createTownD2MainSummitSnowRidges({ heightAt: () => NaN, trailPoints, exclusions }), /no valid/);
  assert.throws(() => createTownD2MainSummitSnowRidges({ heightAt, trailPoints: [{ east: NaN, north: 0 }], exclusions }), /finite/);
  assert.throws(() => createTownD2MainSummitSnowRidges({ heightAt, trailPoints,
    exclusions: [{ kind: 'circle', east: 0, north: 0, radius: -1 }] }), /circle exclusion/);
});
