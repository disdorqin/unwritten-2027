import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Mesh, PointLight, Raycaster, Vector3 } from 'three';
import {
  crystalCave, crystalCaveCanStand, crystalCaveClusterClearance, crystalCaveDistanceToPath, crystalCaveFloorAt,
  crystalCaveMainPath, crystalCaveMoonstonePath, crystalCaveRegionAt, crystalCaveRoofAt, crystalCaveSites,
  type CavePoint,
} from '../tools/voxel-tavern/town-blockout/underground-crystal-cave';
import { mountUndergroundCrystalCave } from '../tools/voxel-tavern/town-blockout/underground-crystal-cave-scene';

const rounded = (number: number) => Number(number.toFixed(6));

function walk(path: readonly CavePoint[], step = .025) {
  let length = 0, samples = 0, maxGrade = 0, minCrystalClearance = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [e, n] = path[i - 1]!;
    const [ex, nx] = path[i]!;
    const distance = Math.hypot(ex - e, nx - n);
    const segments = Math.ceil(distance / step);
    let previous = crystalCaveFloorAt(e, n)!;
    length += distance;
    for (let j = 1; j <= segments; j++) {
      const e1 = e + (ex - e) * j / segments;
      const n1 = n + (nx - n) * j / segments;
      const height = crystalCaveFloorAt(e1, n1)!;
      assert.ok(crystalCaveCanStand(e1, n1, .55), `cave capsule at ${e1}, ${n1}`);
      assert.ok(crystalCaveRoofAt(e1, n1) - height >= 1.8, `cave headroom at ${e1}, ${n1}`);
      for (const site of crystalCaveSites) {
        minCrystalClearance = Math.min(minCrystalClearance,
          Math.hypot(site.point[0] - e1, site.point[1] - n1) - crystalCaveClusterClearance(site));
      }
      maxGrade = Math.max(maxGrade, Math.abs(height - previous) * segments / distance);
      previous = height;
      samples++;
    }
  }
  return { length: rounded(length), samples, maxGrade: rounded(maxGrade), minCrystalClearance: rounded(minCrystalClearance) };
}

test('U-9 register crystal deposits by cave region and keep rich deposits away from the through route', t => {
  assert.equal(crystalCave.depthMetres, -140);
  assert.equal(new Set(crystalCaveSites.map(site => site.id)).size, crystalCaveSites.length);
  for (const site of crystalCaveSites) {
    assert.equal(crystalCaveRegionAt(...site.point), site.region);
    if (site.role === 'deposit') assert.ok(crystalCaveDistanceToPath(site.point, crystalCaveMainPath) >= 10);
    if (site.region === 'crystal-forest') assert.ok(site.height >= .5 && site.height <= 1.5);
    if (site.mineral === 'moonstone') assert.equal(site.region, 'moonstone-vein');
    if (site.mineral === 'amethyst-cluster') assert.ok(site.region === 'crystal-forest' && site.point[1] > 10);
    assert.notEqual(site.region, 'dark-passage');
  }
  const pillars = crystalCaveSites.filter(site => site.role === 'column');
  assert.equal(pillars.length, 3);
  assert.ok(pillars.every(site => site.height >= 7.5 && site.height <= 8.5));
  t.diagnostic(JSON.stringify({ sites: crystalCaveSites.length, depositDistances: crystalCaveSites.filter(site => site.role === 'deposit')
    .map(site => [site.id, rounded(crystalCaveDistanceToPath(site.point, crystalCaveMainPath))]), pillarHeights: pillars.map(site => site.height) }));
});

test('U-9 a standing player with clearance walks the chicane, hall, dry pool edge, and both ways on the side spur', t => {
  assert.equal(crystalCaveCanStand(0, 5.4), false, 'low crystal means the corridor does not walk straight');
  assert.equal(crystalCaveCanStand(0, 10.5), false);
  assert.ok(crystalCaveMainPath.filter(point => crystalCaveRegionAt(...point) === 'underground-pool')
    .every(point => crystalCaveFloorAt(...point)! > crystalCave.pool.waterY));
  const main = walk(crystalCaveMainPath);
  const returnMain = walk([...crystalCaveMainPath].reverse());
  const spur = walk(crystalCaveMoonstonePath);
  const returnSpur = walk([...crystalCaveMoonstonePath].reverse());
  assert.ok(main.maxGrade <= .09);
  assert.ok(spur.maxGrade <= .08);
  assert.ok(main.minCrystalClearance >= .55 && spur.minCrystalClearance >= .55);
  t.diagnostic(JSON.stringify({ main, returnMain, spur, returnSpur }));
});

