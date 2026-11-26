import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, BufferGeometry, Color, Group, Mesh, MeshLambertMaterial } from 'three';
import {
  buildTownD2R30ChunkGeometry, createTownD2R30Massif,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-massif';
import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30ChunkList, townD2R30GridAxis, townD2R30Spec,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import { createTownD2R30Collision } from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';

const finiteArray = (geometry: BufferGeometry, attribute: string) => {
  const array = geometry.getAttribute(attribute)?.array;
  assert.ok(array, `missing ${attribute}`);
  assert.ok(array.every(Number.isFinite), `${attribute} contains a non-finite value`);
};

const canonicalCellFractions = [[0, 0], [1, 0], [0, 1], [.2, .3], [.7, .6]] as const;

function visibleTriangleHeight(
  geometry: BufferGeometry, eastAxis: readonly number[], northAxis: readonly number[], east: number, north: number,
) {
  let column = 0, row = 0;
  while (column < eastAxis.length - 2 && east > eastAxis[column + 1]!) column++;
  while (row < northAxis.length - 2 && north > northAxis[row + 1]!) row++;
  const west = eastAxis[column]!, eastEdge = eastAxis[column + 1]!;
  const south = northAxis[row]!, northEdge = northAxis[row + 1]!;
  const u = (east - west) / (eastEdge - west), v = (north - south) / (northEdge - south);
  const position = geometry.getAttribute('position');
  const vertex = row * eastAxis.length + column;
  const a = position.getY(vertex), b = position.getY(vertex + 1);
  const c = position.getY(vertex + eastAxis.length), d = position.getY(vertex + eastAxis.length + 1);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : (1 - v) * b + (u + v - 1) * d + (1 - u) * c;
}

test('D2-R30 chunk geometry is a complete upward indexed grid with finite colors and normals', () => {
  const chunk = townD2R30ChunkList[0]!;
  const geometry = buildTownD2R30ChunkGeometry(chunk, 16, 347);
  const eastAxis = townD2R30GridAxis(chunk.west, chunk.east, 16);
  const northAxis = townD2R30GridAxis(chunk.south, chunk.north, 16);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  assert.equal(position.count, eastAxis.length * northAxis.length);
  assert.equal(index.count, (eastAxis.length - 1) * (northAxis.length - 1) * 6);
  assert.equal(geometry.getAttribute('color').count, position.count);
  finiteArray(geometry, 'position');
  finiteArray(geometry, 'color');
  finiteArray(geometry, 'normal');
  for (let row = 0; row < northAxis.length; row++) {
    for (let column = 0; column < eastAxis.length; column++) {
      const vertex = row * eastAxis.length + column;
      assert.equal(position.getX(vertex), eastAxis[column]);
      assert.ok(Math.abs(position.getY(vertex) - sampleTownD2R30Height(eastAxis[column]!, northAxis[row]!)!) < 1e-4);
      assert.equal(position.getZ(vertex), -northAxis[row]);
    }
  }
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset), b = index.getX(offset + 1), c = index.getX(offset + 2);
    const abx = position.getX(b) - position.getX(a);
    const abz = position.getZ(b) - position.getZ(a);
    const acx = position.getX(c) - position.getX(a);
    const acz = position.getZ(c) - position.getZ(a);
    assert.ok(abz * acx - abx * acz > 0, 'triangle normal must point up');
  }
  geometry.dispose();
});

test('D2-R30 massif preserves anchors and covers all four 2200 by 1800 sides', () => {
  const massif = createTownD2R30Massif();
  const { group, heightAt, stats } = massif;
  assert.equal(heightAt(50, 1_000), 800);
  assert.equal(heightAt(-550, 900), 560);
  assert.equal(heightAt(590, 1_080), 610);
  assert.equal(heightAt(0, -10), 347);
  for (let east = -30; east <= 30; east += 5) {
    for (let north = -10; north <= 40; north += 5) assert.equal(heightAt(east, north), 347);
  }
  const box = new Box3().setFromObject(group);
  assert.equal(box.max.x - box.min.x, 2_200);
  assert.equal(box.max.z - box.min.z, 1_800);
  assert.equal(box.min.x, -1_100);
  assert.equal(box.max.x, 1_100);
  assert.equal(box.min.z, -1_790);
  assert.equal(box.max.z, 10);
  assert.equal(stats().maxHeight, 800);
  assert.ok(stats().minTopHeight >= 150);
  assert.equal(stats().minHeight, townD2R30Spec.floorHeight);
  for (const [east, north] of [
    [-1_100, -10], [-1_100, 890], [-1_100, 1_790],
    [1_100, -10], [1_100, 890], [1_100, 1_790],
    [-1_100, 1_790], [0, 1_790], [1_100, 1_790],
  ]) assert.ok(Number.isFinite(heightAt(east, north)));
  const topMeshes = group.children.filter(child => child.name.startsWith('town-d2-r30-top-'));
  assert.equal(topMeshes.length, townD2R30ChunkList.length);
  for (const side of [
    { name: 'west', test: (x: number, z: number) => x === -1_100 },
    { name: 'east', test: (x: number, z: number) => x === 1_100 },
    { name: 'south', test: (x: number, z: number) => z === 10 },
    { name: 'north', test: (x: number, z: number) => z === -1_790 },
  ]) {
    let samples = 0;
    for (const mesh of topMeshes) {
      const position = (mesh as Mesh).geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex++) {
        if (side.test(position.getX(vertex), position.getZ(vertex))) samples++;
      }
    }
    assert.ok(samples > 100, `${side.name} top boundary is missing`);
  }
  assert.ok(group.getObjectByName('town-d2-r30-closed-perimeter'));
  assert.ok(group.getObjectByName('town-d2-r30-floor'));
  massif.dispose();
});

