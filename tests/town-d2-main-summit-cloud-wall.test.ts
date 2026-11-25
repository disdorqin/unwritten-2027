import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Object3D, Vector3, type Material,
} from 'three';
import {
  createMainSummitBlock, mainSummitBounds, mainSummitLayout,
} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { cloudPavilionSites } from '../tools/voxel-tavern/town-blockout/main-summit-pavilion-site';
import { cloudPavilionDimensions } from '../tools/voxel-tavern/town-blockout/main-summit-pavilions';
import { northRidgeCableAnchors } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import {
  createTownD2MainSummitCloudWall, townD2MainSummitCloudSpec,
  type TownD2MainSummitCloudExclusion, type TownD2MainSummitCloudPlacement,
  type TownD2MainSummitCloudPoint,
} from '../tools/voxel-tavern/town-blockout/town-d2-main-summit-cloud-wall';

const heightAt = (east: number, north: number) => 310 + Math.sin(east * .01) * 12 + Math.cos(north * .012) * 8;
const trail: readonly TownD2MainSummitCloudPoint[] = [
  { east: -1000, north: 900, height: 350 },
  { east: -800, north: 900, height: 395 },
  { east: -600, north: 900, height: 480 },
  { east: -400, north: 900, height: 565 },
];

function distanceToSegment(east: number, north: number, a: TownD2MainSummitCloudPoint, b: TownD2MainSummitCloudPoint) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared)) : 0;
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function distanceToTrail(east: number, north: number) {
  let result = Infinity;
  for (let index = 1; index < trail.length; index++) {
    result = Math.min(result, distanceToSegment(east, north, trail[index - 1]!, trail[index]!));
  }
  return result;
}

function cloudMesh(cloud: ReturnType<typeof createTownD2MainSummitCloudWall>) {
  const meshes: Mesh[] = [];
  cloud.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  assert.equal(meshes.length, 1);
  const mesh = meshes[0]!;
  assert.ok(mesh instanceof InstancedMesh);
  return mesh;
}

function worldVertices(cloud: ReturnType<typeof createTownD2MainSummitCloudWall>) {
  const mesh = cloudMesh(cloud);
  const source = mesh.geometry.getAttribute('position');
  const result: Vector3[] = [];
  const matrix = new Matrix4();
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix);
    for (let vertex = 0; vertex < source.count; vertex++) {
      result.push(new Vector3().fromBufferAttribute(source, vertex).applyMatrix4(matrix));
    }
  }
  return result;
}

function colors(cloud: ReturnType<typeof createTownD2MainSummitCloudWall>) {
  const mesh = cloudMesh(cloud);
  assert.ok(mesh.instanceColor);
  return [...mesh.instanceColor.array];
}

test('D2 summit cloud supplement covers the band with walls, isolated peaks and the lower cloudfall', () => {
  const cloud = createTownD2MainSummitCloudWall(heightAt, trail);
  assert.equal(cloud.group.name, 'town-d2-main-summit-cloud-wall');
  assert.equal(cloud.group.userData.includesWorldCollision, false);
  assert.equal(cloud.group.userData.modifiesHeightAt, false);
  assert.equal(cloud.group.userData.modifiesCloudLayer, false);
  assert.ok(cloud.stats.familyCounts['cloud-wall'] > 0);
  assert.ok(cloud.stats.familyCounts['isolated-peak'] > 0);
  assert.ok(cloud.stats.familyCounts['cloudfall-lower'] > 0);
  assert.ok(cloud.placements.length > 100);
  assert.equal(cloud.stats.instances, cloud.placements.length);
  assert.equal(cloud.stats.triangles, cloudMesh(cloud).count * cloudMesh(cloud).geometry.getAttribute('position').count / 3);

  const walls = cloud.placements.filter(item => item.family === 'cloud-wall');
  for (const wall of walls) {
    assert.ok(wall.radiusY * 2 >= townD2MainSummitCloudSpec.wallMinHeight);
    assert.ok(wall.radiusY * 2 <= townD2MainSummitCloudSpec.wallMaxHeight + 1e-9);
  }
  const fall = cloud.placements.filter(item => item.family === 'cloudfall-lower');
  assert.ok(fall.some(item => item.north < mainSummitBounds.south + 170));
  assert.ok(Math.max(...fall.map(item => item.height + item.radiusY)) < 425,
    'this module only supplies the lower visible cloudfall section');
  cloud.dispose();
});

