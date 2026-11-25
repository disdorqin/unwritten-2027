import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Texture, Vector3, type BufferGeometry, type Material } from 'three';
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

function namedMesh(group: Group, name: string) {
  const object = group.children.find(child => child.name === name);
  assert.ok(object instanceof Mesh, `missing ${name}`);
  return object;
}

function localPosition(site: ReturnType<typeof surveyTownD2WestFootRiverPool>['site'], across: number, along: number) {
  const tangent = new Vector3(riverX(site.north + .25) - riverX(site.north - .25), 0, -.5).normalize();
  const right = new Vector3().crossVectors(tangent, new Vector3(0, 1, 0)).normalize();
  return new Vector3(site.east, 0, -site.north).addScaledVector(right, across).addScaledVector(tangent, along);
}

function nearestGeometryComponent(group: Group, centre: Vector3, meshNames: ReadonlySet<string>) {
  const triangles: { vertices: Vector3[]; keys: string[] }[] = [];
  group.traverse(object => {
    if (!(object instanceof Mesh) || !meshNames.has(object.name)) return;
    const position = object.geometry.getAttribute('position');
    const index = object.geometry.getIndex();
    for (let i = 0; i < position.count; i += 3) {
      const vertices: Vector3[] = [];
      for (let corner = 0; corner < 3; corner++) {
        vertices.push(new Vector3().fromBufferAttribute(position, index ? index.getX(i + corner) : i + corner));
      }
      const keys = vertices.map(vertex => `${vertex.x.toFixed(5)},${vertex.y.toFixed(5)},${vertex.z.toFixed(5)}`);
      triangles.push({ vertices, keys });
    }
  });
  const trianglesByKey = new Map<string, number[]>();
  triangles.forEach((triangle, triangleIndex) => {
    for (const key of triangle.keys) {
      const matches = trianglesByKey.get(key) ?? [];
      matches.push(triangleIndex);
      trianglesByKey.set(key, matches);
    }
  });
  const visited = new Set<number>();
  let nearest: Vector3[] | undefined, nearestDistance = Infinity;
  for (let start = 0; start < triangles.length; start++) {
    if (visited.has(start)) continue;
    const pending = [start], component: Vector3[] = [];
    visited.add(start);
    while (pending.length) {
      const triangleIndex = pending.pop()!;
      const triangle = triangles[triangleIndex]!;
      component.push(...triangle.vertices);
      for (const key of triangle.keys) {
        for (const match of trianglesByKey.get(key) ?? []) {
          if (visited.has(match)) continue;
          visited.add(match);
          pending.push(match);
        }
      }
    }
    const minimumX = Math.min(...component.map(vertex => vertex.x));
    const maximumX = Math.max(...component.map(vertex => vertex.x));
    const minimumZ = Math.min(...component.map(vertex => vertex.z));
    const maximumZ = Math.max(...component.map(vertex => vertex.z));
    const distance = Math.hypot((minimumX + maximumX) / 2 - centre.x, (minimumZ + maximumZ) / 2 - centre.z);
    if (distance < nearestDistance) {
      nearest = component;
      nearestDistance = distance;
    }
  }
  assert.ok(nearest, 'support geometry component was not found');
  return nearest;
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
  assert.ok(Math.abs(site.east - 284.171429) < 1e-6);
  assert.equal(site.north, 271.5);
  assert.equal(site.radius, 18);
  assert.ok(Math.abs(site.foothillNorth - 272.319338) < 1e-5, 'the measured ridge foothill must stay fixed');
  assert.ok(site.groundHeight < site.waterLevel, 'the measured river slot must be below the existing water datum');
  assert.ok(Math.abs(site.ridgeHeight - 18) < 1e-6, 'the selected point is at the measured southern profile floor');
});

