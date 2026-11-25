import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, Matrix4, Vector3, type BufferGeometry, type Material } from 'three';
import { buildEntryApproach, buildSwitchbackCenterline } from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import { northRidgeCableAnchors, sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import {
  createTownD2FrontRidgeMicroRelief, TOWN_D2_MICRO_RELIEF,
  type TownD2MicroReliefKind,
} from '../tools/voxel-tavern/town-blockout/town-d2-front-ridge-micro-relief';
import { createTownD2FrontRidgeRestStops } from '../tools/voxel-tavern/town-blockout/town-d2-front-ridge-rest-stops';
import { surveyTownD2WestFootRiverPool } from '../tools/voxel-tavern/town-blockout/town-d2-west-foot-river-pool';

function segmentDistance(east: number, north: number,
  a: { east: number; north: number }, b: { east: number; north: number }) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / (dx * dx + dn * dn || 1)));
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function lineDistance(line: readonly { east: number; north: number }[], east: number, north: number) {
  let result = Infinity;
  for (let i = 1; i < line.length; i++) {
    result = Math.min(result, segmentDistance(east, north, line[i - 1]!, line[i]!));
  }
  return result;
}

function roadLines() {
  const road = buildSwitchbackCenterline();
  const junction = road.find(point => point.east === 270 && point.north === 460)!;
  return [...road, ...buildEntryApproach(junction.height)];
}

function rectangleDistance(east: number, north: number, site: {
  east: number; north: number; halfWidth: number; halfDepth: number; yaw: number;
}) {
  const dx = east - site.east, dn = north - site.north;
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  return Math.hypot(Math.max(0, Math.abs(c * dx - s * dn) - site.halfWidth),
    Math.max(0, Math.abs(s * dx + c * dn) - site.halfDepth));
}

function restProtectedSites() {
  const stops = createTownD2FrontRidgeRestStops();
  try {
    return stops.placements.map(placement => {
      const foundation = stops.group.getObjectByName(placement.id)?.userData.foundation as
        | { halfWidth?: number; halfDepth?: number; radius?: number } | undefined;
      if (foundation?.halfWidth !== undefined && foundation.halfDepth !== undefined) {
        return { east: placement.east, north: placement.north, yaw: placement.yaw,
          halfWidth: foundation.halfWidth + 1, halfDepth: foundation.halfDepth + 1 };
      }
      return { east: placement.east, north: placement.north,
        radius: (foundation?.radius ?? (placement.kind === 'bench' ? 1.25 :
          placement.kind === 'warning' ? 1.55 : .55)) + 1 };
    });
  } finally { stops.dispose(); }
}

function restDistance(east: number, north: number,
  sites: ReturnType<typeof restProtectedSites>) {
  return Math.min(...sites.map(site => site.radius !== undefined ?
    Math.hypot(east - site.east, north - site.north) - site.radius :
    rectangleDistance(east, north, site)));
}

const ALL_KINDS: readonly TownD2MicroReliefKind[] = ['gully', 'scree', 'snow-ridge', 'shrub', 'gravel'];

test('D2 micro-relief: deterministic unsigned seed produces the same complete cluster ledger', () => {
  const first = createTownD2FrontRidgeMicroRelief();
  const second = createTownD2FrontRidgeMicroRelief();
  try {
    assert.deepEqual(first.placements, second.placements);
    assert.deepEqual(first.stats, second.stats);
    assert.equal(first.stats.seed, TOWN_D2_MICRO_RELIEF.defaultSeed);
    assert.ok(first.placements.length >= 100, `expected dense relief, got ${first.placements.length}`);
    for (const kind of ALL_KINDS) assert.ok(first.stats.byKind[kind] >= 10, `${kind} must form real clusters`);
    assert.equal(first.stats.placementCount, first.placements.length);
    assert.equal(first.stats.instanceCount, first.placements.length);
    assert.throws(() => createTownD2FrontRidgeMicroRelief({ seed: -1 }), RangeError);
    assert.throws(() => createTownD2FrontRidgeMicroRelief({ seed: 1.5 }), RangeError);
    const other = createTownD2FrontRidgeMicroRelief({ seed: 12345 });
    try { assert.notDeepEqual(other.placements, first.placements); }
    finally { other.dispose(); }
  } finally {
    first.dispose();
    second.dispose();
  }
});