test('D2-R30 default mesh is watertight, colored by bands and reports indexed statistics', () => {
  const massif = createTownD2R30Massif();
  const { group, stats } = massif;
  const statsValue = stats();
  assert.equal(statsValue.spacing, 8);
  assert.equal(statsValue.meshes, townD2R30ChunkList.length + 2);
  assert.equal(statsValue.draws, statsValue.meshes);
  let vertices = 0, triangles = 0;
  const welded = new Map<string, number>();
  let nextWeldedVertex = 0;
  const positionKey = (x: number, y: number, z: number) => `${x.toFixed(4)}:${y.toFixed(4)}:${z.toFixed(4)}`;
  const edges = new Map<string, { count: number; direction: number }>();
  const colors = new Set<string>();
  let ochreSamples = 0, iceSamples = 0, forestSamples = 0;
  for (const child of group.children) {
    const mesh = child as Mesh;
    assert.ok(materialIsShared(mesh, group));
    const geometry = mesh.geometry;
    finiteArray(geometry, 'position');
    finiteArray(geometry, 'color');
    finiteArray(geometry, 'normal');
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    assert.ok(index, 'all massif geometry must be indexed');
    vertices += position.count;
    triangles += index.count / 3;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const key = positionKey(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      if (!welded.has(key)) welded.set(key, nextWeldedVertex++);
      assert.ok(Math.abs(Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)) - 1) < 1e-5);
      const r = color.getX(vertex), g = color.getY(vertex), b = color.getZ(vertex);
      colors.add(`${r.toFixed(3)}:${g.toFixed(3)}:${b.toFixed(3)}`);
      if (r > g * 1.06 && g > b * 1.06) ochreSamples++;
      if (b > r * 1.025 && g > r * 1.025) iceSamples++;
      if (g > r * 1.06 && g > b * 1.06) forestSamples++;
    }
    for (let offset = 0; offset < index.count; offset += 3) {
      const corners = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
      for (let side = 0; side < 3; side++) {
        const a = welded.get(positionKey(position.getX(corners[side]!), position.getY(corners[side]!), position.getZ(corners[side]!)))!;
        const b = welded.get(positionKey(position.getX(corners[(side + 1) % 3]!), position.getY(corners[(side + 1) % 3]!), position.getZ(corners[(side + 1) % 3]!)))!;
        const low = Math.min(a, b), high = Math.max(a, b), key = `${low}:${high}`;
        const edge = edges.get(key) ?? { count: 0, direction: 0 };
        edge.count++;
        edge.direction += a < b ? 1 : -1;
        edges.set(key, edge);
      }
    }
  }
  assert.equal(statsValue.vertices, vertices);
  assert.equal(statsValue.triangles, triangles);
  assert.equal(vertices, 69_173);
  assert.equal(triangles, 126_750);
  assert.equal(triangles, (2_200 / 8) * (1_800 / 8) * 2 + 6 * (2_200 / 8 + 1_800 / 8));
  assert.ok(colors.size > 1_000, 'surface needs varied band and relief colors');
  assert.ok(ochreSamples > 0 && iceSamples > 0 && forestSamples > 0, 'ochre, ice and forest bands must be visible');
  for (const [key, edge] of edges) {
    assert.equal(edge.count, 2, `open or non-manifold edge ${key}`);
    assert.equal(edge.direction, 0, `inconsistent winding at edge ${key}`);
  }
  massif.dispose();
});