test('AW-3 pool and inlet clear the real switchback half-width plus feather', () => {
  const { site, clearance } = surveyTownD2WestFootRiverPool();
  const grid = createTerrainGrid();
  const road = buildSwitchbackCenterline(sampleNorthRidge350, grid.heightAt);
  const measuredRoadDistance = distanceToRoad(road, site.east, site.north);
  assert.ok(Math.abs(measuredRoadDistance - clearance.roadDistance) < 1e-9);
  assert.equal(clearance.requiredClearance, 1.75 + 3.4);
  assert.ok(Math.abs(measuredRoadDistance - 28.5) < 1e-9, 'the measured road distance must stay fixed');
  assert.ok(Math.abs(clearance.poolClearance - (measuredRoadDistance - site.radius)) < 1e-9);
  assert.equal(clearance.poolClearance, 10.5);
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
  for (const name of ['pool-water', 'pool-stone-bank',
    'pool-timber-weir-and-driftwood', 'pool-inlet-water', 'pool-outflow-water', 'pool-shore-reeds']) {
    assert.ok(names.has(name), `missing ${name}`);
  }
  const materialColors = new Set<string>();
  let waterMeshes = 0, minimumGeometryRoadDistance = Infinity;
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
      }
    }
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const distance = distanceToRoad(road, position.getX(i), -position.getZ(i));
      minimumGeometryRoadDistance = Math.min(minimumGeometryRoadDistance, distance);
      assert.ok(distance > 5.15, `${object.name} vertex enters the 5.15 m road clearance`);
    }
  });
  assert.equal(waterMeshes, 3);
  assert.ok(minimumGeometryRoadDistance > clearance.requiredClearance);
  assert.ok(materialColors.size >= 3, 'stone, timber and water must be distinct material families');
  pool.dispose();
});

test('AW-3 beauty stays within eight draws and bakes water depth, ripples and material grain', () => {
  const pool = createTownD2WestFootRiverPool();
  assert.equal(pool.group.children.length, 8, 'the complete pool must fit the eight-draw budget');
  assert.ok(pool.group.children.every(child => child instanceof Mesh), 'each budgeted draw must be one merged mesh');
  const waterNames = ['pool-water', 'pool-inlet-water', 'pool-outflow-water'];
  const waterTextures = new Set<Texture>();
  for (const name of waterNames) {
    const mesh = namedMesh(pool.group, name);
    const material = mesh.material as MeshBasicMaterial;
    assert.ok(material instanceof MeshBasicMaterial);
    assert.ok(material.map, `${name} must carry the procedural water material`);
    assert.equal(material.vertexColors, true);
    assert.equal(material.transparent, true);
    assert.equal(material.depthWrite, false);
    assert.equal(material.side, DoubleSide);
    assert.ok(material.opacity > .7 && material.opacity < .95);
    assert.ok(mesh.geometry.getAttribute('uv'), `${name} must sample its water texture`);
    waterTextures.add(material.map);
  }
  assert.equal(waterTextures.size, 2, 'pool and creek need distinct depth/flow layers');
  const poolTexture = (namedMesh(pool.group, 'pool-water').material as MeshBasicMaterial).map!;
  const image = poolTexture.image as { width: number; height: number; data: Uint8Array };
  assert.equal(image.width, 128);
  assert.equal(image.height, 128);
  const luminance = (x: number, y: number) => {
    const offset = (y * image.width + x) * 4;
    return (image.data[offset]! + image.data[offset + 1]! + image.data[offset + 2]!) / 3;
  };
  assert.ok(luminance(8, 64) > luminance(64, 64) + 25, 'the shallow rim must read lighter than the deep centre');
  assert.ok(new Set(image.data).size > 100, 'the water texture must retain ripple and colour detail');
  for (const name of ['pool-stone-bank', 'pool-timber-weir-and-driftwood']) {
    const mesh = namedMesh(pool.group, name);
    const material = mesh.material as Material & { vertexColors: boolean };
    assert.equal(material.vertexColors, true, `${name} must use baked colour steps/grain`);
    const color = mesh.geometry.getAttribute('color');
    assert.ok(color, `${name} must carry per-vertex colour`);
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 0; i < color.count; i++) {
      minimum = Math.min(minimum, color.getX(i));
      maximum = Math.max(maximum, color.getX(i));
    }
    assert.ok(maximum - minimum > .15, `${name} must have visible tonal variation`);
  }
  pool.dispose();
});