test('all instances and actual transformed vertices stay in bounds, above terrain and outside trail ±15 m', () => {
  const cloud = createTownD2MainSummitCloudWall({ heightAt, trailPoints: trail });
  const mesh = cloudMesh(cloud);
  assert.equal(mesh.count, cloud.placements.length);
  const pose = new Object3D();
  for (const [index, placement] of cloud.placements.entries()) {
    for (const value of Object.values(placement)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${placement.id} has NaN/Infinity`);
    }
    assert.ok(placement.east >= mainSummitBounds.west && placement.east <= mainSummitBounds.east);
    assert.ok(placement.north >= mainSummitBounds.south && placement.north <= mainSummitBounds.north);
    assert.ok(placement.height - placement.radiusY >= townD2MainSummitCloudSpec.bottom);
    assert.ok(placement.height + placement.radiusY <= townD2MainSummitCloudSpec.top);
    assert.ok(placement.groundClearance >= townD2MainSummitCloudSpec.terrainClearance - 1e-9);
    assert.ok(placement.trailClearance >= townD2MainSummitCloudSpec.trailClearance - 1e-9);

    const matrix = new Matrix4();
    mesh.getMatrixAt(index, matrix);
    assert.ok([...matrix.elements].every(Number.isFinite));
    matrix.decompose(pose.position, pose.quaternion, pose.scale);
    assert.ok(Math.abs(pose.position.x - placement.east) < 1e-4);
    assert.ok(Math.abs(pose.position.y - placement.height) < 1e-4);
    assert.ok(Math.abs(pose.position.z + placement.north) < 1e-4, 'world z must be -north');
    assert.ok(Math.abs(pose.scale.x - placement.radiusX) < 1e-4);
    assert.ok(Math.abs(pose.scale.y - placement.radiusY) < 1e-4);
    assert.ok(Math.abs(pose.scale.z - placement.radiusZ) < 1e-4);
  }

  let minimumTrailDistance = Infinity;
  for (const vertex of worldVertices(cloud)) {
    assert.ok(Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z));
    assert.ok(vertex.x >= mainSummitBounds.west - 1e-6 && vertex.x <= mainSummitBounds.east + 1e-6);
    assert.ok(vertex.z <= -mainSummitBounds.south + 1e-6 && vertex.z >= -mainSummitBounds.north - 1e-6);
    assert.ok(vertex.y >= townD2MainSummitCloudSpec.bottom - 1e-6);
    assert.ok(vertex.y <= townD2MainSummitCloudSpec.top + 1e-6);
    assert.ok(vertex.y >= heightAt(vertex.x, -vertex.z) + townD2MainSummitCloudSpec.terrainClearance - 1e-6);
    const distance = distanceToTrail(vertex.x, -vertex.z);
    minimumTrailDistance = Math.min(minimumTrailDistance, distance);
    assert.ok(distance >= townD2MainSummitCloudSpec.trailClearance - 1e-6,
      `cloud vertex enters the trail clearance at ${vertex.x},${-vertex.z}`);
  }
  assert.ok(minimumTrailDistance >= townD2MainSummitCloudSpec.trailClearance);
  cloud.dispose();
});

test('cable, pavilion, icefall and glide exclusion volumes remove intersecting cloud geometry', () => {
  const reference = createTownD2MainSummitCloudWall(heightAt, trail);
  const peak = reference.placements.find(item => item.family === 'isolated-peak')!;
  const fall = reference.placements.find(item => item.family === 'cloudfall-lower')!;
  const wall = reference.placements.find(item => item.family === 'cloud-wall')!;
  const exclusions: readonly TownD2MainSummitCloudExclusion[] = [
    { kind: 'cable', points: [
      { east: -900, north: 400, height: 380 }, { east: -900, north: 700, height: 560 },
    ], radius: 20 },
    { kind: 'pavilion', east: peak.east, north: peak.north, radius: 12, minHeight: 380, maxHeight: 560 },
    { kind: 'icefall', minEast: fall.east - 15, maxEast: fall.east + 15,
      minNorth: fall.north - 15, maxNorth: fall.north + 15, minHeight: 380, maxHeight: 560 },
    { kind: 'glide', points: [
      { east: wall.east - 25, north: wall.north, height: wall.height },
      { east: wall.east + 25, north: wall.north, height: wall.height },
    ], radius: 10 },
    { kind: 'glide', points: [
      { east: wall.east, north: wall.north - 100, height: wall.height },
      { east: wall.east, north: wall.north + 100, height: wall.height },
    ], radius: 1 },
  ];
  const cloud = createTownD2MainSummitCloudWall({ heightAt, trailPoints: trail, exclusions });
  assert.ok(cloud.stats.rejected.exclusion > 0, 'fixtures must exercise exclusion rejection');
  assert.ok(!cloud.placements.some(item => Math.hypot(item.east - wall.east, item.north - wall.north) < 1 &&
    Math.abs(item.height - wall.height) < 1), 'north-running glide exclusion must remove the centre cloud');
  assert.ok(cloud.placements.length < reference.placements.length);
  assert.equal(new Set(exclusions.map(item => item.kind)).size, 4);

  const vertices = worldVertices(cloud);
  for (const vertex of vertices) {
    const east = vertex.x, north = -vertex.z;
    const cableT = Math.max(0, Math.min(1, (north - 400) / 300));
    const cableDistance = Math.hypot(east + 900, north - (400 + cableT * 300),
      vertex.y - (380 + cableT * 180));
    assert.ok(cableDistance >= 20 - 1e-6, 'cloud vertex enters the 3D cable clearance');
    assert.ok(Math.hypot(east - peak.east, north - peak.north) >= 12 - 1e-6,
      'cloud vertex enters the pavilion footprint');
    assert.ok(east < fall.east - 15 - 1e-6 || east > fall.east + 15 + 1e-6 ||
      north < fall.north - 15 - 1e-6 || north > fall.north + 15 + 1e-6 ||
      vertex.y < 380 || vertex.y > 560, 'cloud vertex enters the icefall box');
    const dx = east - wall.east, dn = north - wall.north;
    const along = Math.max(0, Math.min(1, dx / 50));
    const distance = Math.hypot(east - (wall.east - 25 + along * 50), vertex.y - wall.height);
    assert.ok(distance >= 10 - 1e-6, 'cloud vertex enters the 3D glide sweep');
  }
  reference.dispose();
  cloud.dispose();
});

test('a whole-domain exclusion yields no clouds rather than silently ignoring clearance', () => {
  const cloud = createTownD2MainSummitCloudWall(heightAt, trail, [{
    kind: 'custom', minEast: mainSummitBounds.west, maxEast: mainSummitBounds.east,
    minNorth: mainSummitBounds.south, maxNorth: mainSummitBounds.north,
    minHeight: 380, maxHeight: 560,
  }]);
  assert.equal(cloud.placements.length, 0);
  assert.equal(cloudMesh(cloud).count, 0);
  assert.equal(cloud.stats.instances, 0);
  assert.equal(cloud.stats.rejected.exclusion + cloud.stats.rejected.trail +
    cloud.stats.rejected.terrain + cloud.stats.rejected.bounds + cloud.stats.rejected.height,
  cloud.stats.candidates);
  cloud.dispose();
});

test('the same unsigned seed reproduces placements, matrices and statistics exactly', () => {
  const first = createTownD2MainSummitCloudWall({ heightAt, trailPoints: trail, seed: 20271121 });
  const second = createTownD2MainSummitCloudWall({ heightAt, trailPoints: trail, seed: 20271121 });
  assert.deepEqual(first.placements, second.placements);
  assert.deepEqual(first.stats, second.stats);
  const a = cloudMesh(first), b = cloudMesh(second);
  assert.deepEqual([...a.instanceMatrix.array], [...b.instanceMatrix.array]);
  assert.deepEqual(colors(first), colors(second));
  first.dispose(); second.dispose();
});

test('setNight changes a varied snow-white palette to night blue and can restore day', () => {
  const cloud = createTownD2MainSummitCloudWall(heightAt, trail);
  const day = colors(cloud);
  assert.ok(new Set(day).size >= 12, 'multiple instance colors prevent a flat white cloud wall');
  const dayMean = day.reduce((sum, value, index) => sum + (index % 3 === 0 ? value : 0), 0) / (day.length / 3);
  cloud.setNight(true);
  const night = colors(cloud);
  assert.notDeepEqual(night, day);
  assert.ok(night.every((value, index) => value !== day[index]));
  for (let index = 0; index < night.length; index += 3) {
    assert.ok(night[index + 2]! > night[index]!, 'night blue channel must exceed red');
    assert.ok(night[index + 1]! > night[index]!, 'night green channel must exceed red');
  }
  const nightMean = night.reduce((sum, value, index) => sum + (index % 3 === 0 ? value : 0), 0) / (night.length / 3);
  assert.ok(nightMean < dayMean * .5);
  const once = [...night];
  cloud.setNight(true);
  assert.deepEqual(colors(cloud), once);
  cloud.setNight(false);
  assert.deepEqual(colors(cloud), day);
  cloud.dispose();
});

test('cloud puffs fill their vertical radius with smooth layered tints and one opaque fogged Lambert pass', () => {
  const cloud = createTownD2MainSummitCloudWall(heightAt, trail);
  const mesh = cloudMesh(cloud);
  const material = mesh.material as MeshLambertMaterial;
  assert.ok(material instanceof MeshLambertMaterial);
  assert.equal(material.transparent, false);
  assert.equal(material.opacity, 1);
  assert.equal(material.depthWrite, true);
  assert.equal(material.vertexColors, true);
  assert.equal(material.flatShading, false);
  assert.equal(material.fog, true);

  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const tint = mesh.geometry.getAttribute('color');
  assert.equal(tint.count, position.count);
  const top: number[] = [], bottom: number[] = [];
  for (let index = 0; index < position.count; index++) {
    const px = position.getX(index), py = position.getY(index), pz = position.getZ(index);
    assert.ok(Math.hypot(px, py, pz) <= 1 + 1e-6, 'puff vertices must stay inside the exclusion bounding sphere');
    assert.ok((px * normal.getX(index) + py * normal.getY(index) + pz * normal.getZ(index)) /
      Math.hypot(px, py, pz) > .9999, 'radial normals must shade each puff smoothly');
    const shade = (tint.getX(index) + tint.getY(index) + tint.getZ(index)) / 3;
    assert.ok(shade >= .84 && shade <= 1);
    if (py > .9) top.push(shade);
    if (py < -.9) bottom.push(shade);
  }
  assert.ok(top.length && bottom.length);
  assert.ok(Math.max(...position.array.filter((_: number, index: number) => index % 3 === 1)) > .95);
  assert.ok(Math.min(...position.array.filter((_: number, index: number) => index % 3 === 1)) < -.95);
  const topMean = top.reduce((sum, value) => sum + value, 0) / top.length;
  const bottomMean = bottom.reduce((sum, value) => sum + value, 0) / bottom.length;
  assert.ok(topMean > bottomMean + .04, 'upper billows should catch more snow light than the underside');
  assert.ok(new Set(tint.array).size >= 12, 'vertex tints need multiple soft levels');
  cloud.setNight(true);
  assert.equal(material.opacity, 1, 'night tinting must keep the cloud opaque and inexpensive');
  cloud.dispose();
});

test('the reviewed summit host fixture keeps 472 instances, one draw and 9,440 triangles', () => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 64);
  const trail = createMainSummitTrail(block.heightAt, 347);
  const exclusions: readonly TownD2MainSummitCloudExclusion[] = [
    { kind: 'cable', radius: 20, points: northRidgeCableAnchors.map(([east, north]) => ({
      east, north, height: block.heightAt(east, north),
    })) },
    ...cloudPavilionSites.map(site => {
      const margin = 13 + cloudPavilionDimensions[site.id].width / 2;
      return {
        kind: 'pavilion' as const,
        minEast: site.east - margin, maxEast: site.east + margin,
        minNorth: site.north - margin, maxNorth: site.north + margin,
      };
    }),
  ];
  const cloud = createTownD2MainSummitCloudWall({ heightAt: block.heightAt, trailPoints: trail.points, exclusions });
  try {
    assert.equal(cloud.stats.instances, 472);
    assert.equal(cloud.stats.meshes, 1);
    assert.equal(cloud.stats.drawCalls, 1);
    assert.equal(cloud.stats.triangles, 9_440);
    assert.ok(cloud.stats.triangles <= 12_000);
    assert.ok(cloud.stats.minTrailClearance >= townD2MainSummitCloudSpec.trailClearance);
    assert.equal(cloud.stats.rejected.exclusion, 5, 'the reviewed cable and pavilion volumes stay active');
  } finally {
    cloud.dispose();
    block.dispose();
  }
});

test('one instanced mesh stays below ten draws and has finite geometry, matrices and colors', () => {
  const cloud = createTownD2MainSummitCloudWall(heightAt, trail);
  let meshes = 0, instanced = 0;
  cloud.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    meshes++;
    if (object instanceof InstancedMesh) instanced++;
    const material = Array.isArray(object.material) ? object.material[0]! : object.material;
    for (const attribute of Object.values(object.geometry.attributes) as { array: ArrayLike<number> }[]) {
      assert.ok(Array.from(attribute.array).every(Number.isFinite), `${object.name} has a non-finite attribute`);
    }
    assert.ok('color' in material);
  });
  assert.equal(instanced, meshes);
  assert.ok(meshes <= townD2MainSummitCloudSpec.maxDraws);
  assert.ok(cloud.stats.drawCalls <= townD2MainSummitCloudSpec.maxDraws);
  assert.equal(cloud.stats.drawCalls, meshes);
  assert.ok([...cloudMesh(cloud).instanceMatrix.array].every(Number.isFinite));
  assert.ok(colors(cloud).every(Number.isFinite));
  assert.equal(cloudMesh(cloud).geometry.getAttribute('position').count / 3, 20,
    'visual refinements must not add faces per instance');
  assert.equal(cloud.stats.triangles, cloud.stats.instances * 20);
  cloud.dispose();
});

test('dispose releases the mesh, geometry and material exactly once', () => {
  const owner = new Group();
  const cloud = createTownD2MainSummitCloudWall(heightAt, trail);
  owner.add(cloud.group);
  const mesh = cloudMesh(cloud);
  const released: string[] = [];
  mesh.addEventListener('dispose', () => released.push('mesh'));
  mesh.geometry.addEventListener('dispose', () => released.push('geometry'));
  (mesh.material as Material).addEventListener('dispose', () => released.push('material'));
  cloud.dispose();
  cloud.dispose();
  assert.deepEqual(released.sort(), ['geometry', 'material', 'mesh']);
  assert.equal(owner.children.length, 0);
  assert.equal(cloud.group.children.length, 0);
  assert.equal(cloud.group.userData.disposed, true);
  assert.throws(() => cloud.setNight(true), /disposed/);
});

test('invalid seeds, trails and exclusion dimensions fail without writing host data', () => {
  assert.throws(() => createTownD2MainSummitCloudWall({ heightAt, seed: -1 }), /seed/);
  assert.throws(() => createTownD2MainSummitCloudWall(heightAt, [{ east: NaN, north: 0 }]), /trail/);
  assert.throws(() => createTownD2MainSummitCloudWall(heightAt, [], [{
    kind: 'custom', minEast: 10, maxEast: 0, minNorth: 0, maxNorth: 10,
  }]), /box/);
  assert.throws(() => createTownD2MainSummitCloudWall(heightAt, [], [{
    kind: 'cable', points: [{ east: 0, north: 0 }],
  }]), /radius/);
});