test('D2-R30 visible canonical triangles and collision agree across the full 8m domain', () => {
  const massif = createTownD2R30Massif();
  const collision = createTownD2R30Collision();
  try {
    assert.equal(massif.stats().spacing, 8);
    assert.equal(collision.stats().spacing, 8);
    const topMeshes = massif.group.children.filter(child => child.name.startsWith('town-d2-r30-top-'));
    let maxDifference = 0, sampleCount = 0;
    for (const child of topMeshes) {
      const mesh = child as Mesh;
      const chunk = townD2R30ChunkList.find(candidate => candidate.key === mesh.name.slice('town-d2-r30-top-'.length))!;
      const eastAxis = townD2R30GridAxis(chunk.west, chunk.east, 8);
      const northAxis = townD2R30GridAxis(chunk.south, chunk.north, 8);
      for (let row = 0; row + 1 < northAxis.length; row++) {
        for (let column = 0; column + 1 < eastAxis.length; column++) {
          const west = eastAxis[column]!, south = northAxis[row]!;
          const width = eastAxis[column + 1]! - west, depth = northAxis[row + 1]! - south;
          for (const [u, v] of canonicalCellFractions) {
            const east = west + width * u, north = south + depth * v;
            const visible = visibleTriangleHeight(mesh.geometry, eastAxis, northAxis, east, north);
            const support = collision.surfaceAt(east, north);
            assert.ok(Number.isFinite(visible) && support !== undefined, `${east},${north} must have both surfaces`);
            maxDifference = Math.max(maxDifference, Math.abs(visible - support!));
            sampleCount++;
          }
        }
      }
    }

    const requiredProbes = [
      { name: 'gate', east: 0, north: 0 },
      { name: 'summit-platform', east: 50, north: 1_000 },
      ...townD2R30Anchors.shoulders.map((shoulder, index) => ({ name: `shoulder-${index + 1}`, ...shoulder })),
      ...townD2R30Anchors.valleys.map(valley => ({ name: valley.id, east: valley.east, north: valley.north })),
      { name: 'west-edge', east: -1_100, north: 900 },
      { name: 'east-edge', east: 1_100, north: 900 },
      { name: 'south-edge', east: 900, north: -10 },
      { name: 'north-edge', east: 900, north: 1_790 },
    ];
    const probeDifferences = new Map<string, number>();
    for (const probe of requiredProbes) {
      const chunk = townD2R30ChunkList.find(candidate =>
        probe.east >= candidate.west && probe.east <= candidate.east &&
        probe.north >= candidate.south && probe.north <= candidate.north)!;
      const mesh = topMeshes.find(child => child.name === `town-d2-r30-top-${chunk.key}`) as Mesh;
      const visible = visibleTriangleHeight(
        mesh.geometry,
        townD2R30GridAxis(chunk.west, chunk.east, 8),
        townD2R30GridAxis(chunk.south, chunk.north, 8),
        probe.east, probe.north,
      );
      const support = collision.surfaceAt(probe.east, probe.north);
      assert.ok(support !== undefined, `${probe.name} must have collision support`);
      probeDifferences.set(probe.name, Math.abs(visible - support!));
    }
    assert.equal(probeDifferences.size, requiredProbes.length);
    assert.ok(maxDifference <= 1e-6, `maximum visible/collision difference ${maxDifference} m`);
    console.log(
      `D2-R30 canonical8 maxDifference=${maxDifference.toFixed(12)}m samples=${sampleCount} ` +
      `massifTriangles=${massif.stats().triangles} collisionTriangles=${collision.stats().triangleCount}`,
    );
  } finally {
    collision.dispose();
    massif.dispose();
  }
});

function materialIsShared(mesh: Mesh, group: Group) {
  const first = group.children[0] as Mesh;
  return mesh.material === first.material;
}

test('D2-R30 night tint and resource release are safe and idempotent', () => {
  const massif = createTownD2R30Massif({ spacing: 32, arrivalHeight: 349 });
  assert.equal(massif.heightAt(0, 0), 349);
  const material = (massif.group.children[0] as Mesh).material as MeshLambertMaterial;
  const day = material.color.clone();
  massif.setNight(1);
  assert.notDeepEqual(material.color, day);
  massif.setNight(2);
  assert.deepEqual(material.color, day.clone().lerp(new Color('#738aa8'), 1));
  const geometries = new Set<BufferGeometry>();
  const disposeCalls = new Map<BufferGeometry, number>();
  massif.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const geometry = object.geometry;
    disposeCalls.set(geometry, 0);
    const dispose = geometry.dispose.bind(geometry);
    geometry.dispose = () => { disposeCalls.set(geometry, disposeCalls.get(geometry)! + 1); dispose(); };
  });
  let materialCalls = 0;
  const disposeMaterial = material.dispose.bind(material);
  material.dispose = () => { materialCalls++; disposeMaterial(); };
  massif.dispose();
  massif.dispose();
  assert.equal(massif.group.children.length, 0);
  assert.equal(materialCalls, 1, 'the single shared material must be disposed exactly once');
  for (const [geometry, calls] of disposeCalls) assert.equal(calls, 1, `${geometry.name} disposal count`);
});