test('AW-3 shallow shelf top lies between the old and new water surfaces', () => {
  const pool = createTownD2WestFootRiverPool();
  const position = namedMesh(pool.group, 'pool-shallow-shelf').geometry.getAttribute('position');
  let minimumY = Infinity, maximumY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    minimumY = Math.min(minimumY, position.getY(i));
    maximumY = Math.max(maximumY, position.getY(i));
  }
  assert.ok(Math.abs(minimumY - maximumY) < 1e-6, 'the shelf must remain a zero-thickness surface');
  assert.ok(minimumY > waterHeight, 'the shelf must be visible above the old Y=5 water');
  assert.ok(maximumY < waterHeight + .025, 'the shelf must not pierce the new transparent water');
  assert.ok(Math.abs(minimumY - (waterHeight + .012)) < 1e-6);
  pool.dispose();
});

test('AW-3 inlet and outlet stones meet the river bed while driftwood floats inside the pool', () => {
  const { site } = surveyTownD2WestFootRiverPool();
  const pool = createTownD2WestFootRiverPool();
  const grid = createTerrainGrid();
  const cases: { label: string; across: number; along: number; halfHeight: number;
    waterOffset: number; meshNames: ReadonlySet<string> }[] = [];
  const stoneMeshes = new Set(['pool-stone-bank']);
  const timberMeshes = new Set(['pool-timber-weir-and-driftwood']);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) cases.push({
      label: `inlet ${side}/${i}`, across: side * (2.65 + .08 * i), along: site.radius * .78 + i * .57,
      halfHeight: .36, waterOffset: .18, meshNames: stoneMeshes,
    });
    for (let i = 0; i < 3; i++) cases.push({
      label: `outlet ${side}/${i}`, across: side * 2.45, along: -site.radius - i * 1.15,
      halfHeight: .28, waterOffset: .1, meshNames: stoneMeshes,
    });
    cases.push({
      label: `entrance ${side}`, across: side * 1.48, along: site.radius + 1.02,
      halfHeight: .29, waterOffset: .12, meshNames: stoneMeshes,
    });
  }
  for (const item of cases) {
    const centre = localPosition(site, item.across, item.along);
    const vertices = nearestGeometryComponent(pool.group, centre, item.meshNames);
    assert.ok(vertices.length >= 8, `${item.label} geometry was not found`);
    const minimumY = Math.min(...vertices.map(vertex => vertex.y));
    const maximumY = Math.max(...vertices.map(vertex => vertex.y));
    const ground = grid.groundHeightAt(centre.x, -centre.z);
    const expectedBase = ground;
    const expectedTop = Math.max(site.waterLevel + item.waterOffset + item.halfHeight * 2,
      ground + item.halfHeight * 2);
    assert.ok(Math.abs(minimumY - expectedBase) < 1e-5,
      `${item.label} bottom ${minimumY.toFixed(6)} must meet the river bed ${expectedBase.toFixed(6)}`);
    assert.ok(Math.abs((minimumY + maximumY) / 2 - (expectedBase + expectedTop) / 2) < 1e-5,
      `${item.label} centre must span bed to top`);
    assert.ok(Math.abs(maximumY - expectedTop) < 1e-5, `${item.label} top must stay fixed`);
  }
  const driftCentre = localPosition(site, -4.1, -site.radius * .55);
  const drift = nearestGeometryComponent(pool.group, driftCentre, timberMeshes);
  const driftMinimumY = Math.min(...drift.map(vertex => vertex.y));
  const driftMaximumY = Math.max(...drift.map(vertex => vertex.y));
  assert.ok(Math.abs(driftMinimumY - site.waterLevel) < 1e-5, 'driftwood must float at the water surface');
  assert.ok(Math.abs(driftMaximumY - (site.waterLevel + .22)) < 1e-5);
  assert.ok(Math.hypot(driftCentre.x - site.east, -driftCentre.z - site.north) < site.radius,
    'driftwood must stay inside the pool footprint');
  pool.dispose();
});