test('D2 micro-relief: H60–220 placement range, world convention and sampled ground contact', () => {
  const relief = createTownD2FrontRidgeMicroRelief();
  try {
    for (const placement of relief.placements) {
      for (const value of [placement.east, placement.north, placement.height,
        placement.clearance, placement.footprintRadius, placement.yaw,
        placement.scale.x, placement.scale.y, placement.scale.z]) {
        assert.ok(Number.isFinite(value), placement.id);
      }
      assert.ok(placement.east >= 0 && placement.east <= 640, placement.id);
      assert.ok(placement.north >= 0 && placement.north <= 800, placement.id);
      assert.ok(placement.height >= 60 && placement.height <= 220, placement.id);
      assert.ok(Math.abs(placement.height - (sampleNorthRidge350(placement.east, placement.north) - .1)) < 1e-9,
        `${placement.id} must use sampleNorthRidge350`);
      assert.ok(placement.footprintRadius > 0 && placement.clearance > 0, placement.id);
    }
    assert.ok(relief.stats.minHeight >= 60 && relief.stats.maxHeight <= 220);
    assert.equal(relief.group.userData.positionConvention, 'x=east,y=height,z=-north');
    assert.equal(relief.group.userData.includesWorldCollision, false);
    assert.equal(relief.group.userData.terrainAuthority, 'sampleNorthRidge350');
  } finally { relief.dispose(); }
});

test('D2 micro-relief: actual instanced footprints clear road, cable, stations, pool and every rest stop', () => {
  const relief = createTownD2FrontRidgeMicroRelief();
  const road = roadLines();
  const cable = northRidgeCableAnchors.map(([east, north]) => ({ east, north }));
  const pool = surveyTownD2WestFootRiverPool().site;
  const rests = restProtectedSites();
  const stationRects = [
    { east: 440, north: 520, halfWidth: 19, halfDepth: 16, yaw: 0 },
    { east: 336, north: 640, halfWidth: 36, halfDepth: 36, yaw: 0 },
    { east: 526, north: 329, halfWidth: 18, halfDepth: 16, yaw: 0 },
  ];
  let minimumRoad = Infinity, minimumCable = Infinity, minimumRest = Infinity;
  try {
    for (const kind of ALL_KINDS) {
      const mesh = relief.group.getObjectByName(`town-d2-micro-relief-${kind}`);
      assert.ok(mesh instanceof InstancedMesh, `${kind} must be instanced`);
      const list = relief.placements.filter(placement => placement.kind === kind);
      assert.equal(mesh.count, list.length);
      const position = mesh.geometry.getAttribute('position');
      const matrix = new Matrix4();
      const vertex = new Vector3();
      list.forEach((placement, index) => {
        mesh.getMatrixAt(index, matrix);
        let measuredRadius = 0;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
          measuredRadius = Math.max(measuredRadius, Math.hypot(vertex.x - placement.east, -vertex.z - placement.north));
        }
        assert.ok(measuredRadius <= placement.footprintRadius + 1e-4,
          `${placement.id} actual radius ${measuredRadius} exceeds declared ${placement.footprintRadius}`);
        const roadGap = lineDistance(road, placement.east, placement.north) - measuredRadius;
        const cableGap = lineDistance(cable, placement.east, placement.north) - measuredRadius;
        const restGap = restDistance(placement.east, placement.north, rests) - measuredRadius;
        minimumRoad = Math.min(minimumRoad, roadGap);
        minimumCable = Math.min(minimumCable, cableGap);
        minimumRest = Math.min(minimumRest, restGap);
        assert.ok(roadGap >= 15 - 1e-7, `${placement.id} road gap ${roadGap}`);
        assert.ok(cableGap >= 20 - 1e-7, `${placement.id} cable gap ${cableGap}`);
        assert.ok(restGap >= -1e-7, `${placement.id} rest gap ${restGap}`);
        assert.ok(Math.hypot(placement.east - pool.east, placement.north - pool.north) - measuredRadius >= pool.radius + 2,
          `${placement.id} enters D2 pool reserve`);
        for (const station of stationRects) {
          assert.ok(rectangleDistance(placement.east, placement.north, station) - measuredRadius >= -1e-7,
            `${placement.id} enters station platform`);
        }
      });
    }
    assert.ok(minimumRoad >= 15 && minimumCable >= 20 && minimumRest >= 0);
  } finally { relief.dispose(); }
});

