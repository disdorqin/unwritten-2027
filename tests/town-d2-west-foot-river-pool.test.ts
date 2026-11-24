import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import { buildSwitchbackCenterline } from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import { sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import { createTerrainGrid, riverX, waterHeight } from '../tools/voxel-tavern/town-blockout/terrain';
import {
  createTownD2WestFootRiverPool, surveyTownD2WestFootRiverPool,
} from '../tools/voxel-tavern/town-blockout/town-d2-west-foot-river-pool';

function distanceToRoad(line: ReturnType<typeof buildSwitchbackCenterline>, east: number, north: number) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    const dx = b.east - a.east, dn = b.north - a.north;
    const lengthSquared = dx * dx + dn * dn || 1;
    const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared));
    best = Math.min(best, Math.hypot(east - a.east - t * dx, north - a.north - t * dn));
  }
  return best;
}

test('AW-3 survey pins the pool to the river at/south of the measured west foothill', () => {
  const { site, clearance } = surveyTownD2WestFootRiverPool();
  const grid = createTerrainGrid();
  for (const value of Object.values(site)) assert.ok(Number.isFinite(value), 'site values must be finite');
  for (const value of Object.values(clearance)) assert.ok(Number.isFinite(value), 'clearance values must be finite');
  assert.ok(Math.abs(site.east - riverX(site.north)) < 1e-9, 'pool centre must lie on the existing river line');
  assert.ok(Math.abs(site.riverOffset) < 1e-9);
  assert.ok(site.north <= site.foothillNorth + 1e-9, 'pool must not lie north of the ridge foothill');
  assert.ok(site.distanceSouthOfFoothill >= 0 && site.distanceSouthOfFoothill <= 4);
  assert.equal(site.waterLevel, waterHeight);
  assert.equal(site.waterLevel, 5);
  assert.ok(site.groundHeight < site.waterLevel, 'the measured river slot must be below the existing water datum');
  assert.ok(Math.abs(site.ridgeHeight - 18) < 1e-6, 'the selected point is at the measured southern profile floor');
  assert.ok(site.radius >= 12 && site.radius <= 18);
});

test('AW-3 pool and inlet clear the real switchback half-width plus feather', () => {
  const { site, clearance } = surveyTownD2WestFootRiverPool();
  const grid = createTerrainGrid();
  const road = buildSwitchbackCenterline(sampleNorthRidge350, grid.heightAt);
  const measuredRoadDistance = distanceToRoad(road, site.east, site.north);
  assert.ok(Math.abs(measuredRoadDistance - clearance.roadDistance) < 1e-9);
  assert.equal(clearance.requiredClearance, 1.75 + 3.4);
  assert.ok(Math.abs(clearance.poolClearance - (measuredRoadDistance - site.radius)) < 1e-9);
  assert.ok(clearance.poolClearance > clearance.requiredClearance,
    `pool clearance ${clearance.poolClearance.toFixed(3)} m must exceed ${clearance.requiredClearance} m`);
  assert.ok(clearance.bankClearance > clearance.requiredClearance);
  assert.ok(clearance.inletClearance > clearance.requiredClearance);
  assert.equal(clearance.minimumDetailClearance, Math.min(clearance.bankClearance, clearance.inletClearance));
});

test('AW-3 geometry has water, stone and timber families, finite attributes and no road intrusion', () => {
  const { site, clearance } = surveyTownD2WestFootRiverPool();
  const pool = createTownD2WestFootRiverPool();
  const grid = createTerrainGrid();
  const road = buildSwitchbackCenterline(sampleNorthRidge350, grid.heightAt);
  assert.deepEqual(pool.site, site);
  assert.equal(pool.waterLevel, waterHeight);
  assert.equal(pool.group.userData.includesWorldCollision, false);
  assert.equal(pool.group.userData.waterLevelAuthority, 'terrain.waterHeight');
  const names = new Set(pool.group.children.map(child => child.name));
  for (const name of ['pool-water', 'pool-stone-bank-light', 'pool-stone-bank-dark',
    'pool-timber-weir-and-driftwood', 'pool-inlet-water', 'pool-outflow-water', 'pool-shore-reeds']) {
    assert.ok(names.has(name), `missing ${name}`);
  }
  const materialColors = new Set<string>();
  let waterMeshes = 0;
  pool.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry as BufferGeometry;
    for (const attribute of Object.values(geometry.attributes)) {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${object.name} has a non-finite attribute`);
    }
    const index = geometry.getIndex();
    if (index) for (const value of index.array) assert.ok(Number.isInteger(value) && value >= 0);
    const material = Array.isArray(object.material) ? object.material[0]! : object.material;
    if ('color' in material) materialColors.add((material as Material & { color: { getHexString(): string } }).color.getHexString());
    if (object.name === 'pool-water' || object.name === 'pool-inlet-water' || object.name === 'pool-outflow-water') {
      waterMeshes++;
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        assert.ok(Math.abs(position.getY(i) - waterHeight) < .05, `${object.name} changed the water datum`);
        assert.ok(distanceToRoad(road, position.getX(i), -position.getZ(i)) > clearance.requiredClearance,
          `${object.name} enters the road corridor`);
      }
    }
  });
  assert.equal(waterMeshes, 3);
  assert.ok(materialColors.size >= 3, 'stone, timber and water must be distinct material families');
  pool.dispose();
});

test('AW-3 dispose is idempotent and releases every owned geometry/material once', () => {
  const host = new Group();
  const pool = createTownD2WestFootRiverPool();
  host.add(pool.group);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  let geometryDisposals = 0, materialDisposals = 0;
  pool.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => { geometryDisposals++; }));
  materials.forEach(material => material.addEventListener('dispose', () => { materialDisposals++; }));
  pool.dispose();
  assert.equal(pool.group.parent, null);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  pool.dispose();
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
});