test('AW-3 bank blocks, shore rocks, reeds, basin and inlet posts all meet measured support', () => {
  const { site } = surveyTownD2WestFootRiverPool();
  const pool = createTownD2WestFootRiverPool();
  const grid = createTerrainGrid();
  const stoneMeshes = new Set(['pool-stone-bank']);
  const inGap = (across: number, along: number) =>
    (along > site.radius * .7 && Math.abs(across) < 3.7) ||
    (along < -site.radius * .7 && Math.abs(across) < 3.1);
  for (let i = 0; i < 56; i++) {
    const angle = i / 56 * Math.PI * 2 + .018 * Math.sin(i * 1.7);
    const across = Math.cos(angle) * (site.radius + .48), along = Math.sin(angle) * (site.radius + .48);
    if (inGap(across, along)) continue;
    const centre = localPosition(site, across, along);
    const vertices = nearestGeometryComponent(pool.group, centre, stoneMeshes);
    const minimumY = Math.min(...vertices.map(vertex => vertex.y));
    const maximumY = Math.max(...vertices.map(vertex => vertex.y));
    const yaw = -angle + Math.PI / 2;
    const width = 1.24 + .14 * Math.sin(i * 1.9), depth = 1.02;
    const cosine = Math.cos(yaw), sine = Math.sin(yaw);
    const corners = [-width / 2, width / 2].flatMap(localX => [-depth / 2, depth / 2].map(localZ => {
      const east = centre.x + cosine * localX + sine * localZ;
      const north = -centre.z + sine * localX - cosine * localZ;
      return grid.groundHeightAt(east, north);
    }));
    const ground = Math.min(...corners), highestGround = Math.max(...corners);
    assert.ok(Math.abs(minimumY - ground) < 1e-5, `bank ${i} must start at its lowest rotated corner`);
    assert.ok(Math.abs(maximumY - Math.max(site.waterLevel + .42, highestGround + .32)) < 1e-5,
      `bank ${i} must crest above its highest rotated corner`);
  }
  for (let i = 0; i < 30; i++) {
    const angle = i / 30 * Math.PI * 2 + .11 * Math.sin(i * 4.1);
    const radial = site.radius + 2.1 + .22 * Math.sin(i * 2.3);
    const across = Math.cos(angle) * radial, along = Math.sin(angle) * radial;
    if (inGap(across, along)) continue;
    const centre = localPosition(site, across, along);
    const vertices = nearestGeometryComponent(pool.group, centre, stoneMeshes);
    const minimumY = Math.min(...vertices.map(vertex => vertex.y));
    const maximumY = Math.max(...vertices.map(vertex => vertex.y));
    const ground = grid.groundHeightAt(centre.x, -centre.z);
    assert.ok(Math.abs(minimumY - ground) < 1e-5, `shore rock ${i} must meet the bank ground`);
    assert.ok(maximumY > site.waterLevel + .11, `shore rock ${i} must break the water surface`);
  }
  const reedMeshes = new Set(['pool-shore-reeds']);
  for (let i = 0; i < 18; i++) {
    const angle = i / 18 * Math.PI * 2 + .17;
    const across = Math.cos(angle) * (site.radius - .55), along = Math.sin(angle) * (site.radius - .55);
    if (inGap(across, along) || i % 4 === 0) continue;
    for (let stem = 0; stem < 3; stem++) {
      const centre = localPosition(site, across + (stem - 1) * .13, along + .08 * Math.sin(stem * 2));
      const vertices = nearestGeometryComponent(pool.group, centre, reedMeshes);
      const minimumY = Math.min(...vertices.map(vertex => vertex.y));
      const maximumY = Math.max(...vertices.map(vertex => vertex.y));
      const ground = grid.groundHeightAt(centre.x, -centre.z);
      assert.ok(Math.abs(minimumY - ground) < 1e-5, `reed ${i}/${stem} must be rooted`);
      assert.ok(Math.abs(maximumY - minimumY - (.72 + .22 * Math.sin(i * 3.1 + stem))) < 1e-5);
    }
  }
  const timberMeshes = new Set(['pool-timber-weir-and-driftwood']);
  for (const side of [-1, 1]) {
    const centre = localPosition(site, side * 2.75, site.radius + 1.8);
    const vertices = nearestGeometryComponent(pool.group, centre, timberMeshes);
    const minimumY = Math.min(...vertices.map(vertex => vertex.y));
    const maximumY = Math.max(...vertices.map(vertex => vertex.y));
    assert.ok(Math.abs(minimumY - grid.groundHeightAt(centre.x, -centre.z)) < 1e-5,
      'inlet post must stand on the bed');
    assert.ok(Math.abs(maximumY - (site.waterLevel + 1.32)) < 1e-5,
      'inlet post must meet, not penetrate, the timber beam');
  }
  const bed = namedMesh(pool.group, 'pool-basin-bed').geometry.getAttribute('position');
  let bedMinimumY = Infinity;
  for (let i = 0; i < bed.count; i++) bedMinimumY = Math.min(bedMinimumY, bed.getY(i));
  assert.ok(Math.abs(bedMinimumY - site.groundHeight) < 1e-5, 'basin bed must meet the measured centre bed');
  pool.dispose();
});