test('D2 micro-relief: every cluster has at least three real material families and faceted non-box geometry', () => {
  const relief = createTownD2FrontRidgeMicroRelief();
  try {
    const allFamilies = new Set<string>();
    for (const placement of relief.placements) {
      assert.ok(new Set(placement.materialFamilies).size >= 3, placement.id);
      placement.materialFamilies.forEach(family => allFamilies.add(family));
    }
    assert.ok(allFamilies.size >= 12, 'stone, snow, wood, leaf, berry, moss and grit must remain distinct');
    for (const kind of ALL_KINDS) {
      const mesh = relief.group.getObjectByName(`town-d2-micro-relief-${kind}`);
      assert.ok(mesh instanceof InstancedMesh);
      assert.deepEqual(mesh.userData.materialFamilies,
        relief.placements.find(placement => placement.kind === kind)!.materialFamilies);
      const colors = new Set<string>();
      const color = mesh.geometry.getAttribute('color');
      const position = mesh.geometry.getAttribute('position');
      assert.ok(color && position.count > 100, `${kind} needs authored multi-part geometry`);
      for (let i = 0; i < color.count; i++) {
        colors.add(`${color.getX(i).toFixed(4)},${color.getY(i).toFixed(4)},${color.getZ(i).toFixed(4)}`);
      }
      assert.ok(colors.size >= 3, `${kind} must contain at least three visible material colours`);
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox!.getSize(new Vector3());
      assert.ok(size.x > .2 && size.y > .2 && size.z > .2);
      assert.ok((mesh.geometry.index?.count ?? position.count) % 3 === 0);
    }
  } finally { relief.dispose(); }
});

test('D2 micro-relief: at most 12 draws, finite attributes/transforms and idempotent resource disposal', () => {
  const parent = new Group();
  const relief = createTownD2FrontRidgeMicroRelief();
  parent.add(relief.group);
  try {
    let meshes = 0;
    const resources = new Set<BufferGeometry | Material>();
    relief.group.updateMatrixWorld(true);
    relief.group.traverse(object => {
      assert.ok([...object.matrixWorld.elements].every(Number.isFinite), object.name);
      if (!(object instanceof InstancedMesh)) return;
      meshes++;
      resources.add(object.geometry);
      resources.add(object.material as Material);
      for (const attribute of Object.values(object.geometry.attributes) as { array: ArrayLike<number> }[]) {
        for (const value of Array.from(attribute.array)) assert.ok(Number.isFinite(value), `${object.name} attribute`);
      }
      for (const value of object.instanceMatrix.array) assert.ok(Number.isFinite(value), `${object.name} instance`);
    });
    assert.equal(meshes, relief.stats.meshCount);
    assert.equal(meshes, relief.stats.drawCalls);
    assert.ok(meshes <= 12, `draw target exceeded: ${meshes}`);
    assert.equal(relief.group.children.length, meshes, 'no unbatched per-cluster draw objects');
    assert.ok(Number.isInteger(relief.stats.triangles) && relief.stats.triangles > 1000);
    let disposed = 0;
    for (const resource of resources) resource.addEventListener('dispose', () => { disposed++; });
    relief.dispose();
    relief.dispose();
    assert.equal(disposed, resources.size, 'each geometry/material must be disposed exactly once');
    assert.equal(parent.children.length, 0);
    assert.equal(relief.group.children.length, 0);
    assert.equal(relief.group.userData.disposed, true);
  } finally { relief.dispose(); }
});