test('U-9 hall headroom, knee-depth basin and dark bend follow the surveyed shell', t => {
  let min = Infinity, max = -Infinity, samples = 0;
  for (let n = 18; n <= 46; n += .5) for (let e = -13; e <= 13; e += .5) {
    const room = crystalCaveRoofAt(e, n) - crystalCaveFloorAt(e, n)!;
    min = Math.min(min, room);
    max = Math.max(max, room);
    samples++;
  }
  assert.ok(min >= 12 && max >= 14 && max <= 15);
  assert.ok(Math.abs(crystalCave.pool.waterY - crystalCaveFloorAt(...crystalCave.pool.centre)! - .44) < 1e-9);
  function wallInSight([e, n]: CavePoint) {
    const [ex, nx] = crystalCave.exit;
    for (let i = 1; i < 100; i++) {
      if (crystalCaveRegionAt(e + (ex - e) * i / 100, n + (nx - n) * i / 100) === undefined) return true;
    }
    return false;
  }
  assert.equal(wallInSight([0, 92]), true);
  assert.equal(wallInSight([0, 98]), false);
  t.diagnostic(JSON.stringify({ hallCeilingMin: rounded(min), hallCeilingMax: rounded(max), samples,
    poolDepth: crystalCave.pool.depth, darkPassage: 98 - 66 + crystalCave.exit[0] }));
});

test('U-9 renders the surveyed floor accurately and pulses light only, with one-time resource release', t => {
  const owner = new Group();
  const cave = mountUndergroundCrystalCave(owner);
  const floor = cave.group.getObjectByName('crystal-cave-floor') as Mesh;
  assert.ok(floor.isMesh);
  cave.group.updateMatrixWorld(true);
  let largestHeightMismatch = 0;
  for (const point of [...crystalCaveMainPath, ...crystalCaveMoonstonePath, crystalCave.pool.centre]) {
    const [e, n] = point;
    const y = crystalCaveFloorAt(e, n)!;
    const ray = new Raycaster(new Vector3(e, y + .5, -n), new Vector3(0, -1, 0), 0, 1);
    const intersection = ray.intersectObject(floor)[0];
    assert.ok(intersection, `[${e},${n}] floor mesh has no support`);
    largestHeightMismatch = Math.max(largestHeightMismatch, Math.abs(intersection.point.y - y));
  }
  const columns = ['hall-column-west', 'hall-column-east', 'hall-column-north'];
  const positions = columns.map(id => {
    const mesh = cave.group.getObjectByName(id)!.getObjectByName('faceted-shard')!;
    assert.equal(mesh.rotation.z, crystalCave.growthAngleRadians);
    return mesh.position.toArray();
  });
  const lights = columns.map(id => cave.group.getObjectByName(`light-${id}`) as PointLight);
  cave.update(0);
  const low = lights.map(light => light.intensity);
  cave.update(10);
  assert.ok(lights.every((light, i) => light.intensity > low[i]!));
  cave.update(20);
  assert.deepEqual(lights.map(light => light.intensity), low);
  assert.deepEqual(columns.map(id => cave.group.getObjectByName(id)!.getObjectByName('faceted-shard')!.position.toArray()), positions);
  assert.ok(largestHeightMismatch < .00001);
  let releases = 0;
  floor.geometry.addEventListener('dispose', () => { releases++; });
  cave.dispose();
  cave.dispose();
  assert.equal(releases, 1);
  assert.equal(owner.children.length, 0);
  t.diagnostic(JSON.stringify({ largestHeightMismatch, floorTriangles: floor.geometry.index!.count / 3, lightPeriodSeconds: 20 }));
});