test('AW-3 support footprints remain separated at banks, rocks, reeds and channel stones', () => {
  const { site } = surveyTownD2WestFootRiverPool();
  const inGap = (across: number, along: number) =>
    (along > site.radius * .7 && Math.abs(across) < 3.7) ||
    (along < -site.radius * .7 && Math.abs(across) < 3.1);
  const banks: { x: number; y: number; tx: number; ty: number; rx: number; ry: number; halfWidth: number }[] = [];
  for (let i = 0; i < 56; i++) {
    const angle = i / 56 * Math.PI * 2 + .018 * Math.sin(i * 1.7);
    const across = Math.cos(angle) * (site.radius + .48), along = Math.sin(angle) * (site.radius + .48);
    if (!inGap(across, along)) banks.push({
      x: across, y: along, tx: Math.sin(angle), ty: Math.cos(angle), rx: Math.cos(angle), ry: -Math.sin(angle),
      halfWidth: (1.24 + .14 * Math.sin(i * 1.9)) / 2,
    });
  }
  for (let i = 0; i < banks.length; i++) for (let j = i + 1; j < banks.length; j++) {
    const a = banks[i]!, b = banks[j]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const separated = [[a.tx, a.ty], [a.rx, a.ry], [b.tx, b.ty], [b.rx, b.ry]].some(([x, y]) =>
      Math.abs(dx * x! + dy * y!) >
      a.halfWidth * Math.abs(a.tx * x! + a.ty * y!) + .51 * Math.abs(a.rx * x! + a.ry * y!) +
      b.halfWidth * Math.abs(b.tx * x! + b.ty * y!) + .51 * Math.abs(b.rx * x! + b.ry * y!) + 1e-6);
    assert.ok(separated, `bank blocks ${i}/${j} must not overlap`);
  }
  for (let i = 0; i < 30; i++) {
    const angle = i / 30 * Math.PI * 2 + .11 * Math.sin(i * 4.1);
    const radial = site.radius + 2.1 + .22 * Math.sin(i * 2.3);
    const across = Math.cos(angle) * radial, along = Math.sin(angle) * radial;
    if (inGap(across, along)) continue;
    const size = .42 + .22 * (Math.sin(i * 8.3) * .5 + .5);
    assert.ok(radial - (site.radius + .48) > .51 + size * 1.25 + .02,
      `shore rock ${i} must stay outside the block-bank footprint`);
  }
  assert.ok((site.radius - .55 + .13 + .026) < (site.radius + .48 - .51),
    'reed clumps must stay inside the block-bank footprint');
  assert.ok(.57 > .46 * Math.cos(.12) + .72 * Math.sin(.12), 'adjacent inlet stones must not overlap');
  assert.ok(1.15 > .86 * Math.cos(.09) + .68 * Math.sin(.09), 'adjacent outlet stones must not overlap');
});

test('AW-3 pool and creek water bodies have disjoint footprints and zero volume', () => {
  const { site } = surveyTownD2WestFootRiverPool();
  const pool = createTownD2WestFootRiverPool();
  const poolWater = namedMesh(pool.group, 'pool-water');
  const inletWater = namedMesh(pool.group, 'pool-inlet-water');
  const outletWater = namedMesh(pool.group, 'pool-outflow-water');
  let maximumPoolRadius = 0, minimumInletNorth = Infinity, maximumOutletNorth = -Infinity;
  for (const mesh of [poolWater, inletWater, outletWater]) {
    const position = mesh.geometry.getAttribute('position');
    let minimumY = Infinity, maximumY = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const east = position.getX(i), north = -position.getZ(i), y = position.getY(i);
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
      assert.ok(Math.abs(y - (waterHeight + .025)) < 1e-6, `${mesh.name} must share the new water surface`);
      if (mesh === poolWater) maximumPoolRadius = Math.max(maximumPoolRadius, Math.hypot(east - site.east, north - site.north));
      if (mesh === inletWater) minimumInletNorth = Math.min(minimumInletNorth, north);
      if (mesh === outletWater) maximumOutletNorth = Math.max(maximumOutletNorth, north);
    }
    assert.ok(Math.abs(maximumY - minimumY) < 1e-6, `${mesh.name} must have no water volume`);
  }
  assert.ok(maximumPoolRadius < site.radius, 'the pool footprint must end inside the ribbon tangent line');
  assert.ok(Math.abs(minimumInletNorth - (site.north + site.radius)) < 1e-6,
    'the inlet must start at the north tangent, not overlap the pool');
  assert.ok(Math.abs(maximumOutletNorth - (site.north - site.radius)) < 1e-6,
    'the outlet must start at the south tangent, not overlap the pool');
  assert.ok(minimumInletNorth - site.north - maximumPoolRadius > 0);
  assert.ok(site.north - maximumOutletNorth - maximumPoolRadius > 0);
  assert.ok(minimumInletNorth > maximumOutletNorth);
  pool.dispose();
});

test('AW-3 dispose is idempotent and releases every owned geometry/material once', () => {
  const host = new Group();
  const pool = createTownD2WestFootRiverPool();
  host.add(pool.group);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  let geometryDisposals = 0, materialDisposals = 0, textureDisposals = 0;
  pool.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => {
      materials.add(material);
      if ('map' in material && material.map instanceof Texture) textures.add(material.map);
    });
  });
  assert.equal(textures.size, 2, 'both shared water textures must be owned and released');
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => { geometryDisposals++; }));
  materials.forEach(material => material.addEventListener('dispose', () => { materialDisposals++; }));
  textures.forEach(texture => texture.addEventListener('dispose', () => { textureDisposals++; }));
  pool.dispose();
  assert.equal(pool.group.parent, null);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(textureDisposals, textures.size);
  pool.dispose();
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
  assert.equal(textureDisposals, textures.size);
});
